(function (global) {
  'use strict';
  const SELECTOR_PATHS = [
    ['roots', 'application'], ['exclude', 'controls'], ['exclude', 'containers'],
    ['discovery', 'fieldSelectors'], ['options', 'localRootSelectors'], ['options', 'popupSelectors'],
    ['options', 'optionSelectors'], ['filling', 'controlRootSelectors'],
    ['filling', 'fieldRootSelectors'], ['filling', 'popupOptionSelectors']
  ];
  const ALLOWED_TOP_LEVEL = new Set(['schemaVersion', 'siteId', 'profileVersion', 'hosts', 'roots', 'exclude', 'discovery', 'options', 'filling']);
  const ALLOWED_SECTION_KEYS = Object.freeze({
    roots: new Set(['application']), exclude: new Set(['controls', 'containers']),
    discovery: new Set(['fieldSelectors']),
    options: new Set(['localRootSelectors', 'popupSelectors', 'optionSelectors', 'optionIdPrefix']),
    filling: new Set(['controlRootSelectors', 'fieldRootSelectors', 'popupOptionSelectors', 'openActions'])
  });

  function valueAt(source, path) { return path.reduce((value, key) => value && value[key], source); }
  function setAt(target, path, value) {
    let current = target;
    path.slice(0, -1).forEach(key => { current = current[key] || (current[key] = {}); });
    current[path[path.length - 1]] = value;
  }
  function rejectUnknownKeys(source, allowed, path) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new TypeError(path + ' must be an object.');
    Object.keys(source).forEach(key => {
      if (!allowed.has(key)) throw new TypeError('Unsupported site profile property: ' + path + '.' + key);
    });
  }
  function selectorArray(value, path) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 64 || value.some(item => typeof item !== 'string' || !item.trim() || item.length > 512)) {
      throw new TypeError(path + ' must contain at most 64 valid selectors.');
    }
    value.forEach(selector => {
      try { global.document.querySelector(selector); }
      catch (_) { throw new TypeError('Invalid selector in ' + path + ': ' + selector); }
    });
    return value.slice();
  }
  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => deepFreeze(value[key]));
    return Object.freeze(value);
  }
  function hostMatches(host, configuredHost) {
    const expected = String(configuredHost || '').toLowerCase();
    return host === expected || host.endsWith('.' + expected);
  }
  function validateIdentity(profile) {
    if (profile.schemaVersion !== 1) throw new TypeError('Unsupported site profile schemaVersion.');
    if (typeof profile.siteId !== 'string' || !profile.siteId.trim()) throw new TypeError('Site profile requires siteId.');
    if (!Number.isInteger(profile.profileVersion) || profile.profileVersion < 1) throw new TypeError('Site profile requires a positive profileVersion.');
    if (!Array.isArray(profile.hosts) || profile.hosts.some(host => typeof host !== 'string' || !host.trim())) {
      throw new TypeError('Site profile hosts must be an array of host names.');
    }
    const configuredSiteId = String(global.__jobAutofillConfig?.siteId || 'unknown');
    if (configuredSiteId !== 'unknown' && configuredSiteId !== profile.siteId) throw new TypeError('Site profile does not match the resolved site.');
    const currentHost = String(global.location?.hostname || '').toLowerCase();
    if (profile.hosts.length > 0 && !profile.hosts.some(host => hostMatches(currentHost, host))) {
      throw new TypeError('Site profile is not authorized for host: ' + currentHost);
    }
  }
  function loadSiteProfile(definition) {
    const profile = definition || {};
    rejectUnknownKeys(profile, ALLOWED_TOP_LEVEL, 'profile');
    validateIdentity(profile);
    Object.keys(ALLOWED_SECTION_KEYS).forEach(section => rejectUnknownKeys(profile[section] || {}, ALLOWED_SECTION_KEYS[section], section));
    const base = global.__jobAutofillBaseRules || {};
    const resolved = { schemaVersion: profile.schemaVersion, id: profile.siteId, version: profile.profileVersion };
    SELECTOR_PATHS.forEach(path => {
      const pathName = path.join('.');
      const values = selectorArray(valueAt(base, path), pathName).concat(selectorArray(valueAt(profile, path), pathName));
      setAt(resolved, path, Array.from(new Set(values)));
    });
    const openActions = valueAt(profile, ['filling', 'openActions']) || [];
    if (!Array.isArray(openActions) || openActions.some(action => !['activate', 'arrowDown'].includes(action))) {
      throw new TypeError('filling.openActions supports only activate and arrowDown.');
    }
    setAt(resolved, ['filling', 'openActions'], Array.from(new Set(openActions)));
    resolved.options.optionIdPrefix = String(valueAt(profile, ['options', 'optionIdPrefix']) || valueAt(base, ['options', 'optionIdPrefix']) || '');
    global.__jobAutofillSiteRules = deepFreeze(resolved);
    return global.__jobAutofillSiteRules;
  }
  global.__jobAutofillSiteRuleRuntime = Object.freeze({ loadSiteProfile });
  loadSiteProfile(global.__jobAutofillSiteProfile);
})(window);
