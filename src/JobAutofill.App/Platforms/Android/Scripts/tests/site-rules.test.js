const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

function load(files, overrides = {}) {
  const listeners = new Map();
  const context = vm.createContext(Object.assign({
    console: { error() {} },
    location: { href: 'https://example.test/job' },
    document: { title: 'Job', readyState: 'complete', querySelector() { return null; } },
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type) { listeners.delete(type); }
  }, overrides));
  context.window = context;
  files.forEach(file => vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context));
  return { context, listeners };
}

test('generic rules merge shared widget behavior through the validated runtime', () => {
  const { context } = load(['site-rules/runtime.js', 'site-rules/known-widget-libraries.js', 'site-rules/default.js']);
  assert.equal(context.__jobAutofillSiteRules.id, 'generic');
  assert.equal(context.__jobAutofillSiteRules.options.optionIdPrefix, 'react-select-');
  assert.ok(context.__jobAutofillSiteRules.exclude.controls.length > 0);
  assert.equal(Object.isFrozen(context.__jobAutofillSiteRules), true);
});

test('site runtime merges declarative overrides and rejects unsupported hooks', () => {
  const { context } = load(['site-rules/runtime.js', 'site-rules/known-widget-libraries.js']);
  context.__jobAutofillSiteRuleRuntime.defineSiteRules({
    id: 'fixture',
    version: 1,
    roots: { application: ['main'] },
    discovery: { fieldSelectors: ['custom-input'] },
    options: { popupSelectors: ['custom-popup'] },
    filling: { openActions: ['activate', 'arrowDown'] }
  });
  assert.deepEqual(Array.from(context.__jobAutofillSiteRules.roots.application), ['main']);
  assert.deepEqual(Array.from(context.__jobAutofillSiteRules.discovery.fieldSelectors), ['custom-input']);
  assert.throws(() => context.__jobAutofillSiteRuleRuntime.defineSiteRules({
    id: 'invalid', hooks: { arbitrary() {} }
  }), /Unsupported site-rule hook/);
});

test('diagnostic browser hooks are installed only when explicitly enabled and can be disposed', () => {
  const disabled = load(['generic-engine/diagnostics.js']);
  disabled.context.__scanDiagnostics.initialize({ enableDiagnostics: false });
  assert.equal(disabled.listeners.size, 0);

  const enabled = load(['generic-engine/diagnostics.js']);
  enabled.context.__scanDiagnostics.initialize({ enableDiagnostics: true });
  assert.equal(enabled.listeners.has('error'), true);
  assert.equal(enabled.listeners.has('unhandledrejection'), true);
  enabled.context.__scanDiagnostics.dispose();
  assert.equal(enabled.listeners.size, 0);
});
