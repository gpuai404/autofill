(function (global) {
  'use strict';

  const privacySelectors = [
    '[id*="onetrust" i]', '[class*="onetrust" i]', '[class*="ot-sdk" i]',
    '[id*="cookiebot" i]', '[class*="cookie-consent" i]', '[class*="cookie-banner" i]',
    '[class*="consent-manager" i]', '[class*="privacy-preference" i]', '[class*="preference-center" i]',
    '[class*="cmp-container" i]', '[class*="vendor-search-handler" i]'
  ];

  global.__jobAutofillKnownWidgets = Object.freeze({
    privacy: Object.freeze({ excludedControlSelectors: Object.freeze(privacySelectors) }),
    reactSelect: Object.freeze({
      localRootSelectors: Object.freeze(['.select', '.select__control', '.react-select__control']),
      optionIdPrefix: 'react-select-'
    })
  });

  global.__jobAutofillBaseRules = Object.freeze({
    exclude: Object.freeze({
      controls: global.__jobAutofillKnownWidgets.privacy.excludedControlSelectors,
      containers: Object.freeze([])
    }),
    options: Object.freeze({
      localRootSelectors: global.__jobAutofillKnownWidgets.reactSelect.localRootSelectors,
      optionIdPrefix: global.__jobAutofillKnownWidgets.reactSelect.optionIdPrefix
    })
  });
})(window);
