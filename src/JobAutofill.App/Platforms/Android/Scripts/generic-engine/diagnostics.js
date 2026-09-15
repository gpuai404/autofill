(function (global) {
  'use strict';
  const MAX_ERRORS = 100;
  let installed = false;
  let originalConsoleError = null;

  function initialize(config) {
    global.__scanDebug = Object.assign({
      pageUrl: global.location && global.location.href ? global.location.href : '',
      pageTitle: global.document && global.document.title ? global.document.title : '',
      readyState: global.document ? global.document.readyState : '',
      selectorCounts: {}, fieldCount: 0, detectedSelectors: [], errors: [], lastError: null
    }, global.__scanDebug || {});

    if (!config || !config.enableDiagnostics) {
      dispose();
      return;
    }

    if (installed) {
      return;
    }

    installed = true;
    global.addEventListener('error', onError);
    global.addEventListener('unhandledrejection', onUnhandledRejection);
    originalConsoleError = global.console.error;
    global.console.error = onConsoleError;
  }

  function recordError(error, source, line) {
    initialize();
    const message = error && error.stack ? String(error.stack) : String(error || 'Unknown error');
    const entry = { message, source: source || 'unknown', line: line || 'n/a' };
    global.__scanDebug.errors.push(entry);
    if (global.__scanDebug.errors.length > MAX_ERRORS) global.__scanDebug.errors.shift();
    global.__scanDebug.lastError = entry;
    return entry;
  }

  function onError(event) {
    recordError(event && (event.error || event.message), event && event.filename, event && event.lineno);
  }

  function onUnhandledRejection(event) {
    recordError(event && event.reason, 'unhandledrejection', 'n/a');
  }

  function onConsoleError() {
    recordError(Array.from(arguments).map(String).join(' '), 'console.error', 'n/a');
    return originalConsoleError.apply(global.console, arguments);
  }

  function dispose() {
    if (!installed) return;
    global.removeEventListener('error', onError);
    global.removeEventListener('unhandledrejection', onUnhandledRejection);
    if (originalConsoleError) global.console.error = originalConsoleError;
    originalConsoleError = null;
    installed = false;
  }

  global.__scanDiagnostics = { initialize, recordError, dispose };
})(window);
