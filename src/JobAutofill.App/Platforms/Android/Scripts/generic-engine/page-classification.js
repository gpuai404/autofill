(function (global) {
  'use strict';

  function classifyPage() {
    const capability = window.__capabilityProbe && typeof window.__capabilityProbe.probeCapabilities === 'function'
      ? window.__capabilityProbe.probeCapabilities()
      : null;
    const capabilityEvidence = capability && capability.evidence ? capability.evidence : {};
    const capabilityReason = capability && capability.reason ? String(capability.reason) : '';
    const standardSelectors = [
      'input:not([type="hidden"]):not([type="file"]):not([id*="recaptcha"]):not([name*="recaptcha"]):not([id*="hcaptcha"]):not([name*="hcaptcha"])',
      'textarea:not([id*="recaptcha"]):not([name*="recaptcha"]):not([id*="hcaptcha"]):not([name*="hcaptcha"])',
      'select',
      '[role="combobox"]',
      '[aria-haspopup="listbox"]'
    ];

    const selectorCounts = {};
    let standardFieldCount = Number(capabilityEvidence.standardFieldCount || 0);
    for (let index = 0; index < standardSelectors.length; index++) {
      const selector = standardSelectors[index];
      const count = document.querySelectorAll(selector).length;
      selectorCounts[selector] = count;
      if (!capability) {
        standardFieldCount += count;
      }
    }

    const iframeCount = document.querySelectorAll('iframe').length;
    const formCount = document.querySelectorAll('form, [role="form"]').length;
    const closedShadowCandidates = Array.isArray(capabilityEvidence.closedShadowCandidates)
      ? capabilityEvidence.closedShadowCandidates
      : [];
    const visualControlRegions = Array.isArray(capabilityEvidence.visualControlRegions)
      ? capabilityEvidence.visualControlRegions
      : [];
    const authSignals = [
      /unauthorized/i,
      /not logged in/i,
      /sign in/i,
      /login/i,
      /please log in/i
    ];
    const pageText = (document.body ? document.body.innerText || '' : '').slice(0, 4000);
    const authErrorMatch = (window.__scanDebug && Array.isArray(window.__scanDebug.errors))
      ? window.__scanDebug.errors.some(error => authSignals.some(pattern => pattern.test(String(error.message || ''))))
      : authSignals.some(pattern => pattern.test(pageText));

    if (authErrorMatch) {
      return {
        classification: 'auth-gated',
        reason: 'The page is reporting an auth or login gate before form fields are available.',
        evidence: {
          standardFieldCount,
          iframeCount,
          formCount,
          authErrorMatch,
          capability,
          pageTextPreview: pageText.slice(0, 200)
        }
      };
    }

    if (standardFieldCount > 0) {
      return {
        classification: 'standard-form',
        reason: 'Detected standard form fields that can be scanned normally.',
        evidence: {
          standardFieldCount,
          selectorCounts,
          iframeCount,
          formCount,
          capability
        }
      };
    }

    if (closedShadowCandidates.length > 0 || capabilityReason.includes('closed-shadow-root-suspected')) {
      return {
        classification: 'closed-shadow-dom',
        reason: 'Detected custom elements that may own closed shadow DOM without accessible editable descendants.',
        evidence: {
          standardFieldCount,
          selectorCounts,
          iframeCount,
          formCount,
          closedShadowCandidates,
          capability
        }
      };
    }

    if (visualControlRegions.length > 0 || capabilityReason.includes('custom-visual-control')) {
      return {
        classification: 'custom-visual-control',
        reason: 'Detected visual controls or custom containers without accessible editable descendants.',
        evidence: {
          standardFieldCount,
          selectorCounts,
          iframeCount,
          formCount,
          visualControlRegions,
          capability
        }
      };
    }

    if (iframeCount > 0) {
      return {
        classification: 'iframe-based',
        reason: 'The page appears to rely on iframes or embedded application content.',
        evidence: {
          standardFieldCount,
          iframeCount,
          formCount,
          selectorCounts,
          capability
        }
      };
    }

    if (formCount > 0 || document.querySelectorAll('[data-testid], [data-test-id]').length > 0) {
      return {
        classification: 'custom-app-shell',
        reason: 'The page appears to be a custom app shell or non-standard form implementation.',
        evidence: {
          standardFieldCount,
          iframeCount,
          formCount,
          selectorCounts,
          capability
        }
      };
    }

    return {
      classification: 'unsupported',
      reason: 'No standard form fields, auth markers, or supported shell indicators were found in the current page.',
      evidence: {
        standardFieldCount,
        iframeCount,
        formCount,
        selectorCounts,
        capability
      }
    };
  }

  global.__pageClassification = { classifyPage };
})(window);
