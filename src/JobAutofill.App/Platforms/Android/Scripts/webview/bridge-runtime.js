(function () {
  function encodeJson(value) {
    return encodeURIComponent(JSON.stringify(value));
  }

  function setAsyncState(name, initialValue) {
    window[name + 'Result'] = initialValue;
    window[name + 'Error'] = '';
    window[name + 'Done'] = false;
    return true;
  }

  function completeAsyncState(name, resultValue, errorValue) {
    window[name + 'Result'] = typeof resultValue === 'undefined' ? '' : resultValue;
    window[name + 'Error'] = errorValue || '';
    window[name + 'Done'] = true;
    return true;
  }

  async function runAsyncState(name, defaultValue, action, missingValue, errorValueFactory) {
    setAsyncState(name, defaultValue);

    try {
      if (typeof action !== 'function') {
        completeAsyncState(name, missingValue || defaultValue, '');
        return true;
      }

      const result = await Promise.resolve(action());
      completeAsyncState(name, encodeJson(result), '');
      return true;
    } catch (error) {
      const message = error && error.stack ? error.stack : String(error);
      const errorValue = typeof errorValueFactory === 'function'
        ? errorValueFactory(message)
        : defaultValue;
      completeAsyncState(name, errorValue, message);
      return true;
    }
  }

  window.__jobAutofill = {
    scanFields: async function () {
      const emptyFields = encodeJson([]);
      return runAsyncState(
        '__scanFields',
        emptyFields,
        window.__scanFields ? function () {
          return Promise.resolve(window.__scanFields()).then(function (fields) {
            return Array.isArray(fields) ? fields : [];
          });
        } : null,
        emptyFields,
        function () { return emptyFields; });
    },

    extractOptionsForField: async function (selector) {
      const emptyResult = encodeJson({ ok: false, message: 'empty option extraction result', options: [] });
      const missingResult = encodeJson({ ok: false, message: 'option extractor missing', options: [] });
      return runAsyncState(
        '__extractOptionsForField',
        emptyResult,
        window.__extractOptionsForField ? function () {
          return window.__extractOptionsForField(selector) || { ok: false, message: 'empty option extraction result', options: [] };
        } : null,
        missingResult,
        function (message) {
          return encodeJson({ ok: false, message: message, options: [] });
        });
    },

    closeOpenOptionPopups: async function () {
      const closedResult = encodeJson(true);
      return runAsyncState(
        '__closeOpenOptionPopups',
        closedResult,
        window.__closeOpenOptionPopups || null,
        closedResult,
        function () { return closedResult; });
    },

    getPageClassification: function () {
      return JSON.stringify(window.__classifyPage ? window.__classifyPage() : { classification: 'unsupported', reason: 'No classifier available.', evidence: {} });
    },

    focusField: function (selector) {
      const element = document.querySelector(selector);
      if (!element) {
        return false;
      }

      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      if (typeof element.focus === 'function') {
        element.focus();
      }

      const previousOutline = element.style.outline;
      const previousBoxShadow = element.style.boxShadow;
      element.style.outline = '3px solid #229ED9';
      element.style.boxShadow = '0 0 0 4px rgba(34, 158, 217, 0.24)';
      window.setTimeout(function () {
        element.style.outline = previousOutline;
        element.style.boxShadow = previousBoxShadow;
      }, 1600);

      return true;
    },

    fillFieldOption: async function (selector, option, fillStrategy) {
      const emptyResult = encodeJson({ ok: false, message: 'empty fill result' });
      const missingResult = encodeJson({ ok: false, message: 'fill option script missing' });
      return runAsyncState(
        '__fillFieldOption',
        emptyResult,
        window.__fillFieldOption ? function () {
          return window.__fillFieldOption(selector, option, fillStrategy) || { ok: false, message: 'empty fill result' };
        } : null,
        missingResult,
        function (message) {
          return encodeJson({ ok: false, message: message });
        });
    },

    fillField: async function (selector, value, fillStrategy) {
      const emptyResult = encodeJson({ ok: false, message: 'empty fill result' });
      const missingResult = encodeJson({ ok: false, message: 'fill script missing' });
      return runAsyncState(
        '__fillField',
        emptyResult,
        window.__fillField ? function () {
          return window.__fillField(selector, value, fillStrategy) || { ok: false, message: 'empty fill result' };
        } : null,
        missingResult,
        function (message) {
          return encodeJson({ ok: false, message: message });
        });
    },

    resetFillState: function () {
      if (window.__clearActiveFillState && typeof window.__clearActiveFillState === 'function') {
        try {
          return window.__clearActiveFillState();
        } catch (error) {
        }
      }

      try {
        const active = document.activeElement;
        if (active && typeof active.blur === 'function') {
          active.blur();
        }

        const body = document.body || document.documentElement;
        if (body && typeof body.focus === 'function') {
          body.focus();
        }

        return true;
      } catch (error) {
        return false;
      }
    },

    clearFieldHighlight: function (selector) {
      const element = document.querySelector(selector);
      if (element) {
        element.style.outline = '';
        element.style.boxShadow = '';
        if (typeof element.blur === 'function') {
          element.blur();
        }
      }

      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }

      return true;
    },

    getScanCapability: function () {
      return encodeJson(window.__scanCapability || {});
    },

    getScanDebugJson: function () {
      return encodeJson(window.__scanDebug || {});
    }
  };
})();
