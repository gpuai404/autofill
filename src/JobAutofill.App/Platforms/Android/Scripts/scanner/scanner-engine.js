(function () {
  const MAX_LABEL_LENGTH = 180;
  const MAX_CONTEXT_LABEL_LENGTH = 260;
  const MAX_OPTIONS_PER_FIELD = 300;
  const DEFAULT_OPTION_ACTION_WAIT_MS = 150;
  const MAX_ACTIVE_OPTION_FINAL_WAIT_MS = 2400;
  const domShared = window.__domShared || {};
  const genericDomTraversal = window.__genericDomTraversal || {};
  const collectElementsAcrossRoots = typeof genericDomTraversal.collectElementsAcrossRoots === 'function'
    ? genericDomTraversal.collectElementsAcrossRoots
    : function () { return []; };
  const composedParentElement = typeof genericDomTraversal.composedParentElement === 'function'
    ? genericDomTraversal.composedParentElement
    : function () { return null; };
  const composedClosest = typeof genericDomTraversal.composedClosest === 'function'
    ? genericDomTraversal.composedClosest
    : function () { return null; };

  const textUtils = window.__textUtils;
  const selectorResolver = window.__selectorResolver;
  const labelDiscovery = window.__labelDiscovery;
  const controlClassification = window.__controlClassification;
  const optionHandling = window.__optionHandling;
  const optionSourceHandlersModule = window.__optionSourceHandlers;
  const sensitiveFields = window.__sensitiveFields;
  const choiceSelection = window.__choiceSelection;
  const choiceGroupDiscovery = window.__choiceGroupDiscovery;
  const actionClassification = window.__actionClassification;
  if (typeof textUtils?.cssEscape !== 'function' ||
    typeof textUtils?.normalize !== 'function' ||
    typeof textUtils?.compactText !== 'function' ||
    typeof domShared?.isVisible !== 'function' ||
    typeof domShared?.dispatchKeyboardEvent !== 'function' ||
    typeof domShared?.dispatchPointerEvent !== 'function' ||
    typeof domShared?.dispatchMouseEvent !== 'function' ||
    typeof domShared?.closePopup !== 'function' ||
    typeof selectorResolver?.selectorFor !== 'function' ||
    typeof selectorResolver?.resolveScopedSelector !== 'function' ||
    typeof labelDiscovery?.labelFor !== 'function' ||
    typeof labelDiscovery?.clippedLabel !== 'function' ||
    typeof labelDiscovery?.isGenericPlaceholderText !== 'function' ||
    typeof labelDiscovery?.isValidationMessageText !== 'function' ||
    typeof labelDiscovery?.isMeaningfulLabelText !== 'function' ||
    typeof labelDiscovery?.textFromLabelledBy !== 'function' ||
    typeof labelDiscovery?.requirementContextRoot !== 'function' ||
    typeof labelDiscovery?.requirementInfoFor !== 'function' ||
    typeof labelDiscovery?.isUsableLabelText !== 'function' ||
    typeof labelDiscovery?.textContentAcrossOpenRoots !== 'function' ||
    typeof labelDiscovery?.fileFieldContainerKey !== 'function' ||
    typeof labelDiscovery?.labelDebugCandidatesFor !== 'function' ||
    typeof labelDiscovery?.bestQuestionText !== 'function' ||
    typeof controlClassification?.controlInfoFor !== 'function' ||
    typeof controlClassification?.buildFieldModel !== 'function' ||
    typeof optionHandling?.extractOptions !== 'function' ||
    typeof optionSourceHandlersModule?.createOptionSourceHandlers !== 'function' ||
    typeof sensitiveFields?.sensitiveFieldInfo !== 'function' ||
    typeof choiceSelection?.inferChoiceSelectionMode !== 'function' ||
    typeof choiceGroupDiscovery?.createCollector !== 'function' ||
    typeof actionClassification?.actionButtonText !== 'function' ||
    typeof actionClassification?.actionKindForButton !== 'function') {
    throw new Error('scanner-engine.js requires its extracted scanner modules.');
  }

  const cssEscape = textUtils.cssEscape;
  const selectorFor = selectorResolver.selectorFor;
  const resolveScopedSelector = selectorResolver.resolveScopedSelector;
  const compactText = textUtils.compactText;
  const normalize = textUtils.normalize;
  const isVisible = domShared.isVisible;
  const dispatchKeyboardEvent = domShared.dispatchKeyboardEvent;
  const dispatchPointerEvent = domShared.dispatchPointerEvent;
  const dispatchMouseEvent = domShared.dispatchMouseEvent;
  const closePopup = domShared.closePopup;

  const CHOICE_VISUAL_CONTROL_SELECTOR = [
    '[role="radio"]',
    '[role="checkbox"]',
    '.radio',
    '.checkbox',
    '[class*="radio"]',
    '[class*="checkbox"]'
  ].join(', ');

  const QUESTION_ROOT_SELECTOR = [
    '[data-question]',
    '[class*="question"]',
    '.application-question',
    '.question',
    'fieldset'
  ].join(', ');

  const clippedLabel = labelDiscovery.clippedLabel;
  const isGenericPlaceholderText = labelDiscovery.isGenericPlaceholderText;
  const isValidationMessageText = labelDiscovery.isValidationMessageText;
  const isMeaningfulLabelText = labelDiscovery.isMeaningfulLabelText;
  const textFromLabelledBy = labelDiscovery.textFromLabelledBy;
  const requirementContextRoot = labelDiscovery.requirementContextRoot;
  const requirementInfoFor = labelDiscovery.requirementInfoFor;
  const isUsableLabelText = labelDiscovery.isUsableLabelText;
  const textContentAcrossOpenRoots = labelDiscovery.textContentAcrossOpenRoots;
  const fileFieldContainerKey = labelDiscovery.fileFieldContainerKey;
  const labelDebugCandidatesFor = labelDiscovery.labelDebugCandidatesFor;
  const bestQuestionText = labelDiscovery.bestQuestionText;
  const fieldMessageFor = typeof labelDiscovery.fieldMessageFor === 'function'
    ? labelDiscovery.fieldMessageFor
    : function () { return ''; };

  function ensureDebugArray(name) {
    window.__scanDebug[name] = Array.isArray(window.__scanDebug[name])
      ? window.__scanDebug[name]
      : [];
    return window.__scanDebug[name];
  }

  function pushDebugEntry(name, entry) {
    ensureDebugArray(name).push(entry);
  }

  function stringFlag(value) {
    return value ? 'true' : 'false';
  }

  function choiceOption(value, label, selector, selected) {
    return {
      value: value || label,
      label,
      selector,
      source: 'dom',
      fillMethod: 'clickSelector',
      selected: Boolean(selected),
      position: 0
    };
  }

  function choiceSelectionInfo(facts, config, fieldLabel, options) {
    const ruleSelection = controlClassification.selectionModeFor(facts, 'choice');
    const inferredSelection = choiceSelection.inferChoiceSelectionMode(
      config.nativeType,
      fieldLabel,
      options,
      config.inputs);

    if (inferredSelection.selectionMode === 'multiple' && ruleSelection.selectionMode !== 'multiple') {
      return inferredSelection;
    }

    return ruleSelection.selectionMode ? ruleSelection : inferredSelection;
  }

  function buildChoiceField(root, options, config) {
    if (options.length < 2) {
      return null;
    }

    const fieldLabel = clippedLabel(config.fieldLabel || bestQuestionText(root), MAX_LABEL_LENGTH);
    if (!fieldLabel) {
      return null;
    }

    const sensitiveInfo = sensitiveFields.sensitiveFieldInfo(config.inputs[0], fieldLabel);
    const requirement = config.requirementFacts || {
      required: 'false',
      optional: 'false'
    };
    const facts = {
      nativeType: config.nativeType,
      tagName: config.tagName,
      role: config.role,
      ariaHasPopup: '',
      ariaExpanded: '',
      ariaControls: '',
      ariaOwns: '',
      ariaActiveDescendant: '',
      ariaAutocomplete: '',
      ariaMultiselectable: 'false',
      autocomplete: '',
      list: '',
      required: requirement.required,
      optional: requirement.optional,
      disabled: config.disabled,
      readonly: '',
      multiple: 'false',
      labelText: normalize(fieldLabel)
    };
    const selectionInfo = choiceSelectionInfo(facts, config, fieldLabel, options);
    facts.ariaMultiselectable = stringFlag(selectionInfo.multiple);
    facts.multiple = stringFlag(selectionInfo.multiple);
    const controlInfo = {
      controlType: config.controlType,
      controlFamily: 'choice',
      selectionMode: selectionInfo.selectionMode,
      selectionModeReason: selectionInfo.selectionModeReason || selectionInfo.reason,
      scanReason: config.scanReason,
      fieldMessage: config.fieldMessage || '',
      requiresCapturedOption: true,
      valuePolicy: 'mustMatchCapturedOption',
      fillStrategy: 'clickCapturedChoice',
      optionSourceGroup: config.optionSourceGroup,
      extractionActionGroup: ''
    };

    return controlClassification.buildFieldModel({
      selector: selectorFor(root),
      label: fieldLabel,
      facts,
      controlInfo,
      sensitiveInfo,
      options,
      optionsTruncated: options.optionsTruncated,
      optionsScanReason: config.optionsScanReason,
      sourceUrl: window.location.href
    });
  }

  function factsFor(element, labelText) {
    const requirement = requirementInfoFor(element, labelText);
    return {
      tagName: normalize(element.tagName),
      nativeType: normalize(element.type),
      role: normalize(element.getAttribute('role')),
      ariaHasPopup: normalize(element.getAttribute('aria-haspopup')),
      ariaExpanded: normalize(element.getAttribute('aria-expanded')),
      ariaControls: normalize(element.getAttribute('aria-controls')),
      ariaOwns: normalize(element.getAttribute('aria-owns')),
      ariaActiveDescendant: normalize(element.getAttribute('aria-activedescendant')),
      ariaAutocomplete: normalize(element.getAttribute('aria-autocomplete')),
      ariaMultiselectable: normalize(element.getAttribute('aria-multiselectable')),
      isContentEditable: element.isContentEditable ? 'true' : 'false',
      autocomplete: normalize(element.getAttribute('autocomplete')),
      list: normalize(element.getAttribute('list')),
      required: requirement.required ? 'true' : 'false',
      optional: requirement.optional ? 'true' : 'false',
      disabled: element.disabled || element.getAttribute('aria-disabled') === 'true' ? 'true' : 'false',
      readonly: element.readOnly || element.getAttribute('aria-readonly') === 'true' ? 'true' : 'false',
      multiple: element.multiple ? 'true' : 'false',
      labelText: normalize(labelText)
    };
  }

  function owningChoiceControlForNestedInput(element) {
    if (!element || element.tagName.toLowerCase() !== 'input') {
      return null;
    }

    const nativeType = normalize(element.type);
    if (nativeType && nativeType !== 'text' && nativeType !== 'search') {
      return null;
    }

    let current = composedParentElement(element);
    for (let depth = 0; current && current !== document.body && depth < 6; depth++) {
      const controls = Array.from(current.querySelectorAll('[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="grid"]'))
        .filter(candidate => candidate !== element && isVisible(candidate));

      if (controls.length > 0) {
        return controls[0];
      }

      current = composedParentElement(current);
    }

    return null;
  }

  function shouldSkipNestedChoiceTextInput(element, controlInfo) {
    if (controlInfo.controlFamily !== 'text' || element.tagName.toLowerCase() !== 'input') {
      return false;
    }

    if (element.id || element.name || element.getAttribute('autocomplete')) {
      return false;
    }

    return Boolean(owningChoiceControlForNestedInput(element));
  }

  function shouldSkipActionOnlyPopupButton(element, controlInfo) {
    if (!element || element.tagName.toLowerCase() !== 'button') {
      return false;
    }

    if (normalize(element.getAttribute('role')) === 'combobox') {
      return false;
    }

    return controlInfo.controlType === 'gridCombobox';
  }

  function nonApplicationControlReason(element) {
    if (!element) {
      return '';
    }

    const selfSignals = [
      element.id,
      element.name,
      element.getAttribute('class'),
      element.getAttribute('aria-label'),
      element.getAttribute('data-testid'),
      element.getAttribute('data-test-id')
    ].map(normalize).join(' ');

    if (/\b(?:ot-group-id|onetrust|cookiebot|cmp-)/.test(selfSignals) ||
      /\b(?:vendor-search-handler|select-all-vendor|select-all-hosts|chkbox-id)\b/.test(selfSignals)) {
      return 'Control belongs to a cookie/privacy preference widget.';
    }

    let current = element;
    for (let depth = 0; current && current !== document.body && depth < 8; depth++) {
      const signals = [
        current.id,
        current.getAttribute('class'),
        current.getAttribute('role'),
        current.getAttribute('aria-label'),
        current.getAttribute('data-testid'),
        current.getAttribute('data-test-id')
      ].map(normalize).join(' ');

      if (/\b(?:onetrust|ot-sdk|ot-pc|cookiebot|cookie-consent|cookie-banner|cookie-preference|consent-manager|privacy-preference|preference-center|cmp-container)\b/.test(signals)) {
        return 'Control is inside a cookie/privacy preference widget.';
      }

      current = composedParentElement(current);
    }

    return '';
  }

  function optionFromElement(element, selector, selected) {
    const text = optionTextFor(element);
    const value = compactText(element.getAttribute('value') || element.getAttribute('data-value') || text);

    if (!value && !text) {
      return null;
    }

    if (!isOptionText(text || value)) {
      return null;
    }

    return {
      value,
      label: text || value,
      selector,
      source: 'dom',
      fillMethod: selector ? 'clickSelector' : 'clickVisibleText',
      selected: Boolean(selected),
      position: 0
    };
  }

  function optionTextFor(element) {
    if (!element) {
      return '';
    }

    const labelledBy = textFromLabelledBy(element);
    const candidates = [
      labelledBy,
      element.getAttribute('aria-label'),
      element.getAttribute('data-label'),
      element.getAttribute('title'),
      element.textContent,
      textContentAcrossOpenRoots(element),
      element.getAttribute('value'),
      element.getAttribute('data-value')
    ];

    for (let index = 0; index < candidates.length; index++) {
      const text = compactText(candidates[index]);
      if (text) {
        return text;
      }
    }

    return '';
  }

  function isOptionText(value) {
    const text = compactText(value);
    return Boolean(text) &&
      text.length <= MAX_CONTEXT_LABEL_LENGTH &&
      !isValidationMessageText(text) &&
      !isGenericPlaceholderText(text);
  }

  const choiceGroups = choiceGroupDiscovery.createCollector({
    collectElementsAcrossRoots,
    composedClosest,
    isVisible,
    normalize,
    selectorFor,
    clippedLabel,
    isUsableLabelText,
    isMeaningfulLabelText,
    textFromLabelledBy,
    textContentAcrossOpenRoots,
    bestQuestionText,
    requirementInfoFor,
    nonApplicationControlReason,
    buildChoiceField,
    choiceOption,
    uniqueOptions: options => optionSourceHandlersModule.uniqueOptions(options, normalize, MAX_OPTIONS_PER_FIELD),
    questionRootSelector: QUESTION_ROOT_SELECTOR,
    choiceVisualControlSelector: CHOICE_VISUAL_CONTROL_SELECTOR,
    maxContextLabelLength: MAX_CONTEXT_LABEL_LENGTH,
    maxLabelLength: MAX_LABEL_LENGTH
  });

  function popupTriggerCandidates(element) {
    const candidates = [
      element,
      element.closest('[role="combobox"], [aria-haspopup], button, [role="button"]'),
      element.parentElement,
      element.parentElement ? element.parentElement.querySelector('[aria-haspopup], [role="combobox"], button, [role="button"]') : null
    ];

    return Array.from(new Set(candidates.filter(Boolean).filter(isVisible)));
  }

  function extractionTargetSummary(element) {
    if (!element) {
      return null;
    }

    return {
      selector: selectorFor(element),
      tagName: element.tagName ? element.tagName.toLowerCase() : '',
      id: element.id || '',
      role: element.getAttribute ? element.getAttribute('role') || '' : '',
      ariaHasPopup: element.getAttribute ? element.getAttribute('aria-haspopup') || '' : '',
      ariaExpanded: element.getAttribute ? element.getAttribute('aria-expanded') || '' : '',
      className: typeof element.className === 'string' ? element.className.slice(0, 160) : ''
    };
  }

  function runExtractionAction(element, action) {
    if (action.action === 'focus') {
      try {
        element.focus({ preventScroll: true });
      } catch (error) {
        element.focus();
      }
    }

    if (action.action === 'pointerdown') {
      dispatchPointerEvent(element, 'pointerdown');
    }

    if (action.action === 'mousedown') {
      dispatchMouseEvent(element, 'mousedown');
    }

    if (action.action === 'pointerup') {
      dispatchPointerEvent(element, 'pointerup');
    }

    if (action.action === 'mouseup') {
      dispatchMouseEvent(element, 'mouseup');
    }

    if (action.action === 'click') {
      dispatchMouseEvent(element, 'click');
    }

    if (action.action === 'keydown' && action.key) {
      dispatchKeyboardEvent(element, action.key);
    }
  }

  function optionActionWaitMs(action) {
    if (typeof action.delayMs === 'number') {
      return Math.max(action.delayMs, 0);
    }

    return DEFAULT_OPTION_ACTION_WAIT_MS;
  }

  function waitForOptions(readOptions, timeoutMs) {
    const immediateOptions = readOptions();
    if (immediateOptions.length > 0) {
      return Promise.resolve(immediateOptions);
    }

    return new Promise(resolve => {
      let settled = false;
      let interval = null;
      const finish = options => {
        if (settled) {
          return;
        }

        settled = true;
        if (observer) {
          observer.disconnect();
        }
        if (interval) {
          window.clearInterval(interval);
        }
        window.clearTimeout(timeout);
        resolve(options || []);
      };

      const poll = () => {
        const options = readOptions();
        if (options.length > 0) {
          finish(options);
        }
      };

      let observer = null;
      try {
        observer = new MutationObserver(poll);
        observer.observe(document.documentElement || document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['aria-expanded', 'aria-hidden', 'style', 'class']
        });
      } catch (error) {
        observer = null;
      }

      interval = window.setInterval(poll, 75);

      const timeout = window.setTimeout(() => finish(readOptions()), timeoutMs);
    });
  }

  async function runExtractionActionsUntilOptions(element, actionGroup, readOptions) {
    const rules = window.__fieldControlRules || {};
    const actions = rules.extractionActions && Array.isArray(rules.extractionActions[actionGroup])
      ? rules.extractionActions[actionGroup]
      : [];
    const targets = popupTriggerCandidates(element);
    const trace = {
      actionGroup,
      targetCount: targets.length,
      targets: targets.map(extractionTargetSummary).filter(Boolean),
      attempts: []
    };
    window.__lastOptionExtractionTrace = trace;

    for (let index = 0; index < actions.length; index++) {
      const action = actions[index];
      for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
        runExtractionAction(targets[targetIndex], action);
        const options = await waitForOptions(readOptions, optionActionWaitMs(action));
        trace.attempts.push({
          action: action.action,
          key: action.key || '',
          targetIndex,
          waitMs: optionActionWaitMs(action),
          optionCount: options.length,
          activeElement: extractionTargetSummary(document.activeElement),
          ariaExpanded: element.getAttribute('aria-expanded') || '',
          ariaActiveDescendant: element.getAttribute('aria-activedescendant') || ''
        });
        if (options.length > 0) {
          trace.result = 'options-found';
          return options;
        }
      }
    }

    const finalOptions = readOptions();
    trace.result = finalOptions.length > 0 ? 'final-read-options-found' : 'no-options';
    trace.finalOptionCount = finalOptions.length;
    return finalOptions;
  }

  async function waitForLateRenderedOptions(readOptions) {
    const options = readOptions();
    if (options.length > 0) {
      return options;
    }

    return waitForOptions(readOptions, MAX_ACTIVE_OPTION_FINAL_WAIT_MS);
  }

  function gridOptionFromElement(element) {
    const label = optionTextFor(element);
    if (!label) {
      return null;
    }

    return {
      value: element.getAttribute('data-value') || label,
      label,
      selector: selectorFor(element),
      selected: element.getAttribute('aria-selected') === 'true',
      position: 0
    };
  }

  function namedChoiceOptions(element, nativeType) {
    const inputs = normalize(element.type) === nativeType && element.name
      ? Array.from(document.querySelectorAll('input[type="' + nativeType + '"][name="' + cssEscape(element.name) + '"]'))
      : choiceGroups.choiceInputsIn(element, nativeType);

    return optionSourceHandlersModule.uniqueOptions(inputs
      .map(input => choiceOption(input.value, choiceGroups.choiceInputLabel(input), selectorFor(input), input.checked))
      .filter(option => option.value || option.label), normalize, MAX_OPTIONS_PER_FIELD);
  }

  function elementRootById(element, id) {
    if (!id) {
      return null;
    }

    const root = element && element.getRootNode ? element.getRootNode() : document;
    try {
      if (root && typeof root.getElementById === 'function') {
        const rooted = root.getElementById(id);
        if (rooted) {
          return rooted;
        }
      }

      if (root && typeof root.querySelector === 'function') {
        const rooted = root.querySelector('#' + cssEscape(id));
        if (rooted) {
          return rooted;
        }
      }
    } catch (error) {
      // Fall through to the document lookup.
    }

    const acrossRoots = collectElementsAcrossRoots(document, '#' + cssEscape(id));
    return acrossRoots.length > 0 ? acrossRoots[0] : document.getElementById(id);
  }

  function scanActionButtons() {
    const selector = [
      'button',
      'input[type="button"]',
      'input[type="submit"]',
      'input[type="reset"]',
      '[role="button"]',
      'a[role="button"]',
      '[aria-haspopup]:not(input):not(select):not(textarea)'
    ].join(', ');
    const seen = new Set();

    return collectElementsAcrossRoots(document, selector)
      .filter(element => isVisible(element) && !nonApplicationControlReason(element))
      .map(element => {
        const elementSelector = selectorFor(element);
        if (seen.has(elementSelector)) {
          return null;
        }

        seen.add(elementSelector);
        const text = actionClassification.actionButtonText(element);
        const contextRoot = requirementContextRoot(element) || composedClosest(element, 'form, [role="form"], main, section, article');
        return {
          selector: elementSelector,
          label: text,
          actionKind: actionClassification.actionKindForButton(element, text),
          tagName: element.tagName ? element.tagName.toLowerCase() : '',
          nativeType: normalize(element.getAttribute('type')),
          role: normalize(element.getAttribute('role')),
          ariaHasPopup: normalize(element.getAttribute('aria-haspopup')),
          ariaExpanded: normalize(element.getAttribute('aria-expanded')),
          disabled: element.disabled || element.getAttribute('aria-disabled') === 'true' ? 'true' : 'false',
          contextSelector: contextRoot ? selectorFor(contextRoot) : ''
        };
      })
      .filter(Boolean)
      .slice(0, 120);
  }

  function buildActionFieldModel(actionButton) {
    if (!actionButton || !actionButton.selector || !actionButton.label) {
      return null;
    }

    return {
      selector: actionButton.selector,
      label: actionButton.label,
      inputType: actionButton.actionKind || 'action',
      fieldCategory: '',
      fieldSubCategory: '',
      fieldCategoryReason: '',
      controlType: 'actionButton',
      controlFamily: 'action',
      selectionMode: '',
      selectionModeReason: '',
      nativeInputType: actionButton.nativeType || '',
      tagName: actionButton.tagName || '',
      role: actionButton.role || '',
      ariaHasPopup: actionButton.ariaHasPopup || '',
      ariaExpanded: actionButton.ariaExpanded || '',
      ariaControls: '',
      ariaOwns: '',
      ariaActiveDescendant: '',
      ariaAutocomplete: '',
      ariaMultiselectable: '',
      autocomplete: '',
      list: '',
      required: 'false',
      optional: 'false',
      disabled: actionButton.disabled || 'false',
      readonly: 'true',
      multiple: 'false',
      scanReason: actionButton.actionKind === 'submit'
        ? 'Detected submit button in the page action flow.'
        : actionButton.actionKind === 'sso'
          ? 'Detected provider sign-in/apply action in the page action flow.'
        : 'Detected action button in the page action flow.',
      fieldMessage: '',
      requiresCapturedOption: false,
      valuePolicy: 'manualReview',
      fillStrategy: 'skip',
      optionSourceGroup: '',
      extractionActionGroup: '',
      options: [],
      optionsTruncated: false,
      optionsScanReason: '',
      sourceUrl: window.location.href
    };
  }

  const optionSources = optionSourceHandlersModule.createOptionSourceHandlers({
    normalize,
    isVisible,
    selectorFor,
    cssEscape,
    closePopup,
    collectElementsAcrossRoots,
    composedClosest,
    optionFromElement,
    optionTextFor,
    isOptionText,
    nonApplicationControlReason,
    namedChoiceOptions,
    elementRootById,
    gridOptionFromElement,
    waitForOptions,
    runExtractionActionsUntilOptions,
    waitForLateRenderedOptions,
    maxOptionsPerField: MAX_OPTIONS_PER_FIELD
  });
  const optionSourceHandlers = optionSources.optionSourceHandlers;
  const cleanupPopupsAsync = optionSources.cleanupPopupsAsync;

  // Option extraction is provided by window.__optionHandling.extractOptions().

  function compareFieldDocumentOrder(left, right) {
    const leftElement = left && left.selector ? resolveScopedSelector(left.selector) : null;
    const rightElement = right && right.selector ? resolveScopedSelector(right.selector) : null;

    if (!leftElement || !rightElement || leftElement === rightElement) {
      return 0;
    }

    if (typeof leftElement.compareDocumentPosition !== 'function') {
      return 0;
    }

    const relation = leftElement.compareDocumentPosition(rightElement);
    if (relation & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1;
    }

    if (relation & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1;
    }

    return 0;
  }

  async function findFields() {
    const fields = [];
    const rules = window.__fieldControlRules || {};
    const selectors = Array.isArray(rules.fieldSelectors)
      ? rules.fieldSelectors
      : [
        'input:not([type="hidden"]):not([type="file"]):not([id*="recaptcha"]):not([name*="recaptcha"]):not([id*="hcaptcha"]):not([name*="hcaptcha"])',
        'textarea:not([id*="recaptcha"]):not([name*="recaptcha"]):not([id*="hcaptcha"]):not([name*="hcaptcha"])',
        'select',
        '[role="combobox"]',
        '[role="textbox"]',
        '[role="searchbox"]',
        '[aria-haspopup="listbox"]'
    ];
    const seen = new Set();
    const seenFileContainers = new Set();

    window.__scanDebug = Object.assign(window.__scanDebug || {}, {
      pageUrl: window.location.href,
      pageTitle: document.title || '',
      readyState: document.readyState,
      selectors: selectors,
      selectorCounts: {},
      fieldCount: 0,
      processedFieldCount: 0,
      activeField: null,
      actionButtons: [],
      actionButtonCount: 0,
      optionExtractions: [],
      shadowCapture: typeof domShared.shadowCaptureDiagnostics === 'function'
        ? domShared.shadowCaptureDiagnostics()
        : null,
      errors: Array.isArray(window.__scanDebug?.errors) ? window.__scanDebug.errors : []
    });

    const capability = window.__capabilityProbe && typeof window.__capabilityProbe.probeCapabilities === 'function'
      ? window.__capabilityProbe.probeCapabilities()
      : {
        scannable: true,
        status: 'unknown',
        reason: null,
        message: 'Page capability probe is not available.',
        evidence: {}
      };
    window.__scanCapability = capability;
    window.__scanDebug.capability = capability;
    window.__scanDebug.actionButtons = scanActionButtons();
    window.__scanDebug.actionButtonCount = window.__scanDebug.actionButtons.length;
    window.__scanDebug.actionButtons
      .filter(actionButton => actionButton.actionKind === 'submit' || actionButton.actionKind === 'sso')
      .forEach(actionButton => {
        if (seen.has(actionButton.selector)) {
          return;
        }

        const actionField = buildActionFieldModel(actionButton);
        if (!actionField) {
          return;
        }

        seen.add(actionButton.selector);
        fields.push(actionField);
      });

    choiceGroups.collectChoiceGroupFields(seen).forEach(field => fields.push(field));

    for (let selectorIndex = 0; selectorIndex < selectors.length; selectorIndex++) {
      const selector = selectors[selectorIndex];
      const elements = collectElementsAcrossRoots(document, selector);
      window.__scanDebug.selectorCounts[selector] = elements.length;

      for (let elementIndex = 0; elementIndex < elements.length; elementIndex++) {
        const element = elements[elementIndex];
        const fieldSelector = selectorFor(element);
        if (seen.has(fieldSelector)) {
          continue;
        }
        seen.add(fieldSelector);

        const nonApplicationReason = nonApplicationControlReason(element);
        if (nonApplicationReason) {
          pushDebugEntry('skippedNonApplicationControls', {
            selector: fieldSelector,
            reason: nonApplicationReason
          });
          continue;
        }

        const fieldLabel = labelDiscovery.labelFor(element);
        const fieldMessage = fieldMessageFor(element, fieldLabel);
        const controlInfo = controlClassification.controlInfoFor(element, fieldLabel, factsFor);
        if (!fieldLabel && controlInfo.controlType === 'checkboxBoolean') {
          pushDebugEntry('skippedUnlabeledCheckboxes', {
            selector: fieldSelector,
            reason: 'Standalone checkbox has no trustworthy label.'
          });
          continue;
        }

        if (shouldSkipActionOnlyPopupButton(element, controlInfo)) {
          pushDebugEntry('skippedActionOnlyPopupButtons', {
            selector: fieldSelector,
            label: fieldLabel,
            controlType: controlInfo.controlType,
            ariaHasPopup: controlInfo.facts.ariaHasPopup
          });
          continue;
        }

        const owningChoiceControl = shouldSkipNestedChoiceTextInput(element, controlInfo)
          ? owningChoiceControlForNestedInput(element)
          : null;
        if (owningChoiceControl) {
          pushDebugEntry('skippedNestedChoiceInputs', {
            selector: fieldSelector,
            label: fieldLabel,
            owningChoiceSelector: selectorFor(owningChoiceControl)
          });
          continue;
        }

        if (controlInfo.controlType === 'file') {
          const fileContainerKey = fileFieldContainerKey(element, fieldLabel);
          const fileDedupKey = fileContainerKey || (fieldLabel ? 'label:' + normalize(fieldLabel) : '');
          if (fileDedupKey && seenFileContainers.has(fileDedupKey)) {
            pushDebugEntry('skippedDuplicateFileFields', {
              selector: fieldSelector,
              label: fieldLabel,
              dedupKey: fileDedupKey
            });
            continue;
          }

          if (fileDedupKey) {
            seenFileContainers.add(fileDedupKey);
          }
        }

        if (!fieldLabel && (controlInfo.controlType === 'checkboxBoolean' || controlInfo.controlType === 'file')) {
          pushDebugEntry('labelDiagnostics', {
            selector: fieldSelector,
            controlType: controlInfo.controlType,
            nativeInputType: controlInfo.facts.nativeType,
            candidates: labelDebugCandidatesFor(element)
          });
        }
        window.__scanDebug.activeField = {
          selector: fieldSelector,
          label: fieldLabel,
          fieldMessage: fieldMessage,
          controlType: controlInfo.controlType,
          optionSourceGroup: controlInfo.optionSourceGroup
        };
        const optionInfo = await optionHandling.extractOptions(
          element,
          controlInfo.controlType,
          { allowActionRequiredSources: false },
          optionSourceHandlers);
        const sensitiveInfo = sensitiveFields.sensitiveFieldInfo(element, fieldLabel);
        window.__scanDebug.processedFieldCount++;
        window.__scanDebug.optionExtractions.push({
          selector: fieldSelector,
          controlType: controlInfo.controlType,
          mode: optionInfo.optionExtractionMode,
          attemptedSources: optionInfo.attemptedSources || [],
          skippedSources: optionInfo.skippedSources || [],
          errors: optionInfo.errors || [],
          optionsCount: optionInfo.options.length,
          optionsTruncated: optionInfo.optionsTruncated,
          reason: optionInfo.optionsScanReason
        });

        fields.push(controlClassification.buildFieldModel({
          selector: fieldSelector,
          label: fieldLabel,
          fieldMessage: fieldMessage,
          facts: controlInfo.facts,
          controlInfo,
          sensitiveInfo,
          options: optionInfo.options,
          optionsTruncated: optionInfo.optionsTruncated,
          optionsScanReason: optionInfo.optionsScanReason,
          sourceUrl: window.location.href
        }));
      }
    }

    fields.sort(compareFieldDocumentOrder);
    window.__scanDebug.fieldCount = fields.length;
    window.__scanDebug.detectedSelectors = fields.map(field => field.selector);
    window.__scanDebug.activeField = null;

    if (window.__capabilityProbe && typeof window.__capabilityProbe.probeCapabilities === 'function') {
      const finalCapability = window.__capabilityProbe.probeCapabilities();
      window.__scanCapability = finalCapability;
      window.__scanDebug.capability = finalCapability;
    }

    return fields;
  }

  window.__scanDebug = {
    pageUrl: window.location.href,
    pageTitle: document.title || '',
    readyState: document.readyState,
    selectorCounts: {},
    fieldCount: 0,
    detectedSelectors: [],
    errors: [],
    lastError: null
  };

  window.addEventListener('error', function (event) {
    const message = event && event.message ? String(event.message) : 'Unknown browser error';
    const source = event && event.filename ? String(event.filename) : 'unknown';
    const line = event && event.lineno ? String(event.lineno) : 'unknown';
    window.__scanDebug.errors.push({ message, source, line, stack: event && event.error ? String(event.error.stack || event.error) : '' });
    window.__scanDebug.lastError = { message, source, line };
  });

  window.addEventListener('unhandledrejection', function (event) {
    const reason = event && event.reason ? String(event.reason && event.reason.stack ? event.reason.stack : event.reason) : 'Unhandled promise rejection';
    window.__scanDebug.errors.push({ message: reason, source: 'unhandledrejection', line: 'n/a' });
    window.__scanDebug.lastError = { message: reason, source: 'unhandledrejection', line: 'n/a' };
  });

  const originalConsoleError = console.error.bind(console);
  console.error = function () {
    const message = Array.from(arguments).map(arg => String(arg)).join(' ');
    window.__scanDebug.errors.push({ message, source: 'console.error', line: 'n/a' });
    window.__scanDebug.lastError = { message, source: 'console.error', line: 'n/a' };
    return originalConsoleError.apply(console, arguments);
  };

  function classifyPage() {
    if (window.__pageClassification && typeof window.__pageClassification.classifyPage === 'function') return window.__pageClassification.classifyPage();
    throw new Error('Page classification module is not loaded.');
  }

  window.__scannerEngine = {
    classifyPage,
    findFields,
    extractOptionsForField,
    closeOpenOptionPopups: cleanupPopupsAsync
  };

  async function extractOptionsForField(selector) {
    const startedAt = Date.now();
    const appendTargetedOptionDebug = entry => {
      ensureDebugArray('targetedOptionExtractions').push(Object.assign({
        selector,
        durationMs: Date.now() - startedAt
      }, entry || {}));
    };

    try {
      closePopup();
      const element = resolveScopedSelector(selector);
      if (!element) {
        appendTargetedOptionDebug({
          ok: false,
          optionCount: 0,
          message: 'Element not found.'
        });
        return {
          ok: false,
          selector,
          options: [],
          optionsTruncated: false,
          message: 'Element not found.'
        };
      }

      const fieldLabel = labelDiscovery.labelFor(element);
      const controlInfo = controlClassification.controlInfoFor(element, fieldLabel, factsFor);
      const optionInfo = await optionHandling.extractOptions(
        element,
        controlInfo.controlType,
        { allowActionRequiredSources: true },
        optionSourceHandlers);
      const popupClosed = await cleanupPopupsAsync(element);
      appendTargetedOptionDebug({
        ok: optionInfo.options.length > 0,
        label: fieldLabel,
        controlType: controlInfo.controlType,
        optionCount: optionInfo.options.length,
        optionsTruncated: optionInfo.optionsTruncated,
        message: optionInfo.optionsScanReason || 'Options extracted.',
        mode: optionInfo.optionExtractionMode,
        attemptedSources: optionInfo.attemptedSources || [],
        skippedSources: optionInfo.skippedSources || [],
        errors: optionInfo.errors || [],
        trace: window.__lastOptionExtractionTrace || null,
        popupClosed
      });

      return {
        ok: optionInfo.options.length > 0,
        selector,
        controlType: controlInfo.controlType,
        options: optionInfo.options,
        optionsTruncated: optionInfo.optionsTruncated,
        message: optionInfo.optionsScanReason || 'Options extracted.',
        popupClosed
      };
    } catch (error) {
      await cleanupPopupsAsync(null);
      const message = error && error.stack ? String(error.stack) : String(error);
      appendTargetedOptionDebug({
        ok: false,
        optionCount: 0,
        message,
        trace: window.__lastOptionExtractionTrace || null
      });
      ensureDebugArray('errors').push({ message, source: 'extractOptionsForField', line: 'n/a' });
      return {
        ok: false,
        selector,
        options: [],
        optionsTruncated: false,
        message
      };
    }
  };

})();
