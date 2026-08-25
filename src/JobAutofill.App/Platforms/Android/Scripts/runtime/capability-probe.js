(function () {
  const EDITABLE_FIELD_SELECTOR = [
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])',
    'textarea',
    'select',
    '[contenteditable="true"]',
    '[contenteditable=""]',
    '[role="textbox"]',
    '[role="searchbox"]',
    '[role="combobox"]',
    '[aria-haspopup]'
  ].join(', ');

  const VISUAL_CONTROL_SELECTOR = [
    'canvas',
    '[role="application"]',
    '[role="grid"]',
    '[role="listbox"]',
    '[data-testid*="select"]',
    '[data-test-id*="select"]',
    '[class*="select"]',
    '[class*="dropdown"]',
    '[class*="picker"]',
    '[class*="editor"]'
  ].join(', ');

  const domShared = window.__domShared || {};
  const shadowRootFor = typeof domShared.shadowRootFor === 'function'
    ? domShared.shadowRootFor
    : element => element && element.shadowRoot ? element.shadowRoot : null;

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function safeOrigin(value) {
    try {
      return new URL(value, window.location.href).origin;
    } catch (error) {
      return '';
    }
  }

  function isVisible(element) {
    try {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0;
    } catch (error) {
      return false;
    }
  }

  function standardFieldSelectors() {
    const rules = window.__fieldControlRules || {};
    const selectors = Array.isArray(rules.fieldSelectors)
      ? rules.fieldSelectors
      : [
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([id*="recaptcha"]):not([name*="recaptcha"]):not([id*="hcaptcha"]):not([name*="hcaptcha"])',
        'textarea:not([id*="recaptcha"]):not([name*="recaptcha"]):not([id*="hcaptcha"]):not([name*="hcaptcha"])',
        'select',
        '[role="combobox"]',
        '[role="textbox"]',
        '[role="searchbox"]',
        '[aria-haspopup]'
      ];

    return selectors.map(selector => selector.startsWith('input:') || selector === 'input'
      ? selector.replace('input', 'input:not([type="file"])')
      : selector);
  }

  function selectorCounts(selectors) {
    const counts = {};
    let total = 0;
    selectors.forEach(selector => {
      try {
        const count = document.querySelectorAll(selector).length;
        counts[selector] = count;
        total += count;
      } catch (error) {
        counts[selector] = 0;
      }
    });

    return { counts, total };
  }

  function queryAll(root, selector) {
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch (error) {
      return [];
    }
  }

  function hasAccessibleEditableDescendant(element) {
    return queryAll(element, EDITABLE_FIELD_SELECTOR).some(isVisible);
  }

  function visualControlDescendants(element) {
    return queryAll(element, VISUAL_CONTROL_SELECTOR).filter(isVisible);
  }

  function visualControlEvidence(element, type) {
    const rect = element.getBoundingClientRect();
    return {
      type,
      tagName: element.tagName ? element.tagName.toLowerCase() : '',
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  function scanDebugErrors() {
    const debug = window.__scanDebug || {};
    return Array.isArray(debug.errors) ? debug.errors : [];
  }

  function detectAuthGate(pageText) {
    const signals = [
      /unauthorized/i,
      /not logged in/i,
      /not signed in/i,
      /sign in required/i,
      /please sign in/i,
      /please log in/i,
      /login required/i,
      /session expired/i
    ];
    const errors = scanDebugErrors()
      .map(error => String(error && error.message ? error.message : error || ''))
      .join('\n');
    const haystack = errors + '\n' + pageText;
    return signals.some(pattern => pattern.test(haystack));
  }

  function detectCaptcha(pageText) {
    const captchaSelectors = [
      '[id*="recaptcha"]',
      '[name*="recaptcha"]',
      '[class*="recaptcha"]',
      '[id*="hcaptcha"]',
      '[name*="hcaptcha"]',
      '[class*="hcaptcha"]',
      '.cf-turnstile',
      '[data-sitekey]',
      'iframe[src*="recaptcha"]',
      'iframe[src*="hcaptcha"]',
      'iframe[src*="challenges.cloudflare"]'
    ];

    const matchedSelectors = [];
    captchaSelectors.forEach(selector => {
      try {
        if (document.querySelector(selector)) {
          matchedSelectors.push(selector);
        }
      } catch (error) {
        // Ignore selector support differences across webviews.
      }
    });

    const textMatched = /captcha|recaptcha|hcaptcha|verify you are human|security check|challenge/i.test(pageText);
    return {
      present: matchedSelectors.length > 0 || textMatched,
      matchedSelectors,
      textMatched
    };
  }

  function detectCrossOriginFrames() {
    return Array.from(document.querySelectorAll('iframe')).map(iframe => {
      const rect = iframe.getBoundingClientRect();
      let accessible = false;
      try {
        accessible = Boolean(iframe.contentDocument && iframe.contentDocument.documentElement);
      } catch (error) {
        accessible = false;
      }

      return {
        origin: safeOrigin(iframe.src),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        visible: isVisible(iframe),
        accessible
      };
    }).filter(frame => frame.visible && frame.width >= 260 && frame.height >= 180);
  }

  function detectClosedShadowCandidates() {
    return Array.from(document.querySelectorAll('*'))
      .filter(element => {
        const tag = element.tagName ? element.tagName.toLowerCase() : '';
        if (!tag.includes('-') || shadowRootFor(element)) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        if (!isVisible(element) || rect.width < 180 || rect.height < 80) {
          return false;
        }

        return !hasAccessibleEditableDescendant(element);
      })
      .slice(0, 12)
      .map(element => ({
        tagName: element.tagName.toLowerCase(),
        reason: 'custom-element-without-open-editable-descendants'
      }));
  }

  function detectOpaqueVisualControls() {
    return Array.from(document.querySelectorAll('canvas, [role="application"], [class*="editor"], [class*="picker"]'))
      .filter(element => {
        const rect = element.getBoundingClientRect();
        if (!isVisible(element) || rect.width < 180 || rect.height < 80) {
          return false;
        }

        const container = element.closest('form, main, section, article, div') || element.parentElement;
        return !(container && hasAccessibleEditableDescendant(container));
      })
      .slice(0, 12)
      .map(element => visualControlEvidence(element, 'visual-control-without-accessible-editable-descendants'));
  }

  function detectCustomVisualContainers() {
    return Array.from(document.querySelectorAll('form, [role="form"], [data-testid], [data-test-id], main, section'))
      .filter(container => {
        const rect = container.getBoundingClientRect();
        if (!isVisible(container) || rect.width < 180 || rect.height < 80 || hasAccessibleEditableDescendant(container)) {
          return false;
        }

        return visualControlDescendants(container).length > 0;
      })
      .slice(0, 12)
      .map(element => visualControlEvidence(element, 'custom-container-without-accessible-editable-descendants'));
  }

  function result(status, reason, message, evidence) {
    return {
      scannable: status !== 'hard-stop',
      status,
      reason,
      message,
      evidence: evidence || {}
    };
  }

  function probeCapabilities() {
    const selectors = standardFieldSelectors();
    const fieldStats = selectorCounts(selectors);
    const pageText = normalize(document.body ? document.body.innerText || '' : '').slice(0, 4000);
    const forms = document.querySelectorAll('form, [role="form"]').length;
    const authGate = detectAuthGate(pageText);
    const captcha = detectCaptcha(pageText);
    const frames = detectCrossOriginFrames();
    const inaccessibleFrames = frames.filter(frame => !frame.accessible);
    const shadowCandidates = detectClosedShadowCandidates();
    const opaqueVisualControls = detectOpaqueVisualControls();
    const customVisualContainers = detectCustomVisualContainers();
    const visualControlRegions = opaqueVisualControls.concat(customVisualContainers).slice(0, 12);
    const baseEvidence = {
      pageUrl: window.location.href,
      pageTitle: document.title || '',
      readyState: document.readyState,
      standardFieldCount: fieldStats.total,
      selectorCounts: fieldStats.counts,
      formCount: forms,
      captcha,
      frameCount: frames.length,
      inaccessibleFrames,
      closedShadowCandidates: shadowCandidates,
      visualControlRegions
    };

    if (authGate || captcha.present || inaccessibleFrames.length > 0 || shadowCandidates.length > 0 || visualControlRegions.length > 0) {
      const reasons = [];
      if (authGate) reasons.push('auth-gated');
      if (captcha.present) reasons.push('captcha-present');
      if (inaccessibleFrames.length > 0) reasons.push('cross-origin-frame');
      if (shadowCandidates.length > 0) reasons.push('closed-shadow-root-suspected');
      if (visualControlRegions.length > 0) reasons.push('custom-visual-control');

      return result('partial-scan', reasons.join('+'), 'The page may contain protected regions, but scanning will continue with every accessible in-app field.', baseEvidence);
    }

    if (fieldStats.total > 0) {
      return result('scannable', null, 'Standard DOM-backed fields are available.', baseEvidence);
    }

    return result('partial-scan', 'no-standard-fields', 'No standard DOM-backed field candidates were found yet; scanning still completed against supported selectors.', baseEvidence);
  }

  window.__capabilityProbe = {
    probeCapabilities
  };
})();
