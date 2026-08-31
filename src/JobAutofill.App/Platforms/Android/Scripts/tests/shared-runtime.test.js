const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const document = {
    readyState: 'complete',
    title: 'test',
    body: {
      innerText: '',
      appendChild() {},
      focus() {}
    },
    documentElement: {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() {
      return {
        style: {},
        setAttribute() {},
        focus() {},
        blur() {},
        remove() {}
      };
    },
    addEventListener() {}
  };

  const context = {
    console,
    URL,
    Set,
    WeakMap,
    Promise,
    document,
    location: { href: 'https://example.test/form' },
    CSS: { escape: value => String(value) },
    Element: function Element() {},
    HTMLInputElement: function HTMLInputElement() {},
    HTMLTextAreaElement: function HTMLTextAreaElement() {},
    HTMLSelectElement: function HTMLSelectElement() {},
    MouseEvent: function MouseEvent() {},
    KeyboardEvent: function KeyboardEvent() {},
    PointerEvent: function PointerEvent() {},
    Event: function Event() {},
    InputEvent: function InputEvent() {},
    MutationObserver: function MutationObserver() { this.observe = () => {}; this.disconnect = () => {}; },
    getSelection() { return { removeAllRanges() {}, addRange() {} }; },
    setTimeout,
    clearTimeout,
    window: null
  };

  context.Element.prototype = { attachShadow() { return {}; } };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared', 'shared-runtime.js'), 'utf8'), context);
  return context;
}

test('shared runtime initializes domShared helpers', () => {
  const context = load();
  assert.equal(typeof context.__domShared.normalize, 'function');
  assert.equal(context.__domShared.normalize('  Portfolio URL  '), 'portfolio url');
});
