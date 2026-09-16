(function () {
  'use strict';

  const dom = window.__domShared || {};
  const optionHandling = window.__optionHandling || {};
  const siteRules = window.__jobAutofillSiteRules || {};

  const REQUIRED_DOM_APIS = [
    'resolveScopedSelector', 'queryAllInElementRoot', 'collectElementsAcrossRoots',
    'emitInputEvents', 'dispatchEscape', 'blurElement', 'closeOpenPopupState',
    'clearActiveFocus', 'activateElement', 'setCheckedState', 'wait',
    'setNativeValue', 'setContentEditableText', 'cssEscape'
  ];

  const missingDomApis = REQUIRED_DOM_APIS.filter(name => typeof dom[name] !== 'function');
  if (missingDomApis.length) {
    throw new Error('fill.js requires shared runtime APIs: ' + missingDomApis.join(', '));
  }

  function describe(element) {
    return {
      tag: element.tagName,
      type: element.type || '',
      name: element.name || '',
      id: element.id || '',
      before: element.type === 'checkbox' || element.type === 'radio' ? String(element.checked) : String(element.value || '')
    };
  }

  function result(ok, selector, value, message, element) {
    const details = element ? describe(element) : {};
    if (element) {
      details.after = element.type === 'checkbox' || element.type === 'radio' ? String(element.checked) : String(element.value || '');
    }

    return {
      ok,
      selector,
      value,
      message,
      details
    };
  }

  function focusElement(element) {
    if (!element) {
      return;
    }

    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    if (typeof element.focus === 'function') {
      element.focus();
    }
  }

  function runFillOperation(selector, value, fillStrategy, action) {
    try {
      return Promise.resolve(action())
        .finally(function () { window.__clearActiveFillState(); });
    } catch (error) {
      window.__clearActiveFillState();
      return {
        ok: false,
        selector,
        value,
        fillStrategy,
        message: error && error.stack ? error.stack : String(error)
      };
    }
  }

  function selectNativeChoiceOption(element) {
    if (!element || (element.type !== 'checkbox' && element.type !== 'radio')) {
      return false;
    }

    focusElement(element);

    if (!element.checked) {
      dom.activateElement(element);
    }

    if (!element.checked) {
      dom.setCheckedState(element, true);
      dom.emitInputEvents(element);
    } else {
      dom.emitInputEvents(element);
    }

    return element.checked;
  }

  async function applyValue(selector, value, fillStrategy) {
    if (!selector || value === null || value === undefined || value === '') {
      return result(false, selector, value, 'Missing selector or value.');
    }

    const element = dom.resolveScopedSelector(selector);
    if (!element) {
      return result(false, selector, value, 'Element not found.');
    }

    const normalizedValue = optionHandling.normalize(value);

    focusElement(element);

    if (element.type === 'file') {
      return result(false, selector, value, 'File inputs cannot be filled by browser JavaScript.', element);
    }

    if (fillStrategy === 'setContentEditableText' || element.isContentEditable) {
      dom.setContentEditableText(element, value);
      dom.clearActiveFocus(element);
      return result(true, selector, value, 'Contenteditable field filled.', element);
    }

    // Use fillStrategy if provided to determine behavior
    if (fillStrategy === 'setNativeSelectValue' || element.tagName === 'SELECT') {
      const match = optionHandling.findNativeSelectOption(element.options, value);


      if (!match) {
        return result(false, selector, value, 'No matching select option.', element);
      }

      // Try to set the value, emit events, then verify it actually stuck
      // (websites may have onChange handlers that reset the value)
      dom.setNativeValue(element, match.value);
      dom.emitInputEvents(element);
      
      // Verify the value was actually set (website may reset it)
      const actualValue = String(element.value || '').trim();
      const expectedValue = String(match.value || '').trim();
      if (actualValue !== expectedValue) {
        // Value was reset by website's JavaScript, try once more after a small delay
        await dom.wait(50);
        dom.setNativeValue(element, match.value);
        dom.emitInputEvents(element);
      }
      
      dom.clearActiveFocus(element);
      return result(true, selector, value, 'Select filled.', element);
    }

    if (element.getAttribute('role') === 'combobox' || element.getAttribute('aria-haspopup') === 'listbox') {
      const typed = await selectByTyping(element, {
        value,
        label: value,
        fillMethod: 'typeText',
        selected: false,
        position: 0
      });
      await dom.clearActiveFocus(element);
      return typed
        ? result(true, selector, value, 'Editable combobox filled by typing.', element)
        : result(false, selector, value, 'Editable combobox value did not stick after typing.', element);
    }

    if (fillStrategy === 'setChecked' || element.type === 'checkbox') {
      const nextChecked = ['yes', 'true', '1', 'on'].includes(normalizedValue);
      dom.setCheckedState(element, nextChecked);
      dom.emitInputEvents(element);
      dom.clearActiveFocus(element);
      return result(true, selector, value, 'Checkbox filled.', element);
    }

    if (fillStrategy === 'clickMatchingRadio' || element.type === 'radio') {
      const radios = dom.queryAllInElementRoot(element, 'input[type="radio"][name="' + dom.cssEscape(element.name) + '"]');
      const radio = optionHandling.findRadio(radios, value);

      if (!radio) {
        return result(false, selector, value, 'No matching radio option.', element);
      }

      dom.setCheckedState(radio, true);
      dom.emitInputEvents(radio);
      dom.clearActiveFocus(radio);
      return result(true, selector, value, 'Radio filled.', radio);
    }

    dom.setNativeValue(element, value);
    dom.emitInputEvents(element);
    dom.clearActiveFocus(element);
    return result(true, selector, value, 'Field filled.', element);
  }

  const optionValue = optionHandling.optionValue;
  const optionLabel = optionHandling.optionLabel;
  const optionSelector = optionHandling.optionSelector;
  const optionFillText = optionHandling.optionFillText;
  const optionSource = optionHandling.optionSource;
  const optionFillMethod = optionHandling.optionFillMethod;
  const searchQueryCandidates = optionHandling.searchQueryCandidates;

  function visiblePopupOptions() {
    const selector = [
      '[role="listbox"] [role="option"]',
      '[role="option"]',
      '[role="menu"] [role="menuitem"]',
      '[role="menuitem"]',
      '[role="grid"] [role="row"]',
      '[role="grid"] [role="gridcell"]',
      '[role="listbox"] [data-value]',
      '[role="menu"] [data-value]',
      '[role="grid"] [data-value]',
      '[class*="option"]',
      '[class*="Option"]',
      '[class*="suggestion"]',
      '[class*="Suggestion"]'
    ].concat(Array.isArray(siteRules.filling?.popupOptionSelectors)
      ? siteRules.filling.popupOptionSelectors
      : []).join(', ');

    return dom.collectElementsAcrossRoots(document, selector)
      .filter(item => {
        const style = window.getComputedStyle(item);
        const rect = item.getBoundingClientRect();
        return style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0 &&
          String(item.textContent || item.getAttribute('aria-label') || '').trim();
      });
  }

  function openTargetsFor(element) {
    const targets = [element];
    const controlSelectors = ['[role="combobox"]', '[aria-haspopup]']
      .concat(Array.isArray(siteRules.options?.localRootSelectors) ? siteRules.options.localRootSelectors : [])
      .concat(Array.isArray(siteRules.filling?.controlRootSelectors) ? siteRules.filling.controlRootSelectors : []);
    const controls = element.closest(controlSelectors.join(', '));
    const fieldRootSelectors = ['.field', '.application-question']
      .concat(Array.isArray(siteRules.filling?.fieldRootSelectors) ? siteRules.filling.fieldRootSelectors : []);
    const fieldRoot = element.closest(fieldRootSelectors.join(', '));

    if (controls && !targets.includes(controls)) {
      targets.push(controls);
    }

    if (fieldRoot) {
      Array.from(fieldRoot.querySelectorAll('button, [role="button"], [aria-haspopup], [role="combobox"], input'))
        .forEach(target => {
          if (!targets.includes(target)) {
            targets.push(target);
          }
        });
    }

    return targets.filter(target => target && typeof target.dispatchEvent === 'function');
  }

  async function openPicker(element, option) {
    const configuredActions = Array.isArray(siteRules.filling?.openActions)
      ? siteRules.filling.openActions
      : [];
    const actionNames = configuredActions.length > 0 ? configuredActions : ['activate', 'arrowDown'];
    const actions = actionNames.map(name => name === 'activate'
      ? target => dom.activateElement(target)
      : name === 'arrowDown'
        ? target => target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown' }))
        : null).filter(Boolean);

    const targets = openTargetsFor(element);
    for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
      const target = targets[targetIndex];
      for (let actionIndex = 0; actionIndex < actions.length; actionIndex++) {
        actionIndex === 0 && target.focus && target.focus();
        actions[actionIndex](target);
        await dom.wait(120);

        const visibleOption = findVisibleOption(option);
        if (visibleOption) {
          return visibleOption;
        }
      }
    }

    return null;
  }

  async function typeSearchQuery(element, query) {
    if (!query || element.tagName === 'SELECT') {
      return false;
    }

    dom.setNativeValue(element, '');
    dom.emitInputEvents(element);
    await dom.wait(80);
    dom.setNativeValue(element, query);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await dom.wait(180);
    return true;
  }

  function selectionMatches(element, option, optionElement) {
    const expected = [optionValue(option), optionLabel(option), optionFillText(option)]
      .map(optionHandling.normalize)
      .filter(Boolean);
    const matches = value => expected.includes(optionHandling.normalize(value));
    if (matches(element.value) || matches(element.getAttribute('aria-valuetext'))) return true;
    if (optionElement && (optionElement.getAttribute('aria-selected') === 'true' || optionElement.checked === true)) return true;

    let current = element;
    for (let depth = 0; current && depth < 4; depth++, current = current.parentElement) {
      const text = optionHandling.normalize(current.textContent);
      if (text && expected.some(value => text === value || text.length <= value.length + 24 && text.includes(value))) return true;
    }
    return false;
  }

  async function selectByTyping(element, option) {
    const value = optionFillText(option);
    if (!value || element.tagName === 'SELECT') {
      return false;
    }

    const queries = searchQueryCandidates(option);
    for (let index = 0; index < queries.length; index++) {
      await typeSearchQuery(element, queries[index]);

      const visibleOption = findVisibleOption(option, {
        allowVerifiedPosition: true,
        minimumScore: 0.72
      });
      if (visibleOption) {
        dom.activateElement(visibleOption);
        dom.emitInputEvents(element);
        await dom.wait(80);
        return selectionMatches(element, option, visibleOption);
      }

      if (visiblePopupOptions().length === 0) {
        continue;
      }
    }

    if (visiblePopupOptions().length > 0) {
      return false;
    }

    element.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Enter'
    }));
    element.dispatchEvent(new KeyboardEvent('keyup', {
      bubbles: true,
      cancelable: true,
      key: 'Enter'
    }));
    dom.emitInputEvents(element);

    return String(element.value || '').trim().toLowerCase() === value.trim().toLowerCase();
  }

  function findVisibleOption(option, settings) {
    return optionHandling.findBestVisibleOption(visiblePopupOptions(), option, settings);
  }

  const matchesSelectedOption = optionHandling.matchesSelectedOption;

  async function applyOption(selector, option, fillStrategy) {
    const value = optionFillText(option);
    const capturedOptionSelector = optionSelector(option);

    if (!selector || !value) {
      return result(false, selector, value, 'Missing selector or option value.');
    }

    const element = dom.resolveScopedSelector(selector);
    const capturedOption = capturedOptionSelector ? dom.resolveScopedSelector(capturedOptionSelector) : null;
    if (!element && capturedOption && matchesSelectedOption(capturedOption, option)) {
      if (capturedOption.type === 'checkbox' || capturedOption.type === 'radio') {
        const selected = selectNativeChoiceOption(capturedOption);
        return selected
          ? result(true, selector, value, 'Native choice option selected without field root.', capturedOption)
          : result(false, selector, value, 'Native choice option did not become selected.', capturedOption);
      }

      dom.activateElement(capturedOption);
      return result(true, selector, value, 'Captured option clicked without field root.', capturedOption);
    }

    if (!element) {
      return result(false, selector, value, 'Element not found.');
    }

    if (element.tagName === 'SELECT' || fillStrategy === 'setNativeSelectValue') {
      return await applyValue(selector, value, fillStrategy);
    }

    if (capturedOption && (capturedOption.type === 'checkbox' || capturedOption.type === 'radio')) {
      const selected = selectNativeChoiceOption(capturedOption);
      await dom.clearActiveFocus(element, capturedOption);
      return selected
        ? result(true, selector, value, 'Native choice option selected.', capturedOption)
        : result(false, selector, value, 'Native choice option did not become selected.', capturedOption);
    }

    focusElement(element);

    const optionToClick = (capturedOption && matchesSelectedOption(capturedOption, option))
      ? capturedOption
      : await openPicker(element, option);
    if (optionToClick) {
      dom.activateElement(optionToClick);
      dom.emitInputEvents(element);
      await dom.wait(80);
      const verified = selectionMatches(element, option, optionToClick);
      await dom.clearActiveFocus(element, optionToClick);
      return verified
        ? result(true, selector, value, 'Captured option selected and verified.', element)
        : result(false, selector, value, 'Option interaction completed but the selected value could not be verified.', element);
    }

    if (element.getAttribute('role') === 'combobox' || element.getAttribute('aria-haspopup')) {
      const typed = await selectByTyping(element, option);
      if (typed) {
        await dom.clearActiveFocus(element);
        return result(true, selector, value, 'Captured option selected by editable combobox text.', element);
      }
    }

    element.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Escape'
    }));
    element.blur();

    if (element.getAttribute('role') === 'combobox' || element.getAttribute('aria-haspopup') === 'listbox') {
      return result(false, selector, value, 'Captured option was not visible after opening picker. Source: ' + optionSource(option) + '. Fill method: ' + optionFillMethod(option) + '.', element);
    }

    return await applyValue(selector, value);
  }

  window.__clearActiveFillState = function () {
    dom.closeOpenPopupState(document.activeElement || document.body);
    dom.blurElement(document.activeElement);
    return true;
  };

  window.__fillField = function (selector, value, fillStrategy) {
    return runFillOperation(selector, value, fillStrategy, function () {
      return applyValue(selector, value, fillStrategy);
    });
  };

  window.__fillFieldOption = function (selector, option, fillStrategy) {
    return runFillOperation(selector, optionValue(option), fillStrategy, function () {
      return applyOption(selector, option, fillStrategy);
    });
  };
})();
