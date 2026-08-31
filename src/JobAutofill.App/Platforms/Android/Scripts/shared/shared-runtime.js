(function () {
  // Shared primitives used by the scanner and fill.js. This file must be
  // injected before either of those scripts runs — they read window.__domShared
  // at load time and throw if it isn't there yet.


  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }

    return String(value).replace(/["\\]/g, '\\$&');
  }

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
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

  function dispatchKeyboardEvent(element, key) {
    element.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key,
      code: key
    }));
  }

  function dispatchPointerEvent(element, type) {
    if (typeof PointerEvent === 'function') {
      element.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerType: 'mouse',
        isPrimary: true,
        view: window
      }));
      return;
    }

    dispatchMouseEvent(element, type.replace('pointer', 'mouse'));
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

  // Closes any open popup/listbox/menu state around `target`. This walks the
  // target, the currently focused element, and every element on the page that
  // currently looks "open" (role=listbox/menu/grid, aria-expanded=true, or
  // aria-haspopup listbox/grid), dispatches Escape at each, resets
  // aria-expanded where present, and blurs it. This is the thorough version —
  // it used to live only in fill.js as closeOpenPopupState(); scanner code had
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

  // Filler API: resolve a scoped selector across shadow roots and iframes
  function resolveScopedSelector(selector) {
    const selectorResolver = window.__selectorResolver || {};
    if (typeof selectorResolver.resolveScopedSelector === 'function') {
      return selectorResolver.resolveScopedSelector(selector);
    }

    // Fallback if __selectorResolver not yet loaded
    if (!selector) return null;
    const parts = String(selector).split(' >>> ').filter(Boolean);
    let root = document;
    let element = null;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith('@frame(') && part.endsWith(')')) {
        const frameSelector = part.slice(7, -1);
        const frame = resolveScopedSelector(frameSelector);
        try {
          root = frame && frame.contentDocument ? frame.contentDocument : null;
          element = frame;
        } catch (e) { return null; }
        if (!root) return null;
        continue;
      }
      try {
        element = root.querySelector(part);
      } catch (e) { return null; }
      if (!element) return null;
      if (i < parts.length - 1) {
        root = shadowRootFor(element);
        if (!root) return null;
      }
    }
    return element;
  }

  // Filler API: query all matching elements within an element's root
  function queryAllInElementRoot(element, selector) {
    const root = element && element.getRootNode ? element.getRootNode() : document;
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch (error) {
      return [];
    }
  }

  // Filler API: collect all elements matching selector across shadow roots and iframes
  function collectElementsAcrossRoots(root, selector, seenRoots) {
    const domTraversal = window.__genericDomTraversal || {};
    if (typeof domTraversal.collectElementsAcrossRoots === 'function') {
      return domTraversal.collectElementsAcrossRoots(root, selector, seenRoots);
    }

    // Fallback if __genericDomTraversal not yet loaded
    const seen = seenRoots || new Set();
    if (!root || seen.has(root)) return [];
    seen.add(root);

    let elements = [];
    try {
      elements = Array.from(root.querySelectorAll(selector));
    } catch (error) {
      elements = [];
    }

    const hosts = [];
    try {
      hosts.push.apply(hosts, Array.from(root.querySelectorAll('*')));
    } catch (error) {
      // Ignore roots that cannot be enumerated.
    }

    hosts.forEach(element => {
      const sr = shadowRootFor(element);
      if (sr) {
        elements.push.apply(elements, collectElementsAcrossRoots(sr, selector, seen));
      }
    });

    return elements;
  }

  // Filler API: emit input events after value change
  function emitInputEvents(element) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
    if (typeof element.blur === 'function') {
      element.blur();
    }
  }

  // Filler API: dispatch Escape key to element
  function dispatchEscape(element) {
    if (!element || typeof element.dispatchEvent !== 'function') {
      return;
    }

    ['keydown', 'keyup'].forEach(type => {
      element.dispatchEvent(new KeyboardEvent(type, {
        bubbles: true,
        cancelable: true,
        key: 'Escape'
      }));
    });
  }

  // Filler API: blur an element
  function blurElement(element) {
    if (element && typeof element.blur === 'function') {
      element.blur();
    }
  }

  // Filler API: close open popups around a target
  function closeOpenPopupState(target) {
    // This is the same as closePopup; refactored fill.js uses this name
    closePopup(target);
  }

  // Filler API: clear active focus and close popups
  async function clearActiveFocus(element, selectedOption) {
    await wait(120);
    closeOpenPopupState(selectedOption || element);
    dispatchEscape(selectedOption);
    blurElement(selectedOption);
    dispatchEscape(element);
    blurElement(element);
    dispatchEscape(document.activeElement);
    blurElement(document.activeElement);
    dispatchEscape(document);

    await wait(80);

    const focusSink = document.createElement('button');
    focusSink.type = 'button';
    focusSink.tabIndex = -1;
    focusSink.setAttribute('aria-hidden', 'true');
    focusSink.style.position = 'fixed';
    focusSink.style.left = '-9999px';
    focusSink.style.top = '0';
    document.body.appendChild(focusSink);
    focusSink.focus();
    closeOpenPopupState(focusSink);
    dispatchEscape(focusSink);
    focusSink.blur();
    focusSink.remove();
  }

  // Filler API: activate an element (mousedown + mouseup + click)
  function activateElement(element) {
    dispatchMouseEvent(element, 'mousedown');
    dispatchMouseEvent(element, 'mouseup');
    element.click();
  }

  // Filler API: set checked state on a checkbox/radio using property descriptor
  function setCheckedState(element, checked) {
    const checkedSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
    if (checkedSetter) {
      checkedSetter.call(element, checked);
    } else {
      element.checked = checked;
    }
  }

  // Filler API: set native value using property descriptor
  function setNativeValue(element, value) {
    const prototype = element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;

    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
      return;
    }

    if (valueSetter) {
      valueSetter.call(element, value);
      return;
    }

    element.value = value;
  }

  // Filler API: set contenteditable element text
  function setContentEditableText(element, value) {
    element.focus();

    try {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('delete', false);
      document.execCommand('insertText', false, String(value));
    } catch (error) {
      element.textContent = String(value);
    }

    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: String(value)
    }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  window.__domShared = {
    cssEscape,
    wait,
    dispatchKeyboardEvent,
    dispatchPointerEvent,
    dispatchMouseEvent,
    normalize,
    isVisible,
    closePopup,
    closeOpenPopupState,
    installShadowRootCapture,
    shadowRootFor,
    shadowCaptureDiagnostics,
    resolveScopedSelector,
    queryAllInElementRoot,
    collectElementsAcrossRoots,
    emitInputEvents,
    dispatchEscape,
    blurElement,
    clearActiveFocus,
    activateElement,
    setCheckedState,
    setNativeValue,
    setContentEditableText
  };

  installShadowRootCapture();
})();
