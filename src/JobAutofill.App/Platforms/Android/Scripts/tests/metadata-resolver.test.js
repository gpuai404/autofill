const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function load(files, location = 'https://example.test/form') {
  const context = { console, URL, window: null, document: {}, location: { href: location } };
  context.window = context;
  vm.createContext(context);
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  return context;
}

test('generic metadata resolves by default', () => {
  const c = load(['metadata/metadata-resolver.js']);
  c.__fieldControlRules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'metadata/generic-field-control-rules.json'), 'utf8'));
  const result = c.__metadataResolver.resolve({ url: 'https://unknown.example/form' });
  assert.equal(result.packageId, 'generic');
});

test('more specific metadata wins over generic metadata', () => {
  const c = load(['metadata/metadata-resolver.js']);
  c.__fieldControlRules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'metadata/generic-field-control-rules.json'), 'utf8'));
  const generic = { id: 'generic', priority: 0, matches: [], rules: c.__fieldControlRules };
  const custom = { id: 'acme', priority: 0, matches: [{ hostname: 'app.acme.test' }], rules: {} };
  const result = c.__metadataResolver.resolve({ url: 'https://app.acme.test/form', packages: [generic, custom] });
  assert.equal(result.packageId, 'acme');
});

test('runtime site metadata payload participates in package resolution', () => {
  const c = load(['metadata/metadata-resolver.js']);
  c.__fieldControlRules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'metadata/generic-field-control-rules.json'), 'utf8'));
  c.__siteMetadataPayload = {
    id: 'runtime-acme',
    priority: 0,
    matches: [{ hostname: 'jobs.acme.test' }],
    rules: { fieldSelectors: ['[data-runtime-field]'] }
  };

  const result = c.__metadataResolver.resolve({ url: 'https://jobs.acme.test/apply' });
  assert.equal(result.packageId, 'runtime-acme');
  assert.deepEqual(result.package.rules.fieldSelectors, ['[data-runtime-field]']);
});
