(function (global) {
  'use strict';

  function initialize() {
    global.__scanDebug = Object.assign({
      pageUrl: global.location && global.location.href ? global.location.href : '',
      pageTitle: global.document && global.document.title ? global.document.title : '',
      readyState: global.document ? global.document.readyState : '',
      selectorCounts: {}, fieldCount: 0, detectedSelectors: [], errors: [], lastError: null
    }, global.__scanDebug || {});
  }

  function recordError(error, source, line) {
    initialize();
    const message = error && error.stack ? String(error.stack) : String(error || 'Unknown error');
    const entry = { message, source: source || 'unknown', line: line || 'n/a' };
    global.__scanDebug.errors.push(entry);
    global.__scanDebug.lastError = entry;
    return entry;
  }

  global.__scanDiagnostics = { initialize, recordError };
})(window);
