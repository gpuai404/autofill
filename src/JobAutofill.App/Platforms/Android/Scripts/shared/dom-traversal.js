(function (global) {
  'use strict';

  const domShared = global.__domShared || {};
  const shadowRootFor = typeof domShared.shadowRootFor === 'function'
    ? domShared.shadowRootFor
    : element => element && element.shadowRoot ? element.shadowRoot : null;

  function collectElementsAcrossRoots(root, selector, visited) {
    const seenRoots = visited || new Set();
    if (!root || seenRoots.has(root)) return [];
    seenRoots.add(root);
    let elements = [];
    try { elements = Array.from(root.querySelectorAll(selector)); } catch (_) { elements = []; }
    let allElements = [];
    try { allElements = Array.from(root.querySelectorAll('*')); } catch (_) { allElements = []; }
    allElements.forEach(element => {
      const shadowRoot = shadowRootFor(element);
      if (shadowRoot) elements.push.apply(elements, collectElementsAcrossRoots(shadowRoot, selector, seenRoots));
      if (element.tagName && element.tagName.toLowerCase() === 'iframe') {
        try {
          if (element.contentDocument && element.contentDocument.documentElement) {
            elements.push.apply(elements, collectElementsAcrossRoots(element.contentDocument, selector, seenRoots));
          }
        } catch (_) {}
      }
    });
    return elements;
  }

  function composedParentElement(element) {
    if (!element) return null;
    if (element.parentElement) return element.parentElement;
    const root = element.getRootNode ? element.getRootNode() : null;
    const NodeCtor = global.Node;
    const elementNodeType = NodeCtor && NodeCtor.ELEMENT_NODE ? NodeCtor.ELEMENT_NODE : 1;
    return root && root.host && root.host.nodeType === elementNodeType ? root.host : null;
  }

  function composedClosest(element, selector) {
    let current = element;
    const body = global.document && global.document.body;
    for (let depth = 0; current && current !== body && depth < 12; depth++) {
      const closest = current.closest ? current.closest(selector) : null;
      if (closest) return closest;
      current = composedParentElement(current);
    }
    return null;
  }

  global.__genericDomTraversal = { collectElementsAcrossRoots, composedParentElement, composedClosest };
})(window);
