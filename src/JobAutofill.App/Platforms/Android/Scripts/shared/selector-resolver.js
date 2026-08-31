(function (global) {
  'use strict';

  // Selector resolution and generation utilities for accessing DOM elements across
  // shadow roots and iframes. Shared by scanner and filler.

  const textUtils = global.__textUtils || {};
  const cssEscape = typeof textUtils.cssEscape === 'function'
    ? textUtils.cssEscape
    : value => {
      if (window.CSS && typeof window.CSS.escape === 'function') {
        return window.CSS.escape(value);
      }
      return String(value).replace(/["\\]/g, '\\$&');
    };

  const normalize = typeof textUtils.normalize === 'function'
    ? textUtils.normalize
    : value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

  const domShared = global.__domShared || {};
  const shadowRootFor = typeof domShared.shadowRootFor === 'function'
    ? domShared.shadowRootFor
    : element => element && element.shadowRoot ? element.shadowRoot : null;

  const genericDomTraversal = global.__genericDomTraversal || {};
  const collectElementsAcrossRoots = typeof genericDomTraversal.collectElementsAcrossRoots === 'function'
    ? genericDomTraversal.collectElementsAcrossRoots
    : function () { return []; };

  const isVisible = typeof domShared.isVisible === 'function' ? domShared.isVisible : function (element) {
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
  };

  function resolveScopedSelector(selector) {
    if (!selector) {
      return null;
    }

    const parts = String(selector).split(' >>> ').filter(Boolean);
    let root = document;
    let element = null;

    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      if (part.startsWith('@frame(') && part.endsWith(')')) {
        const frameSelector = part.slice(7, -1);
        const frame = resolveScopedSelector(frameSelector);
        try {
          root = frame && frame.contentDocument ? frame.contentDocument : null;
          element = frame;
        } catch (error) {
          return resolveScopedSelectorFallback(parts);
        }

        if (!root) {
          return resolveScopedSelectorFallback(parts);
        }
        continue;
      }

      try {
        element = root.querySelector(part);
      } catch (error) {
        return resolveScopedSelectorFallback(parts);
      }

      if (!element) {
        return resolveScopedSelectorFallback(parts);
      }

      if (index < parts.length - 1) {
        root = shadowRootFor(element);
        if (!root) {
          return resolveScopedSelectorFallback(parts);
        }
      }
    }

    return element || resolveScopedSelectorFallback(parts);
  }

  function resolveScopedSelectorFallback(parts) {
    const candidates = [];
    for (let index = parts.length - 1; index >= 0; index--) {
      const part = parts[index];
      if (!part || part.startsWith('@frame(')) {
        continue;
      }

      const found = collectElementsAcrossRoots(document, part)
        .filter(candidate => candidate && isVisible(candidate));
      if (found.length > 0) {
        candidates.push.apply(candidates, found);
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    return candidates.find(candidate =>
      normalize(candidate.getAttribute('role')) === 'combobox' ||
      normalize(candidate.getAttribute('aria-haspopup')) === 'listbox') || candidates[0];
  }

  function localSelectorFor(element) {
    if (element.id) {
      return '#' + cssEscape(element.id);
    }

    if (element.name) {
      const owner = element.ownerDocument || document;
      try {
        if (owner.querySelectorAll('[name="' + cssEscape(element.name) + '"]').length === 1) {
          return '[name="' + cssEscape(element.name) + '"]';
        }
      } catch (error) {
        // Fall through to a structural selector when uniqueness cannot be proven.
      }
    }

    const testId = element.getAttribute('data-testid');
    if (testId) {
      return '[data-testid="' + cssEscape(testId) + '"]';
    }

    return uniqueCssPath(element);
  }

  function uniqueCssPath(element) {
    const parts = [];
    let current = element;
    const owner = element.ownerDocument || document;
    const root = element.getRootNode ? element.getRootNode() : owner;
    const stopNode = root instanceof ShadowRoot ? root.host : owner.body;
    for (let depth = 0; current && current !== stopNode && depth < 5; depth++) {
      const tag = current.tagName ? current.tagName.toLowerCase() : '';
      if (!tag) {
        break;
      }

      let part = tag;
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(child => child.tagName === current.tagName);
        if (siblings.length > 1) {
          part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
        }
      }

      parts.unshift(part);
      const selector = parts.join(' > ');
      try {
        if (root.querySelectorAll(selector).length === 1) {
          return selector;
        }
      } catch (error) {
        // Fall through to the best path we can build.
      }

      current = parent;
    }

    return parts.length > 0 ? parts.join(' > ') : element.tagName.toLowerCase();
  }

  function scopedSelectorFor(element) {
    const localSelector = localSelectorFor(element);
    const owner = element.ownerDocument || document;
    const root = element.getRootNode ? element.getRootNode() : owner;

    if (root instanceof ShadowRoot) {
      return scopedSelectorFor(root.host) + ' >>> ' + localSelector;
    }

    if (owner !== document) {
      const frame = findFrameForDocument(owner);
      if (frame) {
        return '@frame(' + scopedSelectorFor(frame) + ') >>> ' + localSelector;
      }
    }

    return localSelector;
  }

  function findFrameForDocument(targetDocument) {
    const frames = collectElementsAcrossRoots(document, 'iframe');
    return frames.find(frame => {
      try {
        return frame.contentDocument === targetDocument;
      } catch (error) {
        return false;
      }
    }) || null;
  }

  function selectorFor(element) {
    return scopedSelectorFor(element);
  }

  global.__selectorResolver = {
    resolveScopedSelector,
    selectorFor
  };
})(window);
