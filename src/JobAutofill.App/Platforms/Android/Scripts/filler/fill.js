(function () {
  const domShared = window.__domShared || {};
  const shadowRootFor = typeof domShared.shadowRootFor === 'function'
    ? domShared.shadowRootFor
    : element => element && element.shadowRoot ? element.shadowRoot : null;

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }

    return String(value).replace(/["\\]/g, '\\$&');
  }

  function resolveScopedSelector(selector) {
    if (!selector) {
      return null;
    }

    const parts = String(selector).split(' >>> ').filter(Boolean);
    let root = document;
    let element = null;

    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      if (part.startsWith('@frame(') && part.endsWith(')')) {
        const frameSelector = part.slice(7, -1);
        const frame = resolveScopedSelector(frameSelector);
        try {
          root = frame && frame.contentDocument ? frame.contentDocument : null;
          element = frame;
        } catch (error) {
          return null;
        }

        if (!root) {
          return null;
        }
        continue;
      }

      try {
        element = root.querySelector(part);
      } catch (error) {
        return null;
      }

      if (!element) {
        return null;
      }

      if (index < parts.length - 1) {
        root = shadowRootFor(element);
        if (!root) {
          return null;
        }
      }
    }

    return element;
  }

  function queryAllInElementRoot(element, selector) {
    const root = element && element.getRootNode ? element.getRootNode() : document;
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch (error) {
      return [];
    }
  }

  function collectElementsAcrossRoots(root, selector, seenRoots) {
    const seen = seenRoots || new Set();
    if (!root || seen.has(root)) {
      return [];
    }

    seen.add(root);

    let elements = [];
    try {
      elements = Array.from(root.querySelectorAll(selector));
    } catch (error) {
      elements = [];
    }

    const hosts = [];
    try {
      hosts.push.apply(hosts, Array.from(root.querySelectorAll('*')));
    } catch (error) {
      // Ignore roots that cannot be enumerated.
    }

    hosts.forEach(element => {
      const shadowRoot = shadowRootFor(element);
      if (shadowRoot) {
        elements.push.apply(elements, collectElementsAcrossRoots(shadowRoot, selector, seen));
      }
    });

    return elements;
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

  function emitInputEvents(element) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    if (typeof element.blur === 'function') {
      element.blur();
    }
  }

  function dispatchEscape(element) {
    if (!element || typeof element.dispatchEvent !== 'function') {
      return;
    }

    ['keydown', 'keyup'].forEach(type => {
      element.dispatchEvent(new KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        key: 'Escape'
      }));
    });
  }

  function blurElement(element) {
    if (element && typeof element.blur === 'function') {
      element.blur();
    }
  }

  function closeOpenPopupState(target) {
    const candidates = [];
    if (target && typeof target.dispatchEvent === 'function') {
      candidates.push(target);
    }

    const active = document.activeElement;
    if (active && active !== document.body && typeof active.dispatchEvent === 'function' && !candidates.includes(active)) {
      candidates.push(active);
    }

    document.querySelectorAll('[role="listbox"], [role="menu"], [role="grid"], [aria-expanded="true"], [aria-haspopup="listbox"], [aria-haspopup="grid"]').forEach(node => {
      if (node && typeof node.dispatchEvent === 'function' && !candidates.includes(node)) {
        candidates.push(node);
      }
    });

    candidates.forEach(candidate => {
      if (!candidate || typeof candidate.dispatchEvent !== 'function') {
        return;
      }

      try {
        candidate.dispatchEvent(new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: 'Escape'
        }));
      } catch (error) {
        // Ignore popup close errors and continue to blur the element.
      }

      try {
        if (candidate.getAttribute && candidate.getAttribute('aria-expanded') !== null) {
          candidate.setAttribute('aria-expanded', 'false');
        }
      } catch (error) {
        // Ignore attribute update errors.
      }

      if (typeof candidate.blur === 'function') {
        candidate.blur();
      }
    });

    const body = document.body || document.documentElement;
    if (body && typeof body.focus === 'function') {
      body.focus();
    }
  }

  async function clearActiveFocus(element, selectedOption) {
    await wait(120);

    closeOpenPopupState(selectedOption || element);
    dispatchEscape(selectedOption);
    blurElement(selectedOption);
    dispatchEscape(element);
    blurElement(element);
    dispatchEscape(document.activeElement);
    blurElement(document.activeElement);
    dispatchEscape(document);

    await wait(80);

    const focusSink = document.createElement('button');
    focusSink.type = 'button';
    focusSink.tabIndex = -1;
    focusSink.setAttribute('aria-hidden', 'true');
    focusSink.style.position = 'fixed';
    focusSink.style.left = '-9999px';
    focusSink.style.top = '0';
    document.body.appendChild(focusSink);
    focusSink.focus();
    closeOpenPopupState(focusSink);
    dispatchEscape(focusSink);
    focusSink.blur();
    focusSink.remove();
  }

  function dispatchMouseEvent(element, type) {
    element.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  }

  function activateElement(element) {
    dispatchMouseEvent(element, 'mousedown');
    dispatchMouseEvent(element, 'mouseup');
    element.click();
  }

  function setCheckedState(element, checked) {
    const checkedSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
    if (checkedSetter) {
      checkedSetter.call(element, checked);
    } else {
      element.checked = checked;
    }
  }

  function selectNativeChoiceOption(element) {
    if (!element || (element.type !== 'checkbox' && element.type !== 'radio')) {
      return false;
    }

    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    element.focus();

    if (!element.checked) {
      activateElement(element);
    }

    if (!element.checked) {
      setCheckedState(element, true);
      emitInputEvents(element);
    } else {
      emitInputEvents(element);
    }

    return element.checked;
  }

  function wait(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;

    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
      return;
    }

    if (valueSetter) {
      valueSetter.call(element, value);
      return;
    }

    element.value = value;
  }

  function setContentEditableText(element, value) {
    element.focus();

    try {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('delete', false);
      document.execCommand('insertText', false, String(value));
    } catch (error) {
      element.textContent = String(value);
    }

    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: String(value)
    }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
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

  async function applyValue(selector, value, fillStrategy) {
    if (!selector || value === null || value === undefined || value === '') {
      return result(false, selector, value, 'Missing selector or value.');
    }

    const element = resolveScopedSelector(selector);
    if (!element) {
      return result(false, selector, value, 'Element not found.');
    }

    const normalizedValue = String(value).toLowerCase();

    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    element.focus();

    if (element.type === 'file') {
      return result(false, selector, value, 'File inputs cannot be filled by browser JavaScript.', element);
    }

    if (fillStrategy === 'setContentEditableText' || element.isContentEditable) {
      setContentEditableText(element, value);
      clearActiveFocus(element);
      return result(true, selector, value, 'Contenteditable field filled.', element);
    }

    // Use fillStrategy if provided to determine behavior
    if (fillStrategy === 'setNativeSelectValue' || element.tagName === 'SELECT') {
      const options = Array.from(element.options);
      
      // First pass: exact match on value or text
      let match = options.find(option => {
        const optionValue = option.value.toLowerCase();
        const optionText = option.text.toLowerCase();
        return optionValue === normalizedValue || optionText === normalizedValue;
      });

      // Second pass: case-insensitive word boundary match (text starts with value)
      if (!match) {
        match = options.find(option => {
          const optionText = option.text.toLowerCase();
          return optionText && normalizedValue && optionText.startsWith(normalizedValue);
        });
      }

      // Third pass: value contains text (for shortened search terms)
      if (!match) {
        match = options.find(option => {
          const optionValue = option.value.toLowerCase();
          return optionValue && normalizedValue && optionValue.includes(normalizedValue) && normalizedValue.length > 2;
        });
      }

      if (!match) {
        return result(false, selector, value, 'No matching select option.', element);
      }

      // Try to set the value, emit events, then verify it actually stuck
      // (websites may have onChange handlers that reset the value)
      setNativeValue(element, match.value);
      emitInputEvents(element);
      
      // Verify the value was actually set (website may reset it)
      const actualValue = String(element.value || '').trim();
      const expectedValue = String(match.value || '').trim();
      if (actualValue !== expectedValue) {
        // Value was reset by website's JavaScript, try once more after a small delay
        await wait(50);
        setNativeValue(element, match.value);
        emitInputEvents(element);
      }
      
      clearActiveFocus(element);
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
      await clearActiveFocus(element);
      return typed
        ? result(true, selector, value, 'Editable combobox filled by typing.', element)
        : result(false, selector, value, 'Editable combobox value did not stick after typing.', element);
    }

    if (fillStrategy === 'setChecked' || element.type === 'checkbox') {
      const checkedSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
      const nextChecked = ['yes', 'true', '1', 'on'].includes(normalizedValue);
      if (checkedSetter) {
        checkedSetter.call(element, nextChecked);
      } else {
        element.checked = nextChecked;
      }
      emitInputEvents(element);
      clearActiveFocus(element);
      return result(true, selector, value, 'Checkbox filled.', element);
    }

    if (fillStrategy === 'clickMatchingRadio' || element.type === 'radio') {
      const radios = queryAllInElementRoot(element, 'input[type="radio"][name="' + cssEscape(element.name) + '"]');
      const radio = radios.find(item => {
        const radioValue = item.value.toLowerCase();
        const radioLabel = item.labels && item.labels.length ? item.labels[0].textContent.trim().toLowerCase() : '';
        return radioValue === normalizedValue ||
          radioLabel === normalizedValue ||
          (radioValue && normalizedValue.includes(radioValue)) ||
          (radioLabel && normalizedValue.includes(radioLabel));
      });

      if (!radio) {
        return result(false, selector, value, 'No matching radio option.', element);
      }

      const checkedSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
      if (checkedSetter) {
        checkedSetter.call(radio, true);
      } else {
        radio.checked = true;
      }
      emitInputEvents(radio);
      clearActiveFocus(radio);
      return result(true, selector, value, 'Radio filled.', radio);
    }

    setNativeValue(element, value);
    emitInputEvents(element);
    clearActiveFocus(element);
    return result(true, selector, value, 'Field filled.', element);
  }

  function optionValue(option) {
    if (!option) {
      return '';
    }

    return option.value || option.Value || '';
  }

  function optionSelector(option) {
    if (!option) {
      return '';
    }

    return option.selector || option.Selector || '';
  }

  function optionLabel(option) {
    if (!option) {
      return '';
    }

    return option.label || option.Label || option.value || option.Value || '';
  }

  function optionFillText(option) {
    return optionLabel(option) || optionValue(option);
  }

  function optionPosition(option) {
    if (!option) {
      return -1;
    }

    const value = option.position === undefined ? option.Position : option.position;
    const number = Number(value);
    return Number.isInteger(number) ? number : -1;
  }

  function optionSource(option) {
    if (!option) {
      return '';
    }

    return option.source || option.Source || '';
  }

  function optionFillMethod(option) {
    if (!option) {
      return '';
    }

    return option.fillMethod || option.FillMethod || '';
  }

  function normalizedOptionText(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function optionSearchTexts(option) {
    return Array.from(new Set([
      optionLabel(option),
      optionValue(option),
      optionFillText(option)
    ].map(normalizedOptionText).filter(Boolean)));
  }

  function visibleOptionText(item) {
    return normalizedOptionText(item && (item.textContent || item.getAttribute('aria-label') || ''));
  }

  function visibleOptionValue(item) {
    return normalizedOptionText(item && (item.getAttribute('value') || item.getAttribute('data-value') || ''));
  }

  function optionTokens(value) {
    return normalizedOptionText(value)
      .split(/[^a-z0-9]+/)
      .filter(token => token.length >= 2);
  }

  function tokenOverlapScore(left, right) {
    const leftTokens = optionTokens(left);
    const rightTokens = optionTokens(right);
    if (leftTokens.length === 0 || rightTokens.length === 0) {
      return 0;
    }

    const rightSet = new Set(rightTokens);
    const overlap = leftTokens.filter(token => rightSet.has(token)).length;
    return overlap / Math.max(leftTokens.length, rightTokens.length);
  }

  function visibleOptionScore(item, option) {
    const targetTexts = optionSearchTexts(option);
    const candidateTexts = [visibleOptionText(item), visibleOptionValue(item)].filter(Boolean);
    if (targetTexts.length === 0 || candidateTexts.length === 0) {
      return 0;
    }

    let best = 0;
    targetTexts.forEach(target => {
      candidateTexts.forEach(candidate => {
        if (candidate === target) {
          best = Math.max(best, 1);
          return;
        }

        const shorterLength = Math.min(candidate.length, target.length);
        if (shorterLength >= 4 && (candidate.startsWith(target) || target.startsWith(candidate))) {
          best = Math.max(best, 0.92);
          return;
        }

        if (shorterLength >= 4 && (candidate.includes(target) || target.includes(candidate))) {
          best = Math.max(best, 0.82);
          return;
        }

        best = Math.max(best, tokenOverlapScore(candidate, target));
      });
    });

    return best;
  }

  function searchQueryCandidates(option) {
    const raw = optionFillText(option);
    const normalized = normalizedOptionText(raw);
    if (!normalized) {
      return [];
    }

    const words = normalized.split(/\s+/).filter(Boolean);
    const compact = normalized.replace(/[^a-z0-9]/g, '');
    const candidates = [
      normalized,
      normalized.split(/[,;\n]/)[0],
      words.slice(0, 4).join(' '),
      words.slice(0, 3).join(' '),
      compact.slice(0, 4),
      compact.slice(0, 3),
      compact.slice(0, 2)
    ]
      .map(value => normalizedOptionText(value))
      .filter(value => value.length >= 2);

    return Array.from(new Set(candidates));
  }

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
      'spl-option',
      'spl-dropdown-option',
      'spl-autocomplete-option',
      '[class*="c-spl-option"]',
      '[class*="c-spl-dropdown-option"]',
      '[class*="c-spl-autocomplete-option"]',
      '[class*="option"]',
      '[class*="Option"]',
      '[class*="suggestion"]',
      '[class*="Suggestion"]'
    ].join(', ');

    return collectElementsAcrossRoots(document, selector)
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
    const controls = element.closest('[role="combobox"], [aria-haspopup], .select, .select__control, .react-select__control');
    const fieldRoot = element.closest('.field, .application-question');

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
    const actions = [
      target => activateElement(target),
      target => target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'ArrowDown' }))
    ];

    const targets = openTargetsFor(element);
    for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
      const target = targets[targetIndex];
      for (let actionIndex = 0; actionIndex < actions.length; actionIndex++) {
        actionIndex === 0 && target.focus && target.focus();
        actions[actionIndex](target);
        await wait(120);

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

    setNativeValue(element, '');
    emitInputEvents(element);
    await wait(80);
    setNativeValue(element, query);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(180);
    return true;
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
        activateElement(visibleOption);
        emitInputEvents(element);
        return true;
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
    emitInputEvents(element);

    return String(element.value || '').trim().toLowerCase() === value.trim().toLowerCase();
  }

  function findVisibleOption(option, settings) {
    const options = settings || {};
    const popupOptions = visiblePopupOptions();
    const minimumScore = typeof options.minimumScore === 'number' ? options.minimumScore : 1;
    const value = normalizedOptionText(optionValue(option));
    const label = normalizedOptionText(optionLabel(option));
    const textMatch = popupOptions.find(item => {
      const text = visibleOptionText(item);
      const itemValue = visibleOptionValue(item);
      return text === label || text === value || itemValue === value || itemValue === label;
    });

    if (textMatch) {
      return textMatch;
    }

    const scoredMatch = popupOptions
      .map(item => ({ item, score: visibleOptionScore(item, option) }))
      .filter(candidate => candidate.score >= minimumScore)
      .sort((left, right) => right.score - left.score)[0];
    if (scoredMatch) {
      return scoredMatch.item;
    }

    if (options.allowVerifiedPosition) {
      const position = optionPosition(option);
      if (position >= 0 && position < popupOptions.length && popupOptions.every(isStructuredPopupOption)) {
        const positioned = popupOptions[position];
        if (visibleOptionScore(positioned, option) >= minimumScore) {
          return positioned;
        }
      }
    }

    return null;
  }

  function matchesSelectedOption(item, option) {
    if (!item || !option) {
      return false;
    }

    const targetText = visibleOptionText(item);
    const targetValue = visibleOptionValue(item);
    const expectedText = normalizedOptionText(optionLabel(option));
    const expectedValue = normalizedOptionText(optionValue(option));

    return targetText === expectedText ||
      targetText === expectedValue ||
      targetValue === expectedText ||
      targetValue === expectedValue;
  }

  function isStructuredPopupOption(item) {
    return item.getAttribute('role') === 'option' ||
      item.getAttribute('role') === 'menuitem' ||
      item.closest('[role="listbox"], [role="menu"], [role="grid"]') !== null;
  }

  async function applyOption(selector, option, fillStrategy) {
    const value = optionFillText(option);
    const capturedOptionSelector = optionSelector(option);

    if (!selector || !value) {
      return result(false, selector, value, 'Missing selector or option value.');
    }

    const element = resolveScopedSelector(selector);
    const capturedOption = capturedOptionSelector ? resolveScopedSelector(capturedOptionSelector) : null;
    if (!element && capturedOption && matchesSelectedOption(capturedOption, option)) {
      if (capturedOption.type === 'checkbox' || capturedOption.type === 'radio') {
        const selected = selectNativeChoiceOption(capturedOption);
        return selected
          ? result(true, selector, value, 'Native choice option selected without field root.', capturedOption)
          : result(false, selector, value, 'Native choice option did not become selected.', capturedOption);
      }

      activateElement(capturedOption);
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
      await clearActiveFocus(element, capturedOption);
      return selected
        ? result(true, selector, value, 'Native choice option selected.', capturedOption)
        : result(false, selector, value, 'Native choice option did not become selected.', capturedOption);
    }

    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    element.focus();

    const optionToClick = (capturedOption && matchesSelectedOption(capturedOption, option))
      ? capturedOption
      : await openPicker(element, option);
    if (optionToClick) {
      activateElement(optionToClick);
      emitInputEvents(element);
      await clearActiveFocus(element, optionToClick);
      return result(true, selector, value, 'Captured option clicked.', element);
    }

    if (element.getAttribute('role') === 'combobox' || element.getAttribute('aria-haspopup')) {
      const typed = await selectByTyping(element, option);
      if (typed) {
        await clearActiveFocus(element);
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
    closeOpenPopupState(document.activeElement || document.body);
    const active = document.activeElement;
    if (active && typeof active.blur === 'function') {
      active.blur();
    }

    const body = document.body || document.documentElement;
    if (body && typeof body.focus === 'function') {
      body.focus();
    }

    return true;
  };

  window.__fillField = function (selector, value, fillStrategy) {
    try {
      return Promise.resolve(applyValue(selector, value, fillStrategy))
        .finally(function () {
          window.__clearActiveFillState();
        });
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
  };

  window.__fillFieldOption = function (selector, option, fillStrategy) {
    try {
      return Promise.resolve(applyOption(selector, option, fillStrategy))
        .finally(function () {
          window.__clearActiveFillState();
        });
    } catch (error) {
      window.__clearActiveFillState();
      return {
        ok: false,
        selector,
        value: optionValue(option),
        fillStrategy,
        message: error && error.stack ? error.stack : String(error)
      };
    }
  };
})();
