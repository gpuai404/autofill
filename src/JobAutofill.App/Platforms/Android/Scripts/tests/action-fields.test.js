const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function load(overrides = {}) {
  const context = {
    console,
    URL,
    Node: {
      DOCUMENT_POSITION_PRECEDING: 2,
      DOCUMENT_POSITION_FOLLOWING: 4
    },
    document: {
      title: 'Action field test',
      readyState: 'complete',
      body: {},
      querySelectorAll() { return []; },
      addEventListener() {},
      removeEventListener() {}
    },
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
      collectElementsAcrossRoots(root, selector) {
        if (selector === 'button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"], a[role="button"], [aria-haspopup]:not(input):not(select):not(textarea)') {
          return [
            {
              tagName: 'BUTTON',
              textContent: 'Submit application',
              disabled: false,
              getAttribute(name) {
                return name === 'type' ? 'submit' : null;
              }
            }
          ];
        }

        return [];
      },
      composedParentElement() { return null; },
      composedClosest() { return null; }
    },
    __textUtils: {
      cssEscape(value) { return String(value); },
      compactText(value) { return String(value || '').trim(); },
      normalize(value) { return String(value || '').trim().toLowerCase(); },
      clipText(value) { return String(value || ''); }
    },
    __selectorResolver: {
      selectorFor(element) { return element.tagName === 'BUTTON' ? '#submit' : ''; },
      resolveScopedSelector(selector) {
        return selector === '#submit'
          ? { compareDocumentPosition() { return 0; } }
          : null;
      }
    },
    __labelDiscovery: {
      labelFor() { return ''; },
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
      controlInfoFor() {
        return {
          controlType: 'text',
          controlFamily: 'text',
          facts: { nativeType: 'text', ariaHasPopup: '' },
          optionSourceGroup: ''
        };
      },
      selectionModeFor() { return { selectionMode: 'single', selectionModeReason: '' }; },
      buildFieldModel(input) { return input; }
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
    __sensitiveFields: { sensitiveFieldInfo() { return {}; } },
    __choiceSelection: { inferChoiceSelectionMode() { return { selectionMode: 'single', multiple: false, selectionModeReason: '' }; } },
    __choiceGroupDiscovery: { createCollector() { return { collectChoiceGroupFields() { return []; }, choiceInputsIn() { return []; } }; } },
    __capabilityProbe: {
      probeCapabilities() {
        return { scannable: true, status: 'scannable', reason: null, message: 'ok', evidence: {} };
      }
    },
    ...overrides
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'generic-engine', 'action-classification.js'), 'utf8'), context);
  context.__actionClassification = context.__actionClassification;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'scanner', 'scanner-engine.js'), 'utf8'), context);
  return context;
}

test('scanner includes submit buttons as manual-only detected fields', async () => {
  const context = load();
  const fields = await context.__scannerEngine.findFields();
  assert.equal(fields.length, 1);
  assert.equal(fields[0].label, 'Submit application');
  assert.equal(fields[0].controlType, 'actionButton');
  assert.equal(fields[0].fillStrategy, 'skip');
});

test('scanner includes provider apply buttons as action fields', async () => {
  const context = load({
    __genericDomTraversal: {
      collectElementsAcrossRoots(root, selector) {
        if (selector === 'button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"], a[role="button"], [aria-haspopup]:not(input):not(select):not(textarea)') {
          return [
            {
              tagName: 'BUTTON',
              textContent: 'Apply with LinkedIn',
              disabled: false,
              getAttribute(name) {
                return name === 'type' ? 'submit' : null;
              }
            }
          ];
        }

        return [];
      },
      composedParentElement() { return null; },
      composedClosest() { return null; }
    }
  });
  const fields = await context.__scannerEngine.findFields();
  assert.equal(fields.length, 1);
  assert.equal(fields[0].label, 'Apply with LinkedIn');
  assert.equal(fields[0].controlType, 'actionButton');
  assert.equal(fields[0].inputType, 'sso');
  assert.equal(fields[0].fillStrategy, 'skip');
});
