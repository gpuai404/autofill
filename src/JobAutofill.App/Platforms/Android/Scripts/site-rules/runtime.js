(function (global) {
  'use strict';

  const SELECTOR_PATHS = [
    ['roots', 'application'],
    ['exclude', 'controls'],
    ['exclude', 'containers'],
    ['discovery', 'fieldSelectors'],
    ['options', 'localRootSelectors'],
    ['options', 'popupSelectors'],
    ['options', 'optionSelectors'],
    ['filling', 'controlRootSelectors'],
    ['filling', 'fieldRootSelectors'],
    ['filling', 'popupOptionSelectors']
  ];
  const HOOK_NAMES = ['extractOptionElements', 'fillControl', 'fillOption'];

  function valueAt(source, path) {
    return path.reduce((value, key) => value && value[key], source);
  }

  function setAt(target, path, value) {
    let current = target;
    path.slice(0, -1).forEach(key => { current = current[key] || (current[key] = {}); });
    current[path[path.length - 1]] = value;
  }

  function selectorArray(value, path) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
      throw new TypeError('Site rule ' + path + ' must be an array of non-empty selectors.');
    }
    value.forEach(selector => {
      try { global.document.querySelector(selector); }
      catch (_) { throw new TypeError('Invalid selector in site rule ' + path + ': ' + selector); }
    });
    return value.slice();
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
  }

  function defineSiteRules(definition) {
    const rules = definition || {};
    if (typeof rules.id !== 'string' || !rules.id.trim()) {
      throw new TypeError('Site rules require a non-empty id.');
    }
    if (rules.version !== undefined && (!Number.isInteger(rules.version) || rules.version < 1)) {
      throw new TypeError('Site rules version must be a positive integer.');
    }

    const base = global.__jobAutofillBaseRules || {};
    const resolved = { id: rules.id, version: rules.version || 1, hooks: {} };
    SELECTOR_PATHS.forEach(path => {
      const pathName = path.join('.');
      const values = selectorArray(valueAt(base, path), pathName)
        .concat(selectorArray(valueAt(rules, path), pathName));
      setAt(resolved, path, Array.from(new Set(values)));
    });
    const openActions = valueAt(rules, ['filling', 'openActions']) ||
      valueAt(base, ['filling', 'openActions']) || [];
    if (!Array.isArray(openActions) || openActions.some(action => !['activate', 'arrowDown'].includes(action))) {
      throw new TypeError('Site rule filling.openActions supports only activate and arrowDown.');
    }
    setAt(resolved, ['filling', 'openActions'], Array.from(new Set(openActions)));
    resolved.options.optionIdPrefix = String(
      valueAt(rules, ['options', 'optionIdPrefix']) ||
      valueAt(base, ['options', 'optionIdPrefix']) || '');

    const hooks = rules.hooks || {};
    Object.keys(hooks).forEach(name => {
      if (!HOOK_NAMES.includes(name) || typeof hooks[name] !== 'function') {
        throw new TypeError('Unsupported site-rule hook: ' + name);
      }
      resolved.hooks[name] = hooks[name];
    });

    global.__jobAutofillSiteRules = deepFreeze(resolved);
    return global.__jobAutofillSiteRules;
  }

  global.__jobAutofillSiteRuleRuntime = Object.freeze({ defineSiteRules });
})(window);
