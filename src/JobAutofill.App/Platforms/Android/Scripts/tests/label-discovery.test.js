const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function load(overrides = {}) {
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
      }
    },
    window: null,
    ...overrides
  };
  context.window = context;
  context.getComputedStyle = () => ({ display: 'block', visibility: 'visible' });
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'generic-engine', 'label-discovery.js'), 'utf8'), context);
  return context.__labelDiscovery;
}

function el(attrs = {}, extras = {}) {
  const attributes = { ...attrs };
  return {
    id: attributes.id || '',
    labels: extras.labels || [],
    parentElement: extras.parentElement || null,
    textContent: extras.textContent || '',
    getAttribute(name) { return attributes[name] ?? null; },
    getRootNode() { return extras.root || { querySelector() { return null; } }; },
    getBoundingClientRect() { return { width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20 }; },
    matches() { return false; },
    closest() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
}

function label(text) {
  return { textContent: text, getAttribute() { return null; }, matches() { return false; }, querySelector() { return null; }, querySelectorAll() { return []; } };
}

test('characterization: associated element.labels label wins', () => {
  const d = load();
  const input = el({}, { labels: [label('First name')] });
  assert.equal(d.labelFor(input), 'First name');
});

test('characterization: aria-labelledby is used when no direct label exists', () => {
  const d = load();
  const ref = label('Email address');
  const root = { querySelector(selector) { return selector === '#label1' ? ref : null; }, querySelectorAll() { return []; } };
  const input = el({ 'aria-labelledby': 'label1' }, { root });
  assert.equal(d.labelFor(input), 'Email address');
});

test('characterization: aria-label is preferred over generic placeholder', () => {
  const d = load();
  const input = el({ 'aria-label': 'Work email', placeholder: 'Enter value' });
  assert.equal(d.labelFor(input), 'Work email');
});

test('characterization: generic placeholder text is rejected', () => {
  const d = load();
  const input = el({ placeholder: 'Select...' });
  assert.equal(d.labelFor(input), '');
});

test('characterization: labels are clipped at the existing maximum', () => {
  const d = load();
  const long = 'A'.repeat(220);
  const input = el({}, { labels: [label(long)] });
  assert.ok(d.labelFor(input).length <= 180);
});

test('textContentAcrossOpenRoots traverses element children', () => {
  const d = load();
  const root = {
    nodeType: 1,
    childNodes: [
      { nodeType: 3, textContent: 'Visible label' }
    ]
  };

  assert.equal(d.textContentAcrossOpenRoots(root), 'Visible label');
});

test('label discovery excludes live validation text from labels', () => {
  const d = load();
  const message = {
    tagName: 'SPAN',
    nodeType: 1,
    childNodes: [{ nodeType: 3, textContent: 'No location found. Try entering a different location' }],
    getAttribute(name) { return name === 'role' ? 'alert' : null; }
  };
  const root = {
    getAttribute() { return null; },
    querySelector(selector) { return selector === 'span' ? message : null; },
    childNodes: [
      { nodeType: 3, textContent: 'Current location' },
      message
    ]
  };

  assert.equal(d.bestQuestionText(root), 'Current location');
});

test('label discovery exposes live validation text as field message', () => {
  const root = {
    querySelectorAll() {
      return [
        {
          textContent: 'No location found. Try entering a different location',
          getAttribute(name) {
            return name === 'role' ? 'alert' : null;
          }
        }
      ];
    }
  };
  const d = load({
    __genericDomTraversal: {
      composedClosest() { return root; },
      composedParentElement() { return null; }
    }
  });
  const input = el({}, {});

  assert.equal(
    d.fieldMessageFor(input, 'Current location'),
    'No location found. Try entering a different location'
  );
});
