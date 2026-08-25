(function () {
  // Shared primitives used by both detector.js and fill.js. This file must be
  // injected before either of those scripts runs — they read window.__domShared
  // at load time and throw if it isn't there yet.


  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }

    return String(value).replace(/["\\]/g, '\\$&');
  }

  function wait(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
  }

  function dispatchMouseEvent(element, type) {
    element.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  }

  const capturedShadowRoots = window.__jobAutofillShadowRoots || {
    byHost: new WeakMap(),
    installed: false,
    installedAtReadyState: '',
    createdCount: 0,
    closedCount: 0,
    openCount: 0,
    lastMode: ''
  };
  window.__jobAutofillShadowRoots = capturedShadowRoots;

  function installShadowRootCapture() {
    if (capturedShadowRoots.installed || !window.Element || !Element.prototype.attachShadow) {
      return;
    }

    const originalAttachShadow = Element.prototype.attachShadow;
    capturedShadowRoots.installed = true;
    capturedShadowRoots.installedAtReadyState = document.readyState || '';
    capturedShadowRoots.originalAttachShadow = originalAttachShadow;

    Element.prototype.attachShadow = function (init) {
      const root = originalAttachShadow.call(this, init);
      try {
        capturedShadowRoots.byHost.set(this, root);
        capturedShadowRoots.createdCount += 1;
        capturedShadowRoots.lastMode = init && init.mode ? String(init.mode) : '';
        if (capturedShadowRoots.lastMode === 'closed') {
          capturedShadowRoots.closedCount += 1;
        } else {
          capturedShadowRoots.openCount += 1;
        }
      } catch (error) {
        // If a host cannot be recorded, leave the page's shadow behavior alone.
      }

      return root;
    };
  }

  function shadowRootFor(element) {
    if (!element) {
      return null;
    }

    return element.shadowRoot || capturedShadowRoots.byHost.get(element) || null;
  }

  function shadowCaptureDiagnostics() {
    return {
      installed: Boolean(capturedShadowRoots.installed),
      installedAtReadyState: capturedShadowRoots.installedAtReadyState || '',
      createdCount: capturedShadowRoots.createdCount || 0,
      closedCount: capturedShadowRoots.closedCount || 0,
      openCount: capturedShadowRoots.openCount || 0,
      lastMode: capturedShadowRoots.lastMode || ''
    };
  }

  // Single definition of "same text" for the whole pipeline: collapse internal
  // whitespace, trim, lowercase. This mirrors NormalizeOptionText on the C#
  // side, so a value that matches during planning also matches when fill.js
  // goes to click it in the live DOM.
  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  // Closes any open popup/listbox/menu state around `target`. This walks the
  // target, the currently focused element, and every element on the page that
  // currently looks "open" (role=listbox/menu/grid, aria-expanded=true, or
  // aria-haspopup listbox/grid), dispatches Escape at each, resets
  // aria-expanded where present, and blurs it. This is the thorough version —
  // it used to live only in fill.js as closeOpenPopupState(); detector.js had
  // its own weaker single-element Escape+blur that could leave a previous
  // combobox's popup open while probing the next one during a scan.
  function closePopup(target) {
    const candidates = [];
    if (target && typeof target.dispatchEvent === 'function') {
      candidates.push(target);
    }

    const active = document.activeElement;
    if (active && active !== document.body && typeof active.dispatchEvent === 'function' && !candidates.includes(active)) {
      candidates.push(active);
    }

    document.querySelectorAll('[role="listbox"], [role="menu"], [role="grid"], [aria-expanded="true"], [aria-haspopup="listbox"], [aria-haspopup="grid"]').forEach(node => {
      if (node && typeof node.dispatchEvent === 'function' && !candidates.includes(node)) {
        candidates.push(node);
      }
    });

    candidates.forEach(candidate => {
      if (!candidate || typeof candidate.dispatchEvent !== 'function') {
        return;
      }

      try {
        candidate.dispatchEvent(new KeyboardEvent('keydown', {
          bubbles: true,
          cancelable: true,
          key: 'Escape'
        }));
      } catch (error) {
        // Ignore popup close errors and continue to blur the element.
      }

      try {
        if (candidate.getAttribute && candidate.getAttribute('aria-expanded') !== null) {
          candidate.setAttribute('aria-expanded', 'false');
        }
      } catch (error) {
        // Ignore attribute update errors.
      }

      if (typeof candidate.blur === 'function') {
        candidate.blur();
      }
    });

    const body = document.body || document.documentElement;
    if (body && typeof body.focus === 'function') {
      body.focus();
    }
  }

  window.__domShared = {
    cssEscape,
    wait,
    dispatchMouseEvent,
    normalize,
    closePopup,
    installShadowRootCapture,
    shadowRootFor,
    shadowCaptureDiagnostics
  };

  installShadowRootCapture();
})();
