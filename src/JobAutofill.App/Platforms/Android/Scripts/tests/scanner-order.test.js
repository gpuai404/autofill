const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function load(overrides = {}) {
  const elementsBySelector = new Map();
  let collectElementsImpl = () => [];
  const document = {
    title: 'Order test',
    readyState: 'complete',
    body: {},
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {}
  };

  const context = {
    console,
    URL,
    Node: {
      DOCUMENT_POSITION_PRECEDING: 2,
      DOCUMENT_POSITION_FOLLOWING: 4
    },
    document,
    location: { href: 'https://example.test/form' },
    window: null,
    MutationObserver: class { observe() {} disconnect() {} },
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    addEventListener() {},
    removeEventListener() {},
    __domShared: {
      isVisible() { return true; },
      dispatchKeyboardEvent() {},
      dispatchPointerEvent() {},
      dispatchMouseEvent() {},
      closePopup() {},
      shadowCaptureDiagnostics() { return null; }
    },
    __genericDomTraversal: {
      collectElementsAcrossRoots(rootNode, selector) {
        return collectElementsImpl(rootNode, selector);
      },
      composedParentElement() { return null; },
      composedClosest() { return null; }
    },
    __textUtils: {
      cssEscape(value) { return String(value); },
      compactText(value) { return String(value || '').trim(); },
      normalize(value) { return String(value || '').trim().toLowerCase(); }
    },
    __selectorResolver: {
      selectorFor(element) { return element.selector; },
      resolveScopedSelector(selector) { return elementsBySelector.get(selector) || null; }
    },
    __labelDiscovery: {
      labelFor(element) { return element.label || ''; },
      clippedLabel(value) { return value; },
      isGenericPlaceholderText() { return false; },
      isValidationMessageText() { return false; },
      isMeaningfulLabelText(value) { return Boolean(value); },
      textFromLabelledBy() { return ''; },
      requirementContextRoot() { return null; },
      requirementInfoFor() { return { required: false, optional: false }; },
      isUsableLabelText(value) { return Boolean(value); },
      textContentAcrossOpenRoots() { return ''; },
      fileFieldContainerKey() { return ''; },
      labelDebugCandidatesFor() { return []; },
      bestQuestionText() { return ''; }
    },
    __controlClassification: {
      controlInfoFor(element) {
        return {
          controlType: element.controlType || 'text',
          controlFamily: 'text',
          facts: { nativeType: 'text', ariaHasPopup: '' },
          optionSourceGroup: ''
        };
      },
      selectionModeFor() { return { selectionMode: 'single', selectionModeReason: '' }; },
      buildFieldModel(input) {
        return { selector: input.selector, label: input.label, options: input.options || [] };
      }
    },
    __optionHandling: {
      async extractOptions() {
        return {
          options: [],
          optionsTruncated: false,
          optionsScanReason: '',
          optionExtractionMode: 'passive',
          attemptedSources: [],
          skippedSources: [],
          errors: []
        };
      }
    },
    __optionSourceHandlers: {
      createOptionSourceHandlers() {
        return { optionSourceHandlers: {}, cleanupPopupsAsync: async () => {} };
      },
      uniqueOptions(options) { return options; }
    },
    __sensitiveFields: {
      sensitiveFieldInfo() { return {}; }
    },
    __choiceSelection: {
      inferChoiceSelectionMode() { return { selectionMode: 'single', multiple: false, selectionModeReason: '' }; }
    },
    __choiceGroupDiscovery: {
      createCollector() {
        return {
          collectChoiceGroupFields() {
            return [
              { selector: '#late-question', label: 'Question', options: [] }
            ];
          },
          choiceInputsIn() { return []; }
        };
      }
    },
    __actionClassification: {
      actionButtonText() { return ''; },
      actionKindForButton() { return 'action'; }
    },
    __capabilityProbe: {
      probeCapabilities() {
        return { scannable: true, status: 'scannable', reason: null, message: 'ok', evidence: {} };
      }
    },
    ...overrides
  };

  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'scanner', 'scanner-engine.js'), 'utf8'), context);

  const early = {
    selector: '#first-field',
    label: 'Full name',
    compareDocumentPosition(other) {
      return other === late ? context.Node.DOCUMENT_POSITION_FOLLOWING : 0;
    }
  };
  const late = {
    selector: '#late-question',
    label: 'Question',
    compareDocumentPosition(other) {
      return other === early ? context.Node.DOCUMENT_POSITION_PRECEDING : 0;
    }
  };

  elementsBySelector.set('#first-field', early);
  elementsBySelector.set('#late-question', late);

  const input = {
    selector: '#first-field',
    label: 'Full name',
    controlType: 'textarea',
    tagName: 'TEXTAREA',
    parentElement: null,
    disabled: false,
    readOnly: false,
    multiple: false,
    isContentEditable: false,
    getAttribute() { return null; },
    getRootNode() { return document; }
  };

  context.__controlClassification.controlInfoFor = function (element) {
    return {
      controlType: element.controlType || 'file',
      controlFamily: 'text',
      facts: { nativeType: element.controlType || 'file', ariaHasPopup: '' },
      optionSourceGroup: ''
    };
  };

  context.__labelDiscovery.labelFor = function (element) {
    return element.label || '';
  };

  collectElementsImpl = function (rootNode, selector) {
    if (rootNode === document && selector === 'button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"], a[role="button"], [aria-haspopup]:not(input):not(select):not(textarea)') {
      return [];
    }

    if (rootNode === document && selector === 'input[type="radio"], input[type="checkbox"]') {
      return [];
    }

    if (rootNode === document && selector === '[data-question], [class*="question"], [class*="field"], fieldset') {
      return [];
    }

    if (rootNode === document && selector === 'input:not([type="hidden"]):not([type="file"]):not([id*="recaptcha"]):not([name*="recaptcha"]):not([id*="hcaptcha"]):not([name*="hcaptcha"])') {
      return [];
    }

    if (rootNode === document && selector === 'textarea:not([id*="recaptcha"]):not([name*="recaptcha"]):not([id*="hcaptcha"]):not([name*="hcaptcha"])') {
      return [input];
    }

    if (rootNode === document && selector === 'select') {
      return [];
    }

    if (rootNode === document && selector === '[role="combobox"]') {
      return [];
    }

    if (rootNode === document && selector === '[role="textbox"]') {
      return [];
    }

    if (rootNode === document && selector === '[role="searchbox"]') {
      return [];
    }

    if (rootNode === document && selector === '[aria-haspopup="listbox"]') {
      return [];
    }

    return [];
  };

  return context;
}

test('scanner returns fields in document order after mixing choice groups and normal controls', async () => {
  const context = load();
  const result = await context.__scannerEngine.findFields();
  assert.equal(Array.from(result, field => field.selector).join('|'), '#first-field|#late-question');
});
