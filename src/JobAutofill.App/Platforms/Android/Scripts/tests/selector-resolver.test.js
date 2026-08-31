const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load(document) {
  const context = {
    Array,
    Set,
    ShadowRoot: class ShadowRoot {},
    document,
    window: null,
    __textUtils: {
      cssEscape: value => String(value).replace(/"/g, '\\"'),
      normalize: value => String(value || '').trim().toLowerCase()
    },
    __domShared: { shadowRootFor: element => element && element.shadowRoot },
    __genericDomTraversal: { collectElementsAcrossRoots: () => [] }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared', 'selector-resolver.js'), 'utf8'), context);
  return context.__selectorResolver;
}

test('selector resolver provides selector creation and lookup from one shared API', () => {
  const field = { id: 'given-name' };
  const document = {
    body: {},
    querySelector: selector => selector === '#given-name' ? field : null
  };
  const resolver = load(document);

  assert.equal(resolver.selectorFor(field), '#given-name');
  assert.equal(resolver.resolveScopedSelector('#given-name'), field);
});

test('selector resolver avoids shared name selectors when the name is not unique', () => {
  const parent = { children: [] };
  const first = {
    tagName: 'INPUT',
    id: '',
    name: 'answer',
    ownerDocument: null,
    parentElement: parent,
    getAttribute() { return null; },
    getRootNode() { return document; }
  };
  const second = {
    tagName: 'INPUT',
    id: '',
    name: 'answer',
    ownerDocument: null,
    parentElement: parent,
    getAttribute() { return null; },
    getRootNode() { return document; }
  };
  parent.children = [first, second];

  const document = {
    body: {},
    querySelectorAll(selector) {
      if (selector === '[name="answer"]') {
        return [first, second];
      }

      if (selector === 'input:nth-of-type(1)') {
        return [first];
      }

      return [];
    }
  };

  first.ownerDocument = document;
  second.ownerDocument = document;

  const resolver = load(document);
  assert.equal(resolver.selectorFor(first), 'input:nth-of-type(1)');
});
