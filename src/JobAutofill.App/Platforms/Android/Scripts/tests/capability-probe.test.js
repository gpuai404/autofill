const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createElement(tagName, options = {}) {
  const element = {
    tagName,
    parentElement: options.parentElement || null,
    shadowRoot: options.shadowRoot || null,
    contentDocument: options.contentDocument || null,
    src: options.src || '',
    style: options.style || {},
    children: options.children || [],
    innerText: options.innerText || '',
    textContent: options.textContent || '',
    className: options.className || '',
    attributes: options.attributes || {},
    getBoundingClientRect() {
      return options.rect || { width: 300, height: 40 };
    },
    getAttribute(name) {
      return this.attributes[name] ?? null;
    },
    querySelectorAll() {
      return [];
    },
    closest() {
      return this.parentElement;
    }
  };

  return element;
}

function load(overrides = {}) {
  const field = createElement('INPUT', { rect: { width: 300, height: 40 } });
  const iframe = createElement('IFRAME', {
    src: 'https://embed.example.test',
    rect: { width: 600, height: 400 },
    contentDocument: { documentElement: {} }
  });
  const selectors = {
    'form, [role="form"]': [createElement('FORM')],
    'iframe': [iframe],
    '*': [field],
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([id*="recaptcha"]):not([name*="recaptcha"]):not([id*="hcaptcha"]):not([name*="hcaptcha"])': [field]
  };
  const document = {
    readyState: 'complete',
    title: 'Probe test',
    body: { innerText: '', querySelectorAll: () => [] },
    querySelector(selector) {
      const list = selectors[selector] || [];
      return list[0] || null;
    },
    querySelectorAll(selector) {
      return selectors[selector] || [];
    }
  };

  const context = {
    console,
    URL,
    document,
    location: { href: 'https://example.test/form' },
    getComputedStyle(element) {
      return {
        display: element.style.display || 'block',
        visibility: element.style.visibility || 'visible'
      };
    },
    __domShared: {
      normalize(value) {
        return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      },
      isVisible() {
        return true;
      },
      shadowRootFor(element) {
        return element && element.shadowRoot ? element.shadowRoot : null;
      }
    },
    __scanDebug: { errors: [] },
    window: null,
    ...overrides
  };

  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'generic-engine', 'capability-probe.js'), 'utf8'), context);
  return context;
}

test('capability probe remains separate from dom shared runtime', () => {
  const context = load();
  const result = context.__capabilityProbe.probeCapabilities();
  assert.ok(['scannable', 'partial-scan'].includes(result.status));
  assert.equal(typeof result.evidence.standardFieldCount, 'number');
  assert.ok(result.evidence.selectorCounts);
});

test('captcha alone does not downgrade a page that already exposes standard fields', () => {
  const context = load({
    document: {
      readyState: 'complete',
      title: 'Probe test',
      body: { innerText: '', querySelectorAll: () => [] },
      querySelector(selector) {
        if (selector === '[id*="hcaptcha"]') {
          return createElement('DIV');
        }

        return null;
      },
      querySelectorAll(selector) {
        if (selector === 'form, [role="form"]') {
          return [createElement('FORM')];
        }

        if (selector === '*') {
          return [createElement('INPUT', { rect: { width: 300, height: 40 } })];
        }

        if (selector.startsWith('input:not')) {
          return [createElement('INPUT', { rect: { width: 300, height: 40 } })];
        }

        return [];
      }
    }
  });

  const result = context.__capabilityProbe.probeCapabilities();
  assert.equal(result.status, 'scannable');
  assert.equal(result.reason, 'captcha-present');
});
