const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function load() {
  const context = {
    console,
    Set,
    Array,
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9, DOCUMENT_FRAGMENT_NODE: 11 },
    ShadowRoot: function ShadowRoot() {},
    document: { body: null },
    __textUtils: {
      humanize: value => String(value || '').replace(/^#+/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(),
      compactText: value => String(value || '').replace(/\s+/g, ' ').trim(),
      clipText(value, maxLength) {
        const text = String(value || '');
        return text.length <= maxLength ? text : text.slice(0, maxLength).replace(/\s+\S*$/, '').trim();
      },
      normalize: value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase()
    },
    __genericDomTraversal: {
      composedParentElement: element => element.parentElement || null,
      composedClosest: () => null
    },
    window: null
  };
  context.window = context;
  context.getComputedStyle = () => ({ display: 'block', visibility: 'visible' });
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'generic-engine', 'label-discovery.js'), 'utf8'), context);
  return context.__labelDiscovery;
}

test('label discovery rejects native select labels polluted by option text', () => {
  const discovery = load();
  const select = {
    tagName: 'SELECT',
    id: '',
    options: [
      { textContent: 'Select...' },
      { textContent: 'Male' },
      { textContent: 'Female' },
      { textContent: 'Decline to self identify' }
    ],
    labels: [],
    parentElement: null,
    getAttribute(name) {
      return name === 'aria-labelledby' ? 'gender-label' : null;
    },
    getRootNode() {
      return {
        getElementById(id) {
          return id === 'gender-label'
            ? { textContent: 'Gender Select ... Male Female Decline to self identify' }
            : null;
        },
        querySelector() { return null; }
      };
    }
  };

  assert.equal(discovery.labelFor(select), '');
});
