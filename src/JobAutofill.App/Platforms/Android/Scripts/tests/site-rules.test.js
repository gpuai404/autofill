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
  const { context } = load(['site-rules/known-widget-libraries.js'], {
    __jobAutofillSiteProfile: {
      schemaVersion: 1, siteId: 'generic', profileVersion: 1, hosts: [],
      roots: {}, exclude: {}, discovery: {}, options: {}, filling: {}
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'site-rules/runtime.js'), 'utf8'), context);
  assert.equal(context.__jobAutofillSiteRules.id, 'generic');
  assert.equal(context.__jobAutofillSiteRules.options.optionIdPrefix, 'react-select-');
  assert.ok(context.__jobAutofillSiteRules.exclude.controls.length > 0);
  assert.equal(Object.isFrozen(context.__jobAutofillSiteRules), true);
});

test('site runtime merges declarative overrides and rejects executable or unknown properties', () => {
  const { context } = load(['site-rules/known-widget-libraries.js'], {
    location: { href: 'https://example.test/job', hostname: 'example.test' },
    __jobAutofillConfig: { siteId: 'fixture' },
    __jobAutofillSiteProfile: {
    schemaVersion: 1,
    siteId: 'fixture',
    profileVersion: 1,
    hosts: ['example.test'],
    roots: { application: ['main'] },
    discovery: { fieldSelectors: ['custom-input'] },
    exclude: {},
    options: { popupSelectors: ['custom-popup'] },
    filling: { openActions: ['activate', 'arrowDown'] }
  }});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'site-rules/runtime.js'), 'utf8'), context);
  assert.deepEqual(Array.from(context.__jobAutofillSiteRules.roots.application), ['main']);
  assert.deepEqual(Array.from(context.__jobAutofillSiteRules.discovery.fieldSelectors), ['custom-input']);
  assert.throws(() => context.__jobAutofillSiteRuleRuntime.loadSiteProfile({
    schemaVersion: 1, siteId: 'fixture', profileVersion: 2, hosts: ['example.test'],
    roots: {}, exclude: {}, discovery: {}, options: {}, filling: {}, hooks: { arbitrary: 'code' }
  }), /Unsupported site profile property/);
});

test('every packaged site profile is data-only and accepted for its declared host', () => {
  const profileDirectory = path.join(__dirname, '..', 'site-profiles');
  const profileFiles = fs.readdirSync(profileDirectory)
    .filter(file => file.endsWith('.json') && file !== 'site-profile.schema.json');

  profileFiles.forEach(file => {
    const profile = JSON.parse(fs.readFileSync(path.join(profileDirectory, file), 'utf8'));
    const hostname = profile.hosts[0] || 'unknown.test';
    const configuredSiteId = profile.siteId === 'generic' ? 'unknown' : profile.siteId;
    const { context } = load(['site-rules/known-widget-libraries.js'], {
      location: { href: `https://${hostname}/job`, hostname },
      __jobAutofillConfig: { siteId: configuredSiteId },
      __jobAutofillSiteProfile: profile
    });

    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'site-rules/runtime.js'), 'utf8'), context);
    assert.equal(context.__jobAutofillSiteRules.id, profile.siteId);
    assert.equal(JSON.stringify(profile).includes('function'), false);
  });
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
