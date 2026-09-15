(function (global) {
  'use strict';

  const OPTION_ROOT_SELECTOR = [
    '[role="listbox"]',
    '[role="menu"]',
    '[role="grid"]'
  ].join(', ');

  const OPTION_ITEM_SELECTOR = [
    '[role="option"]',
    'option',
    '[role="menuitem"]',
    '[role="grid"] [role="row"]',
    '[role="grid"] [role="gridcell"]',
    '[role="listbox"] [data-value]',
    '[role="menu"] [data-value]',
    '[role="grid"] [data-value]'
  ].join(', ');

  const FALLBACK_OPTION_ITEM_SELECTOR = [
    '[role="option"]',
    'option',
    '[role="menuitem"]',
    '[role="row"]',
    '[role="gridcell"]',
    '[data-value]',
    'li',
    'button',
    '[role="button"]',
    '[class*="option"]',
    '[class*="Option"]',
    '[class*="item"]',
    '[class*="Item"]',
    '[class*="result"]',
    '[class*="Result"]',
    '[class*="suggestion"]',
    '[class*="Suggestion"]',
    '[data-testid*="option"]',
    '[data-test-id*="option"]'
  ].join(', ');

  const FALLBACK_POPUP_CONTAINER_SELECTOR = [
    '[role="listbox"]',
    '[role="menu"]',
    '[role="grid"]',
    '[id^="menu-"]',
    '[id*="listbox"]',
    '[id*="dropdown"]',
    '[class*="listbox"]',
    '[class*="Listbox"]',
    '[class*="menu"]',
    '[class*="Menu"]',
    '[class*="dropdown"]',
    '[class*="Dropdown"]',
    '[class*="autocomplete"]',
    '[class*="Autocomplete"]',
    '[class*="suggestions"]',
    '[class*="Suggestions"]',
    '[class*="popover"]',
    '[class*="Popover"]'
  ].join(', ');

  function uniqueOptions(options, normalize, maxOptionsPerField) {
    const seen = new Set();
    const unique = (options || []).filter(option => {
      const key = normalize(option.value) + '|' + normalize(option.label);
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    }).map((option, index) => {
      option.position = index;
      return option;
    });

    const limit = typeof maxOptionsPerField === 'number' ? maxOptionsPerField : 300;
    const limited = unique.slice(0, limit);
    limited.optionsTruncated = unique.length > limit;
    limited.totalOptionsCount = unique.length;
    return limited;
  }

  function createOptionSourceHandlers(deps) {
    const options = deps || {};
    const normalize = options.normalize;
    const isVisible = options.isVisible;
    const selectorFor = options.selectorFor;
    const cssEscape = options.cssEscape;
    const closePopup = options.closePopup;
    const collectElementsAcrossRoots = options.collectElementsAcrossRoots;
    const composedClosest = options.composedClosest;
    const optionFromElement = options.optionFromElement;
    const optionTextFor = options.optionTextFor;
    const isOptionText = options.isOptionText;
    const nonApplicationControlReason = options.nonApplicationControlReason;
    const namedChoiceOptions = options.namedChoiceOptions;
    const elementRootById = options.elementRootById;
    const gridOptionFromElement = options.gridOptionFromElement;
    const waitForOptions = options.waitForOptions;
    const runExtractionActionsUntilOptions = options.runExtractionActionsUntilOptions;
    const waitForLateRenderedOptions = options.waitForLateRenderedOptions;
    const maxOptionsPerField = options.maxOptionsPerField;
    const siteRules = global.__jobAutofillSiteRules || {};

    function toUniqueOptions(items) {
      return uniqueOptions(items, normalize, maxOptionsPerField);
    }

    function isInteractiveOptionCandidate(element) {
      if (!element || !isVisible(element)) {
        return false;
      }

      const text = optionTextFor(element);
      if (!isOptionText(text)) {
        return false;
      }

      const tag = element.tagName ? element.tagName.toLowerCase() : '';
      const role = normalize(element.getAttribute('role'));
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        return false;
      }

      return tag === 'option' ||
        tag === 'li' ||
        tag === 'button' ||
        role === 'option' ||
        role === 'menuitem' ||
        role === 'row' ||
        role === 'gridcell' ||
        role === 'button' ||
        Boolean(element.getAttribute('data-value')) ||
        /(?:^|\s)(?:option|item|result|suggestion)(?:\s|$)/i.test(String(element.className || '')) ||
        /option/i.test(element.getAttribute('data-testid') || '') ||
        /option/i.test(element.getAttribute('data-test-id') || '');
    }

    function optionCandidateElementsFrom(root, allowScopedFallback) {
      if (!root) {
        return [];
      }

      const configuredSelectors = Array.isArray(siteRules.options?.optionSelectors)
        ? siteRules.options.optionSelectors
        : [];
      const strictSelector = [OPTION_ITEM_SELECTOR].concat(configuredSelectors).join(', ');
      const hook = siteRules.hooks?.extractOptionElements;
      const hookElements = typeof hook === 'function'
        ? hook(root, { allowScopedFallback: Boolean(allowScopedFallback) })
        : [];
      const strict = collectElementsAcrossRoots(root, strictSelector)
        .concat(Array.isArray(hookElements) ? hookElements : [])
        .filter(isVisible)
        .filter(option => isOptionText(optionTextFor(option)));
      if (strict.length > 0 || !allowScopedFallback) {
        return strict;
      }

      return collectElementsAcrossRoots(root, FALLBACK_OPTION_ITEM_SELECTOR)
        .filter(isInteractiveOptionCandidate)
        .filter(candidate => !collectElementsAcrossRoots(candidate, FALLBACK_OPTION_ITEM_SELECTOR)
          .some(child => child !== candidate && isInteractiveOptionCandidate(child) && optionTextFor(candidate).includes(optionTextFor(child))));
    }

    function visibleListboxOptionsFrom(root) {
      if (!root) {
        return [];
      }

      return toUniqueOptions(optionCandidateElementsFrom(root, true)
        .map(option => optionFromElement(option, selectorFor(option), option.getAttribute('aria-selected') === 'true'))
        .filter(Boolean));
    }

    function controlledPopupIds(element) {
      return ['aria-controls', 'aria-owns']
        .map(name => element.getAttribute(name) || '')
        .join(' ')
        .split(/\s+/)
        .filter(Boolean);
    }

    function controlledPopupRoots(element) {
      return controlledPopupIds(element)
        .map(id => elementRootById(element, id))
        .filter(Boolean);
    }

    function associatedListboxRoots(element) {
      const roots = controlledPopupRoots(element)
        .filter(root => isVisible(root) || optionCandidateElementsFrom(root, false).length > 0);

      const localRootSelectors = ['[role="combobox"]', '[aria-haspopup]', '.form-field', '.form-group']
        .concat(Array.isArray(siteRules.options?.localRootSelectors) ? siteRules.options.localRootSelectors : []);
      const localRoot = composedClosest(element, localRootSelectors.join(', '));
      if (localRoot) {
        const localListbox = collectElementsAcrossRoots(localRoot, OPTION_ROOT_SELECTOR + ', ' + OPTION_ITEM_SELECTOR)
          .find(isVisible);
        if (localListbox) {
          roots.push(localListbox.matches(OPTION_ROOT_SELECTOR) ? localListbox : localListbox.parentElement);
        }
      }

      return Array.from(new Set(roots.filter(Boolean)));
    }

    function visibleOptionKey(option) {
      return [
        optionTextFor(option),
        option.getAttribute('aria-label'),
        option.getAttribute('value'),
        option.getAttribute('data-value'),
        selectorFor(option)
      ].map(value => String(value || '').trim()).join('|');
    }

    function reactSelectOptionPrefixFor(element) {
      const id = element && element.id ? String(element.id).trim() : '';
      const optionIdPrefix = String(siteRules.options?.optionIdPrefix || '');
      return id && optionIdPrefix ? optionIdPrefix + id + '-option-' : '';
    }

    function visibleReactSelectOptionsFor(element) {
      const prefix = reactSelectOptionPrefixFor(element);
      if (!prefix) {
        return [];
      }

      return toUniqueOptions(collectElementsAcrossRoots(document, '[id^="' + cssEscape(prefix) + '"]')
        .filter(isVisible)
        .filter(option => isInteractiveOptionCandidate(option) || normalize(option.getAttribute('role')) === 'option')
        .map(option => optionFromElement(option, selectorFor(option), option.getAttribute('aria-selected') === 'true'))
        .filter(Boolean));
    }

    function visibleGlobalListboxOptions(excludedOptionKeys) {
      return toUniqueOptions(collectElementsAcrossRoots(document, OPTION_ITEM_SELECTOR)
        .filter(isVisible)
        .filter(option => !excludedOptionKeys || !excludedOptionKeys.has(visibleOptionKey(option)))
        .map(option => optionFromElement(option, selectorFor(option), option.getAttribute('aria-selected') === 'true'))
        .filter(Boolean));
    }

    function visiblePopupContainersFor(element) {
      const roots = controlledPopupRoots(element);

      const popupSelectors = Array.isArray(siteRules.options?.popupSelectors)
        ? siteRules.options.popupSelectors
        : [];
      roots.push.apply(roots, collectElementsAcrossRoots(
        document,
        [FALLBACK_POPUP_CONTAINER_SELECTOR].concat(popupSelectors).join(', '))
        .filter(isVisible)
        .filter(root => !nonApplicationControlReason(root)));

      return Array.from(new Set(roots.filter(Boolean)))
        .filter(root => {
          const rect = root.getBoundingClientRect();
          return rect.width >= 80 && rect.height >= 16;
        });
    }

    function fallbackPopupTextOptionsFor(element, excludedOptionKeys) {
      const roots = visiblePopupContainersFor(element);
      const candidates = [];

      roots.forEach(root => {
        const structured = optionCandidateElementsFrom(root, true);
        if (structured.length > 0) {
          candidates.push.apply(candidates, structured);
          return;
        }

        collectElementsAcrossRoots(root, '*')
          .filter(isVisible)
          .filter(candidate => {
            const tag = candidate.tagName ? candidate.tagName.toLowerCase() : '';
            if (['input', 'textarea', 'select', 'script', 'style', 'svg', 'path'].includes(tag)) {
              return false;
            }

            const text = optionTextFor(candidate);
            if (!isOptionText(text)) {
              return false;
            }

            const childWithSameText = Array.from(candidate.children || [])
              .some(child => isVisible(child) && optionTextFor(child) === text);
            return !childWithSameText;
          })
          .forEach(candidate => candidates.push(candidate));
      });

      return toUniqueOptions(candidates
        .filter(option => !excludedOptionKeys || !excludedOptionKeys.has(visibleOptionKey(option)))
        .map(option => optionFromElement(option, selectorFor(option), option.getAttribute('aria-selected') === 'true'))
        .filter(Boolean));
    }

    async function cleanupPopupsAsync(element) {
      closePopup();
      return new Promise(resolve => {
        window.setTimeout(closePopup, 50);
        window.setTimeout(() => {
          closePopup();
          if (!element || visibleReactSelectOptionsFor(element).length === 0) {
            resolve(true);
            return;
          }

          window.setTimeout(() => {
            closePopup();
            resolve(visibleReactSelectOptionsFor(element).length === 0);
          }, 200);
        }, 150);
      });
    }

    const optionSourceHandlers = {
      nativeSelect: function (element) {
        if (element.tagName.toLowerCase() !== 'select') {
          return [];
        }

        return toUniqueOptions(Array.from(element.options)
          .map(option => optionFromElement(option, '', option.selected))
          .filter(Boolean));
      },

      radioGroup: function (element) {
        return namedChoiceOptions(element, 'radio');
      },

      checkboxGroup: function (element) {
        return namedChoiceOptions(element, 'checkbox');
      },

      datalist: function (element) {
        const listId = element.getAttribute('list');
        const list = listId ? elementRootById(element, listId) : null;
        if (!list) {
          return [];
        }

        return toUniqueOptions(Array.from(list.querySelectorAll('option'))
          .map(option => optionFromElement(option, '', false))
          .filter(Boolean));
      },

      ariaControlledListbox: function (element) {
        return toUniqueOptions(controlledPopupRoots(element)
          .flatMap(list => optionCandidateElementsFrom(list, true))
          .map(option => optionFromElement(option, selectorFor(option), option.getAttribute('aria-selected') === 'true'))
          .filter(Boolean));
      },

      visibleListbox: function (element) {
        const reactSelectOptions = visibleReactSelectOptionsFor(element);
        if (reactSelectOptions.length > 0) {
          return reactSelectOptions;
        }

        if (reactSelectOptionPrefixFor(element)) {
          return [];
        }

        return toUniqueOptions(associatedListboxRoots(element).flatMap(visibleListboxOptionsFrom));
      },

      ariaControlledGrid: function (element) {
        return toUniqueOptions(controlledPopupRoots(element)
          .flatMap(grid => optionCandidateElementsFrom(grid, true))
          .filter(isVisible)
          .map(gridOptionFromElement)
          .filter(Boolean));
      },

      activePopupListbox: async function (element, source) {
        const existingVisibleOptionKeys = new Set(collectElementsAcrossRoots(document, OPTION_ITEM_SELECTOR)
          .filter(isVisible)
          .map(visibleOptionKey));

        const readOwnedOptions = () => {
          const reactSelectOptions = visibleReactSelectOptionsFor(element);
          if (reactSelectOptions.length > 0) {
            return reactSelectOptions;
          }

          if (reactSelectOptionPrefixFor(element)) {
            return [];
          }

          const associatedOptions = optionSourceHandlers.visibleListbox(element);
          if (associatedOptions.length > 0) {
            return associatedOptions;
          }

          const globalOptions = visibleGlobalListboxOptions(existingVisibleOptionKeys);
          return globalOptions.length > 0
            ? globalOptions
            : fallbackPopupTextOptionsFor(element, existingVisibleOptionKeys);
        };

        let extractedOptions = await runExtractionActionsUntilOptions(element, source.actionGroup, readOwnedOptions);
        extractedOptions = extractedOptions.length > 0 ? extractedOptions : await waitForLateRenderedOptions(readOwnedOptions);
        closePopup(element);
        return extractedOptions;
      },

      activePopupGrid: async function (element, source) {
        const readGridOptions = () => toUniqueOptions(collectElementsAcrossRoots(document, '[role="grid"]')
          .flatMap(grid => optionCandidateElementsFrom(grid, true))
          .filter(isVisible)
          .map(gridOptionFromElement)
          .filter(Boolean));

        let extractedOptions = await runExtractionActionsUntilOptions(element, source.actionGroup, readGridOptions);
        extractedOptions = extractedOptions.length > 0 ? extractedOptions : await waitForLateRenderedOptions(readGridOptions);
        closePopup(element);
        return extractedOptions;
      }
    };

    return { optionSourceHandlers, cleanupPopupsAsync, uniqueOptions };
  }

  global.__optionSourceHandlers = { createOptionSourceHandlers, uniqueOptions };
})(window);
