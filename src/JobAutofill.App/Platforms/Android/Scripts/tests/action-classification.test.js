const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const context = {
    console,
    window: null,
    __textUtils: {
      normalize(value) { return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase(); },
      compactText(value) { return String(value || '').replace(/\s+/g, ' ').trim(); },
      clipText(value) { return String(value || ''); }
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'generic-engine', 'action-classification.js'), 'utf8'), context);
  return context.__actionClassification;
}

test('action classification recognizes submit buttons', () => {
  const actions = load();
  const element = {
    textContent: 'Submit your application',
    getAttribute(name) {
      return name === 'type' ? 'submit' : null;
    }
  };

  const text = actions.actionButtonText(element);
  assert.equal(actions.actionKindForButton(element, text), 'submit');
});

test('action classification recognizes provider apply buttons as sso actions', () => {
  const actions = load();
  const element = {
    textContent: 'Apply with LinkedIn',
    getAttribute(name) {
      return name === 'type' ? 'submit' : null;
    }
  };

  const text = actions.actionButtonText(element);
  assert.equal(actions.actionKindForButton(element, text), 'sso');
});
