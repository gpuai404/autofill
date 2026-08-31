const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function load(overrides = {}) {
  const context = {
    console,
    URL,
    location: { href: 'https://example.test/form' },
    document: {},
    window: null,
    __metadataResolver: { resolve: () => ({ packageId: 'generic', hostname: 'example.test' }) },
    __scannerEngine: {
      classifyPage: () => ({ classification: 'supported' }),
      findFields: () => [{ selector: '#name' }],
      extractOptionsForField: async selector => ({ ok: true, selector, options: [] }),
      closeOpenOptionPopups: () => Promise.resolve(true)
    },
    ...overrides
  };
  context.window = context;
  context.__scanDiagnostics = {
    recordError(error, source, line) {
      context.recordedError = { error, source, line };
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'scanner/scanner.js'), 'utf8'), context);
  return context;
}

test('scanner preserves public scan contract', async () => {
  const c = load();
  assert.deepEqual(await c.__scanFields(), [{ selector: '#name' }]);
  assert.equal(c.__scanMetadata.packageId, 'generic');
  assert.equal(c.__classifyPage().metadata.packageId, 'generic');
});

test('scanner delegates targeted option extraction', async () => {
  const c = load();
  const result = await c.__extractOptionsForField('#country');
  assert.equal(result.selector, '#country');
});

test('scanner records scan errors through shared diagnostics', async () => {
  const c = load({
    __scannerEngine: {
      findFields: () => { throw new Error('scan failed'); }
    }
  });

  assert.equal((await c.__scanFields()).length, 0);
  assert.equal(c.recordedError.source, 'scan');
  assert.equal(c.recordedError.line, 'n/a');
});
