const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const rulesPath = path.join(root, 'metadata', 'generic-field-control-rules.json');

function loadRules() {
  return JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
}

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function matchesExpected(facts, expected) {
  return Object.keys(expected).every(key => {
    if (key === 'labelContains') return normalize(facts.labelText).includes(normalize(expected[key]));
    return facts[key] === normalize(expected[key]);
  });
}

function matchesRule(facts, rule) {
  return Array.isArray(rule.any) && rule.any.some(expected => matchesExpected(facts, expected));
}

function classify(rules, facts) {
  const match = rules.controlTypes.find(rule => matchesRule(facts, rule));
  const fallback = rules.fallback;
  return match || fallback;
}

function selectionMode(rules, facts, family) {
  const selectionFacts = { ...facts, controlFamily: normalize(family) };
  const match = rules.selectionModes.find(rule => matchesRule(selectionFacts, rule));
  return match ? match.selectionMode : '';
}

test('field-control-rules JSON is the source of generic field discovery policy', () => {
  const rules = loadRules();
  assert.equal(rules.schemaVersion, 3);
  assert.ok(rules.fieldSelectors.length >= 10);
  assert.ok(rules.controlTypes.length >= 15);
  assert.ok(rules.optionSources.combobox.length >= 3);
  assert.ok(rules.extractionActions.comboboxPopup.length >= 5);
  assert.ok(rules.sensitiveFieldDetection.categories.length >= 5);
});

test('characterization: native controls classify the same way as existing detector rules', () => {
  const rules = loadRules();
  assert.equal(classify(rules, { nativeType: 'email', tagName: 'input', role: '', ariaHasPopup: '', labelText: '' }).controlType, 'email');
  assert.equal(classify(rules, { nativeType: 'radio', tagName: 'input', role: '', ariaHasPopup: '', labelText: '' }).controlType, 'radio');
  assert.equal(classify(rules, { nativeType: 'checkbox', tagName: 'input', role: '', ariaHasPopup: '', labelText: '' }).controlType, 'checkboxBoolean');
  assert.equal(classify(rules, { nativeType: '', tagName: 'select', role: '', ariaHasPopup: '', labelText: '' }).controlType, 'select');
  assert.equal(classify(rules, { nativeType: '', tagName: 'textarea', role: '', ariaHasPopup: '', labelText: '' }).controlType, 'textarea');
});

test('characterization: choice selection defaults to single and explicit multi-answer wording wins', () => {
  const rules = loadRules();
  const facts = { nativeType: '', tagName: 'select', role: '', ariaHasPopup: '', labelText: '' };
  assert.equal(selectionMode(rules, facts, 'choice'), 'single');
  assert.equal(selectionMode(rules, { ...facts, labelText: 'Select all that apply' }, 'choice'), 'multiple');
});

test('characterization: sensitive-field keywords remain data-driven', () => {
  const rules = loadRules();
  const categories = Object.fromEntries(rules.sensitiveFieldDetection.categories.map(x => [x.subCategory, x.keywords]));
  assert.ok(categories.raceEthnicity.includes('race'));
  assert.ok(categories.genderIdentity.includes('gender'));
  assert.ok(categories.veteranStatus.includes('veteran status'));
});

test('generic rules JSON is directly consumable as the browser metadata payload', () => {
  const rules = loadRules();
  const context = { __fieldControlRules: rules };
  assert.deepEqual(JSON.parse(JSON.stringify(context.__fieldControlRules)), rules);
});
