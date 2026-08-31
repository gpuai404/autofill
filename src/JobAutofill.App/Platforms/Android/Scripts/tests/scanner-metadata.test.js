const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const root = path.join(__dirname, '..');
  const context = {
    console,
    URL,
    location: { href: 'https://example.test/form' },
    document: {},
    window: null,
    __fieldControlRules: { schemaVersion: 3, fieldSelectors: ['initial'] },
    __metadataResolver: { resolve: () => ({ packageId: 'generic', hostname: 'example.test', package: { id: 'generic', rules: { schemaVersion: 3, fieldSelectors: ['from-metadata'] } } }) },
    __scannerEngine: {
      classifyPage: () => ({ classification: 'supported' }),
      findFields: () => [{ selector: '#name' }],
      extractOptionsForField: async selector => ({ ok: true, selector, options: [] }),
      closeOpenOptionPopups: () => Promise.resolve(true)
    }
  };
  context.window = context;
  context.__scanDiagnostics = { recordError() {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'scanner/scanner.js'), 'utf8'), context);
  return context;
}

test('scanner applies resolved generic metadata before scanning', async () => {
  const c = load();
  assert.deepEqual(await c.__scanFields(), [{ selector: '#name' }]);
  assert.deepEqual(c.__fieldControlRules.fieldSelectors, ['from-metadata']);
  assert.equal(c.__scanMetadata.packageId, 'generic');
});

test('scanner applies resolved metadata before targeted option extraction', async () => {
  const c = load();
  await c.__extractOptionsForField('#country');
  assert.deepEqual(c.__fieldControlRules.fieldSelectors, ['from-metadata']);
});
