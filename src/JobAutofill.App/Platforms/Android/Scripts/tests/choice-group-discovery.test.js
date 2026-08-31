const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const documentRef = {};
  const context = {
    console,
    document: documentRef,
    window: null
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'generic-engine', 'choice-group-discovery.js'), 'utf8'), context);
  return { discovery: context.__choiceGroupDiscovery, documentRef };
}

test('choice group discovery keeps the better labeled field when nested roots describe the same choices', () => {
  const { discovery, documentRef } = load();
  const optionA = { key: 'a', type: 'checkbox', value: 'Yes', checked: false, disabled: false, getAttribute(name) { return name === 'aria-disabled' ? null : null; } };
  const optionB = { key: 'b', type: 'checkbox', value: 'No', checked: false, disabled: false, getAttribute(name) { return name === 'aria-disabled' ? null : null; } };
  const badRoot = { key: 'bad', role: null };
  const goodRoot = { key: 'good', role: null };
  optionA.parentElement = goodRoot;
  optionB.parentElement = goodRoot;
  goodRoot.parentElement = badRoot;
  badRoot.parentElement = documentRef.body || null;

  const rootChoices = new Map([
    [badRoot, [optionA, optionB]],
    [goodRoot, [optionA, optionB]]
  ]);

  const collector = discovery.createCollector({
    collectElementsAcrossRoots(root, selector) {
      if (root === documentRef && selector === '[role="radiogroup"], [role="group"]') {
        return [];
      }

      if (root === documentRef && selector === 'input[type="radio"], input[type="checkbox"]') {
        return [optionA, optionB];
      }

      if (root === documentRef && selector === '[data-question], [class*="question"], [class*="field"], fieldset') {
        return [badRoot, goodRoot];
      }

      if (selector === 'input[type="checkbox"]') {
        return rootChoices.get(root) || [];
      }

      if (selector === '[role="checkbox"]') {
        return [];
      }

      return [];
    },
    isVisible() { return true; },
    normalize(value) { return String(value || '').trim().toLowerCase(); },
    selectorFor(element) { return element.key; },
    clippedLabel(value) { return value; },
    isUsableLabelText(value) { return Boolean(value); },
    isMeaningfulLabelText(value) { return Boolean(value); },
    composedClosest(element, selector) {
      if (selector === '[data-question], [class*="question"], [class*="field"], fieldset') {
        return element === optionA || element === optionB ? goodRoot : null;
      }

      return null;
    },
    textFromLabelledBy() { return ''; },
    textContentAcrossOpenRoots() { return ''; },
    bestQuestionText(root) { return root === goodRoot ? 'Will you require visa sponsorship?' : 'Yes'; },
    requirementInfoFor() { return { required: false, optional: false }; },
    nonApplicationControlReason() { return ''; },
    buildChoiceField(root, options) {
      return {
        selector: root.key,
        label: root === goodRoot ? 'Will you require visa sponsorship?' : 'Yes',
        options
      };
    },
    choiceOption(value, label, selector, selected) {
      return { value, label, selector, selected };
    },
    uniqueOptions(options) { return options; },
    questionRootSelector: '[data-question], [class*="question"], [class*="field"], fieldset',
    choiceVisualControlSelector: '[role="checkbox"]'
  });

  const fields = collector.collectChoiceGroupFields(new Set());
  assert.equal(fields.length, 1);
  assert.equal(fields[0].label, 'Will you require visa sponsorship?');
});

test('choice group discovery climbs past option-only text to find the question label', () => {
  const { discovery, documentRef } = load();
  const outerRoot = { key: 'outer', parentElement: documentRef.body || null };
  const innerRoot = { key: 'inner', parentElement: outerRoot };
  const optionA = { key: 'a', type: 'checkbox', value: 'Yes', checked: false, disabled: false, parentElement: innerRoot, getAttribute() { return null; } };
  const optionB = { key: 'b', type: 'checkbox', value: 'No', checked: false, disabled: false, parentElement: innerRoot, getAttribute() { return null; } };

  const rootChoices = new Map([
    [innerRoot, [optionA, optionB]],
    [outerRoot, [optionA, optionB]]
  ]);

  const collector = discovery.createCollector({
    collectElementsAcrossRoots(root, selector) {
      if (root === documentRef && selector === '[role="radiogroup"], [role="group"]') {
        return [];
      }

      if (root === documentRef && selector === 'input[type="radio"], input[type="checkbox"]') {
        return [optionA, optionB];
      }

      if (selector === 'input[type="checkbox"]') {
        return rootChoices.get(root) || [];
      }

      if (selector === '[role="checkbox"]') {
        return [];
      }

      return [];
    },
    isVisible() { return true; },
    normalize(value) { return String(value || '').trim().toLowerCase(); },
    selectorFor(element) { return element.key; },
    clippedLabel(value) { return value; },
    isUsableLabelText(value) { return Boolean(value); },
    isMeaningfulLabelText(value) { return Boolean(value); },
    composedClosest(element, selector) {
      if (selector === '[data-question], [class*="question"], [class*="field"], fieldset') {
        return element === optionA || element === optionB ? innerRoot : null;
      }

      return null;
    },
    textFromLabelledBy() { return ''; },
    textContentAcrossOpenRoots() { return ''; },
    bestQuestionText(root) {
      return root === innerRoot ? 'Yes' : 'Will you require visa sponsorship now or in the future?';
    },
    requirementInfoFor() { return { required: false, optional: false }; },
    nonApplicationControlReason() { return ''; },
    buildChoiceField(root, options, config) {
      return { selector: root.key, label: config.fieldLabel || '', options };
    },
    choiceOption(value, label, selector, selected) {
      return { value, label, selector, selected };
    },
    uniqueOptions(options) { return options; },
    questionRootSelector: '[data-question], [class*="question"], [class*="field"], fieldset',
    choiceVisualControlSelector: '[role="checkbox"]'
  });

  const fields = collector.collectChoiceGroupFields(new Set());
  assert.equal(fields.length, 1);
  assert.equal(fields[0].label, 'Will you require visa sponsorship now or in the future?');
});

test('choice group discovery builds native groups from input-driven roots instead of broad document roots', () => {
  const { discovery, documentRef } = load();
  const optionA = { key: 'a', type: 'checkbox', value: 'Yes', checked: false, disabled: false, getAttribute(name) { return name === 'aria-disabled' ? null : null; } };
  const optionB = { key: 'b', type: 'checkbox', value: 'No', checked: false, disabled: false, getAttribute(name) { return name === 'aria-disabled' ? null : null; } };
  const broadRoot = { key: 'broad', role: null };
  const questionRoot = { key: 'question', role: null };
  optionA.parentElement = questionRoot;
  optionB.parentElement = questionRoot;
  questionRoot.parentElement = broadRoot;
  broadRoot.parentElement = documentRef.body || null;

  const rootChoices = new Map([
    [broadRoot, [optionA, optionB]],
    [questionRoot, [optionA, optionB]]
  ]);

  const collector = discovery.createCollector({
    collectElementsAcrossRoots(root, selector) {
      if (root === documentRef && selector === '[role="radiogroup"], [role="group"]') {
        return [];
      }

      if (root === documentRef && selector === '[data-question], [class*="question"], .application-question, .question, fieldset') {
        return [broadRoot, questionRoot];
      }

      if (root === documentRef && selector === 'input[type="radio"], input[type="checkbox"]') {
        return [optionA, optionB];
      }

      if (selector === 'input[type="checkbox"]') {
        return rootChoices.get(root) || [];
      }

      if (selector === '[role="checkbox"]') {
        return [];
      }

      return [];
    },
    isVisible() { return true; },
    normalize(value) { return String(value || '').trim().toLowerCase(); },
    selectorFor(element) { return element.key; },
    clippedLabel(value) { return value; },
    isUsableLabelText(value) { return Boolean(value); },
    isMeaningfulLabelText(value) { return Boolean(value); },
    composedClosest(element, selector) {
      if (selector === '[data-question], [class*="question"], .application-question, .question, fieldset') {
        return element === optionA || element === optionB ? questionRoot : null;
      }

      return null;
    },
    textFromLabelledBy() { return ''; },
    textContentAcrossOpenRoots() { return ''; },
    bestQuestionText(root) { return root === broadRoot ? 'Submit your application' : 'Will you require visa sponsorship?'; },
    requirementInfoFor() { return { required: false, optional: false }; },
    nonApplicationControlReason() { return ''; },
    buildChoiceField(root, options) {
      return {
        selector: root.key,
        label: root === broadRoot ? 'Submit your application' : 'Will you require visa sponsorship?',
        options
      };
    },
    choiceOption(value, label, selector, selected) {
      return { value, label, selector, selected };
    },
    uniqueOptions(options) { return options; },
    questionRootSelector: '[data-question], [class*="question"], .application-question, .question, fieldset',
    choiceVisualControlSelector: '[role="checkbox"]'
  });

  const fields = collector.collectChoiceGroupFields(new Set());
  assert.equal(fields.length, 1);
  assert.equal(fields[0].selector, 'question');
  assert.equal(fields[0].label, 'Will you require visa sponsorship?');
});
