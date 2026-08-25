(function () {
  const MAX_LABEL_LENGTH = 180;
  const MAX_CONTEXT_LABEL_LENGTH = 260;
  const MAX_OPTIONS_PER_FIELD = 300;
  const MAX_OPTION_RENDER_WAIT_MS = 900;
  const DEFAULT_OPTION_ACTION_WAIT_MS = 150;
  const MAX_ACTIVE_OPTION_FINAL_WAIT_MS = 2400;
  const domShared = window.__domShared || {};
  const shadowRootFor = typeof domShared.shadowRootFor === 'function'
    ? domShared.shadowRootFor
    : element => element && element.shadowRoot ? element.shadowRoot : null;

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }

    return String(value).replace(/["\\]/g, '\\$&');
  }

  function selectorFor(element) {
    return scopedSelectorFor(element);
  }

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
      return '[name="' + cssEscape(element.name) + '"]';
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

  function collectElementsAcrossRoots(root, selector, visited) {
    const seenRoots = visited || new Set();
    if (!root || seenRoots.has(root)) {
      return [];
    }
    seenRoots.add(root);

    let elements = [];
    try {
      elements = Array.from(root.querySelectorAll(selector));
    } catch (error) {
      elements = [];
    }

    let allElements = [];
    try {
      allElements = Array.from(root.querySelectorAll('*'));
    } catch (error) {
      allElements = [];
    }

    allElements.forEach(element => {
      const shadowRoot = shadowRootFor(element);
      if (shadowRoot) {
        elements.push.apply(elements, collectElementsAcrossRoots(shadowRoot, selector, seenRoots));
      }

      if (element.tagName && element.tagName.toLowerCase() === 'iframe') {
        try {
          if (element.contentDocument && element.contentDocument.documentElement) {
            elements.push.apply(elements, collectElementsAcrossRoots(element.contentDocument, selector, seenRoots));
          }
        } catch (error) {
          // Cross-origin frames are diagnostic only; scan every accessible root.
        }
      }
    });

    return elements;
  }

  function humanize(value) {
    return String(value || '')
      .replace(/^#+/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function compactText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function clippedLabel(value, maxLength) {
    const text = humanize(value);
    if (text.length <= maxLength) {
      return text;
    }

    return text.slice(0, maxLength).replace(/\s+\S*$/, '').trim();
  }

  function isGenericPlaceholderText(value) {
    const text = humanize(value).toLowerCase();
    if (!text) {
      return true;
    }

    const genericPatterns = [
      /^select(?:\.\.\.)?$/,
      /^choose(?:\.\.\.)?$/,
      /^pick(?: one)?$/,
      /^please select(?:\.\.\.)?$/,
      /^please choose(?:\.\.\.)?$/,
      /^make a selection$/,
      /^select one$/,
      /^choose one$/,
      /^select an option$/,
      /^choose an option$/,
      /^\.\.\.$/,
      /^--\s*(select|choose)\s*--$/
    ];

    return genericPatterns.some(pattern => pattern.test(text));
  }

  function isValidationMessageText(value) {
    const text = humanize(value).toLowerCase();
    if (!text) {
      return false;
    }

    const validationPatterns = [
      /^value is required\.?$/,
      /^this field is required\.?$/,
      /^field is required\.?$/,
      /^required field\.?$/,
      /^required\.?$/,
      /^please enter a value\.?$/,
      /^please select a value\.?$/,
      /^please make a selection\.?$/,
      /^invalid value\.?$/
    ];

    return validationPatterns.some(pattern => pattern.test(text));
  }

  function isMeaningfulLabelText(value) {
    const text = humanize(value);
    return Boolean(text) &&
      text.length <= MAX_CONTEXT_LABEL_LENGTH &&
      !isValidationMessageText(text) &&
      !isGenericPlaceholderText(text) &&
      !/^(?:select|choose|pick)\b/i.test(text);
  }

  function textFromLabelledBy(element) {
    const labelledBy = element.getAttribute('aria-labelledby');
    if (!labelledBy) {
      return '';
    }

    const root = element.getRootNode ? element.getRootNode() : element.ownerDocument || document;
    return labelledBy
      .split(/\s+/)
      .map(id => {
        const target = root.getElementById
          ? root.getElementById(id)
          : root.querySelector
            ? root.querySelector('#' + cssEscape(id))
            : null;
        return target?.textContent?.trim() || '';
      })
      .filter(Boolean)
      .join(' ');
  }

  function textFromDescribedBy(element) {
    const describedBy = element.getAttribute('aria-describedby');
    if (!describedBy) {
      return '';
    }

    const root = element.getRootNode ? element.getRootNode() : element.ownerDocument || document;
    return describedBy
      .split(/\s+/)
      .map(id => {
        const target = root.getElementById
          ? root.getElementById(id)
          : root.querySelector
            ? root.querySelector('#' + cssEscape(id))
            : null;
        return target?.textContent?.trim() || '';
      })
      .filter(Boolean)
      .join(' ');
  }

  function isGeneratedFieldKey(value) {
    const text = String(value || '').trim();
    if (!text) {
      return false;
    }

    return /\[[0-9a-f-]{8,}\]/i.test(text) ||
      /\[[^\]]*field\d+[^\]]*\]/i.test(text) ||
      /\[[^\]]+\]\[[^\]]+\]/.test(text) ||
      /^(cards|resume|answers?|attachments?|questions?)(\[[^\]]+\])+$/i.test(text);
  }

  function isLabelNoiseText(value) {
    const text = humanize(value).toLowerCase();
    if (!text || /^[*•·]+$/.test(text)) {
      return true;
    }

    const noisePatterns = [
      /^required$/,
      /^optional$/,
      /^mandatory$/,
      /^not required$/,
      /^(?:max(?:imum)?\s*)?\d+(?:\.\d+)?\s*(?:kb|mb|gb)\s*(?:file\s*)?(?:size\s*)?(?:limit|max(?:imum)?)$/,
      /^\d+(?:\.\d+)?\s*(?:kb|mb|gb)\s*(?:file\s*)?size\s*limit$/,
      /^(?:pdf|doc|docx|txt|rtf|png|jpg|jpeg)(?:,\s*(?:pdf|doc|docx|txt|rtf|png|jpg|jpeg))*$/,
      /^accepted file types?:?/,
      /^allowed file types?:?/,
      /^upload(?: a)? file$/,
      /^choose(?: a)? file$/,
      /^choose(?: a)? file or drop it here$/,
      /^or drop it here$/,
      /^drop it here$/,
      /^choose file$/,
      /^no file chosen$/,
      /^checkbox label$/,
      /^radio label$/
    ];

    return noisePatterns.some(pattern => pattern.test(text));
  }

  function isUploadInstructionText(value) {
    const text = humanize(value).toLowerCase();
    if (!text) {
      return false;
    }

    return /^choose(?: a)? file(?: or drop it here)?$/.test(text) ||
      /^or$/.test(text) ||
      /^or drop it here$/.test(text) ||
      /^drop it here$/.test(text) ||
      /^(?:choose(?: a)? file(?: or drop it here)?\s*)?(?:\d+(?:\.\d+)?\s*(?:kb|mb|gb)\s*(?:file\s*)?size\s*limit)$/.test(text);
  }

  function hasExplicitRequiredAttribute(element) {
    if (!element) {
      return false;
    }

    return Boolean(element.required) ||
      element.getAttribute('required') !== null ||
      element.getAttribute('aria-required') === 'true' ||
      element.getAttribute('data-required') === 'true';
  }

  function requirementContextRoot(element) {
    return composedClosest(element, [
      'sr-screening-question',
      'spl-form-element',
      '[id^="spl-form-element_"]',
      '[id^="question_"]',
      '[data-question]',
      '.field',
      '.form-field',
      '.form-group',
      'fieldset',
      '[role="radiogroup"]',
      '[role="group"]'
    ].join(', '));
  }

  function requirementTextsFor(element, labelText) {
    const root = requirementContextRoot(element);
    const texts = [
      labelText,
      textFromLabelledBy(element),
      textFromDescribedBy(element),
      element.getAttribute('aria-label'),
      element.getAttribute('data-label'),
      element.getAttribute('placeholder')
    ];

    if (root && root !== element) {
      const direct = directTextFor(root);
      if (direct) {
        texts.push(direct);
      }

      const validationText = Array.from(root.querySelectorAll('[role="alert"], [aria-live], [class*="error"], [class*="invalid"], [data-testid*="error"], [data-test-id*="error"]'))
        .map(candidate => compactText(candidate.textContent))
        .filter(Boolean)
        .join(' ');
      if (validationText) {
        texts.push(validationText);
      }
    }

    return texts.filter(Boolean);
  }

  function hasOptionalTextMarker(text) {
    const normalized = normalize(text);
    return /\boptional\b/.test(normalized) || /\bnot required\b/.test(normalized);
  }

  function hasRequiredTextMarker(text) {
    if (hasOptionalTextMarker(text)) {
      return false;
    }

    return /\*/.test(text) ||
      /\b(required|mandatory)\b/i.test(text) ||
      isValidationMessageText(text);
  }

  function requirementInfoFor(element, labelText) {
    if (!element) {
      return { required: false, optional: false };
    }

    if (hasExplicitRequiredAttribute(element)) {
      return { required: true, optional: false };
    }

    const texts = requirementTextsFor(element, labelText);
    if (texts.some(hasOptionalTextMarker)) {
      return { required: false, optional: true };
    }

    if (texts.some(hasRequiredTextMarker)) {
      return { required: true, optional: false };
    }

    return { required: false, optional: false };
  }

  function isUsableLabelText(value) {
    return Boolean(value) &&
      isMeaningfulLabelText(value) &&
      !isGeneratedFieldKey(value) &&
      !isLabelNoiseText(value);
  }

  function textContentAcrossOpenRoots(root, visited) {
    const seen = visited || new Set();
    if (!root || seen.has(root)) {
      return '';
    }
    seen.add(root);

    const chunks = [];

    function walk(node) {
      if (!node) {
        return;
      }

      if (node.nodeType === Node.TEXT_NODE) {
        const text = compactText(node.textContent);
        if (text) {
          chunks.push(text);
        }
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE) {
      }
        return;

      const elementNode = node.nodeType === Node.ELEMENT_NODE ? node : null;
      if (elementNode) {
        const tag = elementNode.tagName ? elementNode.tagName.toLowerCase() : '';
        if (tag === 'script' || tag === 'style' || tag === 'noscript') {
          return;
        }

        const shadowRoot = shadowRootFor(elementNode);
        if (shadowRoot) {
          const shadowText = textContentAcrossOpenRoots(shadowRoot, seen);
          if (shadowText) {
            chunks.push(shadowText);
          }
        }
      }

      Array.from(node.childNodes || []).forEach(walk);
    }

    walk(root);
    return compactText(chunks.join(' '));
  }

  function composedParentElement(element) {
    if (!element) {
      return null;
    }

    if (element.parentElement) {
      return element.parentElement;
    }

    const root = element.getRootNode ? element.getRootNode() : null;
    return root && root.host && root.host.nodeType === Node.ELEMENT_NODE ? root.host : null;
  }

  function composedClosest(element, selector) {
    let current = element;
    for (let depth = 0; current && current !== document.body && depth < 12; depth++) {
      const closest = current.closest ? current.closest(selector) : null;
      if (closest) {
        return closest;
      }

      current = composedParentElement(current);
    }

    return null;
  }

  function containsFieldControl(element) {
    try {
      return Boolean(element.querySelector('input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"], [role="searchbox"], [role="combobox"], [aria-haspopup]'));
    } catch (error) {
      return false;
    }
  }

  function labelTextFromNearbyElement(element) {
    if (!element || !isVisible(element)) {
      return '';
    }

    const direct = directTextFor(element);
    if (isUsableLabelText(direct)) {
      return direct;
    }

    const labelCandidate = element.matches && element.matches('label, legend, th, dt, [data-label], [data-testid*="label"], [data-test-id*="label"], [class*="label"], [class*="question"]')
      ? element
      : element.querySelector('label, legend, th, dt, [data-label], [data-testid*="label"], [data-test-id*="label"], [class*="label"], [class*="question"], p, span');
    if (labelCandidate) {
      const labelText = directTextFor(labelCandidate) || compactText(labelCandidate.textContent);
      if (isUsableLabelText(labelText)) {
        return labelText;
      }
    }

    if (!containsFieldControl(element)) {
      const text = compactText(element.textContent);
      if (isUsableLabelText(text)) {
        return text;
      }
    }

    return '';
  }

  function fieldControlCount(root) {
    try {
      return root.querySelectorAll('input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"], [role="searchbox"], [role="combobox"], [aria-haspopup]').length;
    } catch (error) {
      return 0;
    }
  }

  function visibleTextChunks(root, excludedElement) {
    const chunks = [];

    function walk(node) {
      if (!node) {
        return;
      }

      if (node.nodeType === Node.TEXT_NODE) {
        const text = compactText(node.textContent);
        if (isUsableLabelText(text)) {
          chunks.push(text);
        }
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      if (node === excludedElement) {
        return;
      }

      const elementNode = node;
      const tag = elementNode.tagName ? elementNode.tagName.toLowerCase() : '';
      if (tag === 'script' || tag === 'style' || elementNode.getAttribute('aria-hidden') === 'true') {
        return;
      }

      if (elementNode !== root && !isVisible(elementNode)) {
        return;
      }

      if (elementNode !== root && elementNode.matches && elementNode.matches('input, textarea, select, button, [role="button"]')) {
        return;
      }

      Array.from(elementNode.childNodes || []).forEach(walk);
    }

    walk(root);
    return chunks.filter((chunk, index) => chunks.indexOf(chunk) === index);
  }


  function labelTextFromFieldContainer(element) {
    const roots = [];
    const closestSelectors = [
      'label',
      '[role="checkbox"]',
      '[class*="checkbox"]',
      '[class*="check"]',
      '[class*="consent"]',
      '[class*="privacy"]',
      '.field',
      '.form-field',
      '.form-group',
      '.application-question',
      '.question',
      '[data-question]',
      '[data-label]',
      '[role="group"]',
      '[class*="field"]',
      '[class*="form"]',
      '[class*="question"]',
      '[class*="answer"]',
      'li'
    ];

    closestSelectors.forEach(selector => {
      const root = composedClosest(element, selector);
      if (root && !roots.includes(root)) {
        roots.push(root);
      }
    });

    let current = composedParentElement(element);
    for (let depth = 0; current && current !== document.body && depth < 8; depth++) {
      if (!roots.includes(current)) {
        roots.push(current);
      }

      current = composedParentElement(current);
    }

    for (let index = 0; index < roots.length; index++) {
      const root = roots[index];
      if (!root || !isVisible(root) || fieldControlCount(root) > 3) {
        continue;
      }

      const chunks = visibleTextChunks(root, element);
      if (chunks.length === 0) {
        continue;
      }

      const text = compactText(chunks.join(' '));
      if (isUsableLabelText(text) && text.length >= 4 && !isUploadInstructionText(text)) {
        return text;
      }
    }

    return '';
  }

  function fileFieldContainerKey(element, labelText) {
    if (normalize(element.type) !== 'file') {
      return '';
    }

    let current = composedParentElement(element);
    for (let depth = 0; current && current !== document.body && depth < 8; depth++) {
      if (!isVisible(current) || fieldControlCount(current) > 3) {
        current = composedParentElement(current);
        continue;
      }

      const chunks = visibleTextChunks(current, element);
      const containerLabel = compactText(chunks.join(' '));
      if (isUsableLabelText(containerLabel) || isUsableLabelText(labelText)) {
        return selectorFor(current);
      }

      current = composedParentElement(current);
    }

    return '';
  }

  function renderedTextChunks(root, excludedElement) {
    const chunks = [];

    function walk(node) {
      if (!node) {
        return;
      }

      if (node.nodeType === Node.TEXT_NODE) {
        const text = compactText(node.textContent);
        if (!isUsableLabelText(text)) {
          return;
        }

        try {
          const range = document.createRange();
          range.selectNodeContents(node);
          const rects = Array.from(range.getClientRects());
          range.detach();
          if (rects.some(rect => rect.width > 0 && rect.height > 0)) {
            chunks.push({ text, rects });
          }
        } catch (error) {
          chunks.push({ text, rects: [] });
        }
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE || node === excludedElement) {
        return;
      }

      const elementNode = node;
      if (elementNode.getAttribute('aria-hidden') === 'true') {
        return;
      }

      const tag = elementNode.tagName ? elementNode.tagName.toLowerCase() : '';
      if (tag === 'script' || tag === 'style' || tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') {
        return;
      }

      if (elementNode !== root && !isVisible(elementNode)) {
        return;
      }

      Array.from(elementNode.childNodes || []).forEach(walk);
    }

    walk(root);
    return chunks;
  }

  function labelTextFromRenderedRow(element) {
    const controlRect = element.getBoundingClientRect();
    const chunks = [];
    let current = composedParentElement(element);

    for (let depth = 0; current && current !== document.body && depth < 8; depth++) {
      if (isVisible(current) && fieldControlCount(current) <= 3) {
        renderedTextChunks(current, element).forEach(chunk => {
          const rect = chunk.rects[0] || current.getBoundingClientRect();
          const verticalOverlap = Math.min(controlRect.bottom + 72, rect.bottom) - Math.max(controlRect.top - 24, rect.top);
          const sameVisualGroup = verticalOverlap > 0 || Math.abs(rect.top - controlRect.top) < 96;
          const startsNearControl = rect.left <= controlRect.right + 96;
          const belowNextRow = rect.top > controlRect.bottom + 16;

          if (sameVisualGroup && startsNearControl && !belowNextRow) {
            chunks.push({
              text: chunk.text,
              distance: Math.abs(rect.left - controlRect.left) + Math.abs(rect.top - controlRect.top)
            });
          }
        });
      }

      current = composedParentElement(current);
    }

    const unique = [];
    chunks
      .sort((left, right) => left.distance - right.distance)
      .forEach(chunk => {
        if (!unique.includes(chunk.text)) {
          unique.push(chunk.text);
        }
      });

    const text = compactText(unique.join(' '));
    return isUsableLabelText(text) ? text : '';
  }

  function nearestVisibleRect(element) {
    let current = element;
    for (let depth = 0; current && current !== document.body && depth < 8; depth++) {
      try {
        const rect = current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return rect;
        }
      } catch (error) {
        // Keep walking to a visible ancestor.
      }

      current = composedParentElement(current);
    }

    return element.getBoundingClientRect();
  }

  function distanceBetweenRects(source, target) {
    const sourceX = source.left + source.width / 2;
    const sourceY = source.top + source.height / 2;
    const targetX = target.left + target.width / 2;
    const targetY = target.top + target.height / 2;
    return Math.abs(sourceX - targetX) + Math.abs(sourceY - targetY);
  }

  function labelTextFromNearestVisibleText(element) {
    const anchorRect = nearestVisibleRect(element);
    const owner = element.ownerDocument || document;
    const walker = owner.createTreeWalker(owner.body || owner.documentElement, NodeFilter.SHOW_TEXT);
    const candidates = [];
    let node = walker.nextNode();

    while (node) {
      const text = compactText(node.textContent);
      if (isUsableLabelText(text) && !isUploadInstructionText(text)) {
        try {
          const range = owner.createRange();
          range.selectNodeContents(node);
          const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
          range.detach();

          rects.forEach(rect => {
            const verticalDistance = Math.max(0, Math.max(anchorRect.top - rect.bottom, rect.top - anchorRect.bottom));
            const horizontalDistance = Math.max(0, Math.max(anchorRect.left - rect.right, rect.left - anchorRect.right));
            if (verticalDistance <= 140 && horizontalDistance <= 520) {
              const belowNextRow = rect.top > anchorRect.bottom + 16;
              const sameRowOrAbove = rect.bottom >= anchorRect.top - 16 && rect.top <= anchorRect.bottom + 16;
              candidates.push({
                text,
                distance: distanceBetweenRects(anchorRect, rect),
                priority: belowNextRow ? 2 : sameRowOrAbove ? 0 : 1
              });
            }
          });
        } catch (error) {
          // Ignore text nodes that cannot produce ranges in this WebView.
        }
      }

      node = walker.nextNode();
    }

    candidates.sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      return left.distance - right.distance;
    });

    return candidates.length > 0 ? candidates[0].text : '';
  }

  function labelDebugCandidatesFor(element) {
    const candidates = [];
    let current = composedParentElement(element);
    for (let depth = 0; current && current !== document.body && depth < 8; depth++) {
      const rawText = compactText(current.textContent);
      const chunks = visibleTextChunks(current, element);
      candidates.push({
        depth,
        tagName: current.tagName ? current.tagName.toLowerCase() : '',
        className: String(current.className || '').slice(0, 160),
        controlCount: fieldControlCount(current),
        rawText: rawText.slice(0, 260),
        usableChunks: chunks.slice(0, 8),
        renderedChunks: renderedTextChunks(current, element).map(chunk => chunk.text).slice(0, 8)
      });
      current = composedParentElement(current);
    }

    return candidates;
  }

  function labelTextAbove(element) {
    let current = element;
    for (let depth = 0; current && current !== document.body && depth < 8; depth++) {
      let previous = current.previousElementSibling;
      for (let siblingDepth = 0; previous && siblingDepth < 4; siblingDepth++) {
        const text = labelTextFromNearbyElement(previous);
        if (text && !isUploadInstructionText(text)) {
          return text;
        }

        previous = previous.previousElementSibling;
      }

      current = composedParentElement(current);
    }

    return '';
  }

  function labelTextBeside(element) {
    const candidateTexts = [];
    const visited = new Set();

    function addCandidate(candidate, sourceElement) {
      if (!candidate || visited.has(candidate) || candidate === element || !isVisible(candidate)) {
        return;
      }

      visited.add(candidate);
      const text = labelTextFromNearbyElement(candidate);
      if (!text || isUploadInstructionText(text)) {
        return;
      }

      const controlRect = element.getBoundingClientRect();
      const candidateRect = candidate.getBoundingClientRect();
      const verticalOverlap = Math.min(controlRect.bottom, candidateRect.bottom) - Math.max(controlRect.top, candidateRect.top);
      const sameRow = verticalOverlap > 0 || Math.abs(candidateRect.top - controlRect.top) < Math.max(32, controlRect.height * 1.5);
      const toRight = candidateRect.left >= controlRect.left;
      const sourceRect = sourceElement && sourceElement.getBoundingClientRect ? sourceElement.getBoundingClientRect() : controlRect;

      candidateTexts.push({
        text,
        sameRow,
        toRight,
        distance: Math.abs(candidateRect.left - sourceRect.right) + Math.abs(candidateRect.top - sourceRect.top)
      });
    }

    let current = element;
    for (let depth = 0; current && current !== document.body && depth < 5; depth++) {
      addCandidate(current.nextElementSibling, current);
      addCandidate(current.previousElementSibling, current);

      const parent = composedParentElement(current);
      if (parent) {
        Array.from(parent.children || []).forEach(child => {
          if (child !== current && !child.contains(element)) {
            addCandidate(child, current);
          }
        });
      }

      current = composedParentElement(current);
    }

    candidateTexts.sort((left, right) => {
      if (left.sameRow !== right.sameRow) {
        return left.sameRow ? -1 : 1;
      }

      if (left.toRight !== right.toRight) {
        return left.toRight ? -1 : 1;
      }

      return left.distance - right.distance;
    });

    if (candidateTexts.length > 0) {
      return candidateTexts[0].text;
    }

    return '';
  }

  function labelTextFromDirectContainerText(element) {
    let current = composedParentElement(element);
    for (let depth = 0; current && current !== document.body && depth < 4; depth++) {
      const text = directTextFor(current);
      if (isUsableLabelText(text)) {
        return text;
      }

      current = composedParentElement(current);
    }

    return '';
  }

  function labelTextForStandaloneBinaryOrFile(element) {
    const nativeType = normalize(element.type);
    if (nativeType !== 'checkbox' && nativeType !== 'file') {
      return '';
    }

    if (nativeType === 'file') {
      const above = labelTextAbove(element);
      if (above) {
        return above;
      }
    }

    const fieldContainerText = labelTextFromFieldContainer(element);
    if (fieldContainerText) {
      return fieldContainerText;
    }

    const renderedRowText = labelTextFromRenderedRow(element);
    if (renderedRowText) {
      return renderedRowText;
    }

    const nearestVisibleText = labelTextFromNearestVisibleText(element);
    if (nearestVisibleText) {
      return nearestVisibleText;
    }

    const beside = labelTextBeside(element);
    if (beside) {
      return beside;
    }

    const containerText = labelTextFromDirectContainerText(element);
    if (containerText) {
      return containerText;
    }

    return '';
  }

  function nearestLabelText(element) {
    let current = element;
    for (let depth = 0; current && current !== document.body && depth < 12; depth++) {
      const label = composedClosest(current, 'label, legend, th, dt');
      if (label) {
        const text = compactText(label.textContent);
        if (isUsableLabelText(text)) {
          return text;
        }
      }

      const questionRoot = composedClosest(current, '.field, .application-question, .question, [id^="question_"], [id^="spl-form-element_"], [data-question], [data-label], [data-testid*="label"], [aria-labelledby], sr-screening-question, spl-form-element');
      if (questionRoot) {
        const text = bestQuestionText(questionRoot);
        if (isUsableLabelText(text)) {
          return text;
        }
      }

      const previous = current.previousElementSibling;
      if (previous) {
        const text = labelTextFromNearbyElement(previous);
        if (text) {
          return text;
        }
      }

      current = composedParentElement(current);
    }

    return '';
  }

  function directTextFor(element) {
    const parts = [];
    Array.from(element.childNodes || []).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = compactText(node.textContent);
        if (text) {
          parts.push(text);
        }
      }
    });

    return compactText(parts.join(' '));
  }

  function bestQuestionText(root) {
    if (!root) {
      return '';
    }

    const dataLabel = root.getAttribute('data-label') || root.getAttribute('aria-label') || '';
    if (isUsableLabelText(dataLabel)) {
      return dataLabel;
    }

    const labelledBy = textFromLabelledBy(root);
    if (isUsableLabelText(labelledBy)) {
      return labelledBy;
    }

    const selectors = [
      'label[for]',
      'legend',
      'h1',
      'h2',
      'h3',
      'h4',
      '[data-testid*="label"]',
      '[data-test-id*="label"]',
      '[class*="label"]',
      '[class*="question"]',
      '[class*="title"]',
      'p',
      'span'
    ];

    for (let index = 0; index < selectors.length; index++) {
      const candidate = root.querySelector(selectors[index]);
      if (!candidate) {
        continue;
      }

      const direct = directTextFor(candidate);
      const text = direct || compactText(candidate.textContent);
      if (isUsableLabelText(text)) {
        return text;
      }
    }

    const direct = directTextFor(root);
    if (isUsableLabelText(direct)) {
      return direct;
    }

    const text = compactText(root.textContent);
    return isUsableLabelText(text) ? text : '';
  }

  function labelFor(element) {
    const candidates = [];

    if (element.labels && element.labels.length) {
      const labelText = compactText(element.labels[0].textContent);
      if (isUsableLabelText(labelText)) {
        candidates.push(labelText);
      }
    }

    if (element.id) {
      const root = element.getRootNode ? element.getRootNode() : element.ownerDocument || document;
      const explicitLabel = root.querySelector ? root.querySelector('label[for="' + cssEscape(element.id) + '"]') : null;
      const labelText = explicitLabel ? compactText(explicitLabel.textContent) : '';
      if (isUsableLabelText(labelText)) {
        candidates.push(labelText);
      }
    }

    const labelledByText = textFromLabelledBy(element);
    if (isUsableLabelText(labelledByText)) {
      candidates.push(labelledByText);
    }

    const explicit =
      element.getAttribute('aria-label') ||
      element.getAttribute('placeholder') ||
      element.getAttribute('data-testid') ||
      '';

    const explicitText = humanize(explicit);
    if (isUsableLabelText(explicitText)) {
      candidates.push(explicitText);
    }

    const shapeSpecific = labelTextForStandaloneBinaryOrFile(element);
    if (isUsableLabelText(shapeSpecific)) {
      candidates.push(shapeSpecific);
    }

    const nearest = nearestLabelText(element);
    if (isUsableLabelText(nearest)) {
      candidates.push(nearest);
    }

    const above = labelTextAbove(element);
    if (isUsableLabelText(above)) {
      candidates.push(above);
    }

    const describedByText = textFromDescribedBy(element);
    if (isUsableLabelText(describedByText)) {
      candidates.push(describedByText);
    }

    if (candidates.length === 0) {
      return '';
    }

    return clippedLabel(candidates[0], MAX_LABEL_LENGTH);
  }

  function normalize(value) {
    return String(value || '').toLowerCase();
  }

  function factsFor(element, labelText) {
    const requirement = requirementInfoFor(element, labelText);
    return {
      tagName: normalize(element.tagName),
      nativeType: normalize(element.type),
      role: normalize(element.getAttribute('role')),
      ariaHasPopup: normalize(element.getAttribute('aria-haspopup')),
      ariaExpanded: normalize(element.getAttribute('aria-expanded')),
      ariaControls: normalize(element.getAttribute('aria-controls')),
      ariaOwns: normalize(element.getAttribute('aria-owns')),
      ariaActiveDescendant: normalize(element.getAttribute('aria-activedescendant')),
      ariaAutocomplete: normalize(element.getAttribute('aria-autocomplete')),
      ariaMultiselectable: normalize(element.getAttribute('aria-multiselectable')),
      isContentEditable: element.isContentEditable ? 'true' : 'false',
      autocomplete: normalize(element.getAttribute('autocomplete')),
      list: normalize(element.getAttribute('list')),
      required: requirement.required ? 'true' : 'false',
      optional: requirement.optional ? 'true' : 'false',
      disabled: element.disabled || element.getAttribute('aria-disabled') === 'true' ? 'true' : 'false',
      readonly: element.readOnly || element.getAttribute('aria-readonly') === 'true' ? 'true' : 'false',
      multiple: element.multiple ? 'true' : 'false',
      labelText: normalize(labelText)
    };
  }

  function fieldKey(value) {
    return normalize(
      String(value || '')
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/[\[\]().,_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    );
  }

  function matchesExpected(facts, expected) {
    return Object.keys(expected).every(key => {
      if (key === 'labelContains') {
        return facts.labelText.includes(normalize(expected[key]));
      }

      return facts[key] === normalize(expected[key]);
    });
  }

  function matchesRule(facts, rule) {
    const any = Array.isArray(rule.any) ? rule.any : [];
    return any.some(expected => matchesExpected(facts, expected));
  }

  function selectionModeFor(facts, controlFamily) {
    const rules = window.__fieldControlRules || {};
    const selectionFacts = Object.assign({}, facts, { controlFamily: normalize(controlFamily) });
    const match = Array.isArray(rules.selectionModes)
      ? rules.selectionModes.find(rule => matchesRule(selectionFacts, rule))
      : null;

    return {
      selectionMode: match && match.selectionMode ? match.selectionMode : '',
      selectionModeReason: match && match.reason ? match.reason : ''
    };
  }

  function controlInfoFor(element, labelText) {
    const facts = factsFor(element, labelText);
    const rules = window.__fieldControlRules || {};
    const match = Array.isArray(rules.controlTypes)
      ? rules.controlTypes.find(rule => matchesRule(facts, rule))
      : null;
    const fallback = rules.fallback || {
      controlType: facts.nativeType || facts.tagName || 'text',
      reason: 'Fallback from native DOM type.'
    };

    const controlFamily = match && match.family ? match.family : fallback.family || '';
    const selectionInfo = selectionModeFor(facts, controlFamily);

    return {
      facts,
      controlType: match && match.controlType ? match.controlType : fallback.controlType,
      controlFamily,
      selectionMode: selectionInfo.selectionMode,
      selectionModeReason: selectionInfo.selectionModeReason,
      scanReason: match && match.reason ? match.reason : fallback.reason,
      requiresCapturedOption: Boolean(match && match.requiresCapturedOption),
      valuePolicy: match && match.valuePolicy ? match.valuePolicy : fallback.valuePolicy || '',
      fillStrategy: match && match.fillStrategy ? match.fillStrategy : fallback.fillStrategy || '',
      optionSourceGroup: match && match.optionSourceGroup ? match.optionSourceGroup : '',
      extractionActionGroup: match && match.extractionActionGroup ? match.extractionActionGroup : ''
    };
  }

  function owningChoiceControlForNestedInput(element) {
    if (!element || element.tagName.toLowerCase() !== 'input') {
      return null;
    }

    const nativeType = normalize(element.type);
    if (nativeType && nativeType !== 'text' && nativeType !== 'search') {
      return null;
    }

    let current = composedParentElement(element);
    for (let depth = 0; current && current !== document.body && depth < 6; depth++) {
      const controls = Array.from(current.querySelectorAll('[role="combobox"], [aria-haspopup="listbox"], [aria-haspopup="grid"]'))
        .filter(candidate => candidate !== element && isVisible(candidate));

      if (controls.length > 0) {
        return controls[0];
      }

      current = composedParentElement(current);
    }

    return null;
  }

  function shouldSkipNestedChoiceTextInput(element, controlInfo) {
    if (controlInfo.controlFamily !== 'text' || element.tagName.toLowerCase() !== 'input') {
      return false;
    }

    if (element.id || element.name || element.getAttribute('autocomplete')) {
      return false;
    }

    return Boolean(owningChoiceControlForNestedInput(element));
  }

  function shouldSkipActionOnlyPopupButton(element, controlInfo) {
    if (!element || element.tagName.toLowerCase() !== 'button') {
      return false;
    }

    if (normalize(element.getAttribute('role')) === 'combobox') {
      return false;
    }

    return controlInfo.controlType === 'gridCombobox';
  }

  function nonApplicationControlReason(element) {
    if (!element) {
      return '';
    }

    const selfSignals = [
      element.id,
      element.name,
      element.getAttribute('class'),
      element.getAttribute('aria-label'),
      element.getAttribute('data-testid'),
      element.getAttribute('data-test-id')
    ].map(normalize).join(' ');

    if (/\b(?:ot-group-id|onetrust|cookiebot|cmp-)/.test(selfSignals) ||
      /\b(?:vendor-search-handler|select-all-vendor|select-all-hosts|chkbox-id)\b/.test(selfSignals)) {
      return 'Control belongs to a cookie/privacy preference widget.';
    }

    let current = element;
    for (let depth = 0; current && current !== document.body && depth < 8; depth++) {
      const signals = [
        current.id,
        current.getAttribute('class'),
        current.getAttribute('role'),
        current.getAttribute('aria-label'),
        current.getAttribute('data-testid'),
        current.getAttribute('data-test-id')
      ].map(normalize).join(' ');

      if (/\b(?:onetrust|ot-sdk|ot-pc|cookiebot|cookie-consent|cookie-banner|cookie-preference|consent-manager|privacy-preference|preference-center|cmp-container)\b/.test(signals)) {
        return 'Control is inside a cookie/privacy preference widget.';
      }

      current = composedParentElement(current);
    }

    return '';
  }

  function sensitiveFieldInfo(element, labelText) {
    const rules = window.__fieldControlRules || {};
    const detection = rules.sensitiveFieldDetection;
    const empty = { fieldCategory: '', fieldSubCategory: '', fieldCategoryReason: '' };

    if (!detection || !Array.isArray(detection.categories)) {
      return empty;
    }

    const matchAgainst = Array.isArray(detection.matchAgainst) ? detection.matchAgainst : ['label'];
    const haystacks = [];
    if (matchAgainst.includes('label')) {
      haystacks.push(normalize(labelText));
    }

    if (matchAgainst.includes('placeholder')) {
      haystacks.push(normalize(element.getAttribute('placeholder') || ''));
    }

    for (let categoryIndex = 0; categoryIndex < detection.categories.length; categoryIndex++) {
      const category = detection.categories[categoryIndex];
      const keywords = Array.isArray(category.keywords) ? category.keywords : [];
      for (let keywordIndex = 0; keywordIndex < keywords.length; keywordIndex++) {
        const keyword = normalize(keywords[keywordIndex]);
        if (!keyword) {
          continue;
        }

        if (haystacks.some(haystack => haystack.includes(keyword))) {
          return {
            fieldCategory: detection.resultFieldCategory || 'sensitive',
            fieldSubCategory: category.subCategory || '',
            fieldCategoryReason: 'Label matched sensitive/EEO keyword "' + keywords[keywordIndex] + '".'
          };
        }
      }
    }

    return empty;
  }

  function isVisible(element) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0;
  }

  function optionFromElement(element, selector, selected) {
    const text = optionTextFor(element);
    const value = compactText(element.getAttribute('value') || element.getAttribute('data-value') || text);

    if (!value && !text) {
      return null;
    }

    if (!isOptionText(text || value)) {
      return null;
    }

    return {
      value,
      label: text || value,
      selector,
      source: 'dom',
      fillMethod: selector ? 'clickSelector' : 'clickVisibleText',
      selected: Boolean(selected),
      position: 0
    };
  }

  function optionTextFor(element) {
    if (!element) {
      return '';
    }

    const labelledBy = textFromLabelledBy(element);
    const candidates = [
      labelledBy,
      element.getAttribute('aria-label'),
      element.getAttribute('data-label'),
      element.getAttribute('title'),
      element.textContent,
      textContentAcrossOpenRoots(element),
      element.getAttribute('value'),
      element.getAttribute('data-value')
    ];

    for (let index = 0; index < candidates.length; index++) {
      const text = compactText(candidates[index]);
      if (text) {
        return text;
      }
    }

    return '';
  }

  function isOptionText(value) {
    const text = compactText(value);
    return Boolean(text) &&
      text.length <= MAX_CONTEXT_LABEL_LENGTH &&
      !isValidationMessageText(text) &&
      !isGenericPlaceholderText(text);
  }

  function choiceInputLabel(input) {
    if (input.labels && input.labels.length) {
      const labelText = textContentAcrossOpenRoots(input.labels[0]) || compactText(input.labels[0].textContent);
      if (isUsableLabelText(labelText) && labelText.length <= MAX_CONTEXT_LABEL_LENGTH) {
        return clippedLabel(labelText, MAX_LABEL_LENGTH);
      }
    }

    const label = composedClosest(input, 'label');
    if (label) {
      const text = textContentAcrossOpenRoots(label) || compactText(label.textContent);
      if (isUsableLabelText(text) && text.length <= MAX_CONTEXT_LABEL_LENGTH) {
        return clippedLabel(text, MAX_LABEL_LENGTH);
      }
    }

    const labelledBy = textFromLabelledBy(input);
    if (isUsableLabelText(labelledBy) && labelledBy.length <= MAX_CONTEXT_LABEL_LENGTH) {
      return clippedLabel(labelledBy, MAX_LABEL_LENGTH);
    }

    const ariaLabel = input.getAttribute('aria-label');
    if (isUsableLabelText(ariaLabel)) {
      return clippedLabel(ariaLabel, MAX_LABEL_LENGTH);
    }

    return clippedLabel(input.value || input.name || input.id || '', MAX_LABEL_LENGTH);
  }

  function ariaChoiceLabel(element) {
    const labelledBy = textFromLabelledBy(element);
    if (isUsableLabelText(labelledBy) && labelledBy.length <= MAX_CONTEXT_LABEL_LENGTH) {
      return clippedLabel(labelledBy, MAX_LABEL_LENGTH);
    }

    const ariaLabel = element.getAttribute('aria-label');
    if (isUsableLabelText(ariaLabel)) {
      return clippedLabel(ariaLabel, MAX_LABEL_LENGTH);
    }

    const text = textContentAcrossOpenRoots(element) || compactText(element.textContent);
    if (isUsableLabelText(text) && text.length <= MAX_CONTEXT_LABEL_LENGTH) {
      return clippedLabel(text, MAX_LABEL_LENGTH);
    }

    return clippedLabel(element.getAttribute('data-value') || element.id || '', MAX_LABEL_LENGTH);
  }

  function choiceInputsIn(root, nativeType) {
    return collectElementsAcrossRoots(root, 'input[type="' + nativeType + '"]')
      .filter(input => !input.disabled && isUsableChoiceInput(input) && !nonApplicationControlReason(input));
  }

  function isUsableChoiceInput(input) {
    if (!input) {
      return false;
    }

    if (isVisible(input)) {
      return true;
    }

    const labels = input.labels ? Array.from(input.labels) : [];
    if (labels.some(label => isVisible(label) && isUsableLabelText(textContentAcrossOpenRoots(label) || label.textContent))) {
      return true;
    }

    const closestLabel = composedClosest(input, 'label');
    if (closestLabel && isVisible(closestLabel) && isUsableLabelText(textContentAcrossOpenRoots(closestLabel) || closestLabel.textContent)) {
      return true;
    }

    const visualControl = composedClosest(input, '[role="radio"], [role="checkbox"], .radio, .checkbox, [class*="radio"], [class*="checkbox"], [class*="c-spl-radio"], [class*="c-spl-checkbox"]');
    return Boolean(visualControl && isVisible(visualControl));
  }

  function normalizedChoiceText(value) {
    return humanize(value).toLowerCase();
  }

  function hasAnyTextMatch(values, patterns) {
    return values.some(value => {
      const text = normalizedChoiceText(value);
      return text && patterns.some(pattern => pattern.test(text));
    });
  }

  function inferChoiceSelectionMode(nativeType, fieldLabel, options, inputs) {
    if (nativeType === 'radio') {
      return {
        selectionMode: 'single',
        multiple: false,
        reason: 'Native radio controls under one question allow one selected answer.'
      };
    }

    const optionTexts = options
      .flatMap(option => [option.label, option.value])
      .filter(Boolean);
    const names = Array.from(new Set(inputs.map(input => input.name).filter(Boolean)));

    const multiQuestionPatterns = [
      /all that apply/,
      /select (?:all|any|one or more)/,
      /choose (?:all|any|one or more)/,
      /check (?:all|any|one or more)/,
      /one or more/,
      /multiple (?:answers|responses|selections|options)/,
      /any of (?:the )?(?:following|these)/,
      /which (?:of )?(?:the )?(?:following|these).*(?:apply|are true|match)/,
      /\bskills?\b/,
      /\blanguages?\b/,
      /\bcertifications?\b/,
      /\blicenses?\b/,
      /\bcountries\b/,
      /\blocations\b/,
      /\bwork locations\b/,
      /\bschools?\b/,
      /\bdegrees?\b/
    ];

    const singleQuestionPatterns = [
      /choose one/,
      /select one/,
      /pick one/,
      /only one/,
      /one answer/,
      /best describes/,
      /identify as/,
      /single (?:answer|response|selection|option)/,
      /yes or no/,
      /\by\/n\b/,
      /\btrue or false\b/,
      /\bauthorized\b/,
      /\bsponsorship\b/,
      /\bvisa\b/,
      /\bwilling\b/,
      /\bagree\b/,
      /\bconsent\b/,
      /\bconfirm\b/,
      /\backnowledge\b/,
      /\bgender\b/,
      /\brace\b/,
      /\bethnicity\b/,
      /\bveteran status\b/,
      /\bdisability status\b/
    ];

    const mutuallyExclusiveOptionPatterns = [
      /^(yes|no)$/,
      /^(true|false)$/,
      /^(agree|disagree)$/,
      /^(i agree|i do not agree|i don't agree)$/,
      /^(authorized|not authorized)$/,
      /^(willing|not willing)$/,
      /^(citizen|non[- ]?citizen)$/,
      /^(male|female|non[- ]?binary|prefer not to answer|decline to self identify)$/
    ];

    const yesNoLike = optionTexts.length >= 2 &&
      optionTexts.some(text => /^(yes|true)$/i.test(normalizedChoiceText(text))) &&
      optionTexts.some(text => /^(no|false)$/i.test(normalizedChoiceText(text)));

    if (hasAnyTextMatch([fieldLabel], multiQuestionPatterns)) {
      return {
        selectionMode: 'multiple',
        multiple: true,
        reason: 'Question text indicates multiple checkbox answers are allowed.'
      };
    }

    if (yesNoLike || hasAnyTextMatch([fieldLabel], singleQuestionPatterns)) {
      return {
        selectionMode: 'single',
        multiple: false,
        reason: 'Question text or yes/no options indicate the checkbox answers are mutually exclusive.'
      };
    }

    if (optionTexts.length > 0 && optionTexts.every(text => hasAnyTextMatch([text], mutuallyExclusiveOptionPatterns))) {
      return {
        selectionMode: 'single',
        multiple: false,
        reason: 'Captured checkbox options form a mutually exclusive answer set.'
      };
    }

    const hasArrayName = names.some(name => /\[\]$/.test(name));
    if (options.length >= 4 && (names.length !== 1 || hasArrayName)) {
      return {
        selectionMode: 'multiple',
        multiple: true,
        reason: 'Checkbox group has several independent options, so multiple answers are likely allowed.'
      };
    }

    return {
      selectionMode: 'unknown',
      multiple: false,
      reason: 'Checkbox answer group is ambiguous because the page does not clearly indicate single or multiple answers.'
    };
  }

  function nearestChoiceGroupRoot(input) {
    const nativeType = normalize(input.type);
    if (nativeType !== 'radio' && nativeType !== 'checkbox') {
      return null;
    }

    let current = input.parentElement;
    for (let depth = 0; current && current !== document.body && depth < 8; depth++) {
      const choices = choiceInputsIn(current, nativeType);
      if (choices.length >= 2 && choices.length <= 12) {
        const label = bestQuestionText(current);
        if (label && isMeaningfulLabelText(label)) {
          return current;
        }
      }

      current = current.parentElement;
    }

    return null;
  }

  function requirementFactsForChoiceGroup(root, fieldLabel) {
    const requirement = requirementInfoFor(root, fieldLabel);
    return {
      required: requirement.required ? 'true' : 'false',
      optional: requirement.optional ? 'true' : 'false'
    };
  }

  function buildChoiceGroupField(root, nativeType) {
    const inputs = choiceInputsIn(root, nativeType);
    const options = uniqueOptions(inputs
      .map(input => {
        const label = choiceInputLabel(input);
        return {
          value: input.value || label,
          label,
          selector: selectorFor(input),
          source: 'dom',
          fillMethod: 'clickSelector',
          selected: Boolean(input.checked),
          position: 0
        };
      })
      .filter(option => option.value || option.label));

    if (options.length < 2) {
      return null;
    }

    const fieldLabel = clippedLabel(bestQuestionText(root), MAX_LABEL_LENGTH);
    if (!fieldLabel) {
      return null;
    }

    const selectionInfo = inferChoiceSelectionMode(nativeType, fieldLabel, options, inputs);
    const multiple = selectionInfo.multiple;
    const firstInput = inputs[0];
    const controlType = nativeType === 'radio' ? 'radioGroup' : 'checkboxGroup';
    const controlFamily = 'choice';
    const selectionMode = selectionInfo.selectionMode;
    const sensitiveInfo = sensitiveFieldInfo(firstInput, fieldLabel);
    const requirement = requirementFactsForChoiceGroup(root, fieldLabel);

    return {
      selector: selectorFor(root),
      label: fieldLabel,
      inputType: controlType,
      fieldCategory: sensitiveInfo.fieldCategory,
      fieldSubCategory: sensitiveInfo.fieldSubCategory,
      fieldCategoryReason: sensitiveInfo.fieldCategoryReason,
      controlType,
      controlFamily,
      selectionMode,
      selectionModeReason: selectionInfo.reason,
      nativeInputType: nativeType,
      tagName: 'input',
      role: '',
      ariaHasPopup: '',
      ariaExpanded: '',
      ariaControls: '',
      ariaOwns: '',
      ariaActiveDescendant: '',
      ariaAutocomplete: '',
      ariaMultiselectable: multiple ? 'true' : 'false',
      autocomplete: '',
      list: '',
      required: requirement.required,
      optional: requirement.optional,
      disabled: '',
      readonly: '',
      multiple: multiple ? 'true' : 'false',
      scanReason: 'Grouped native ' + nativeType + ' inputs under one question.',
      requiresCapturedOption: true,
      valuePolicy: 'mustMatchCapturedOption',
      fillStrategy: 'clickCapturedChoice',
      optionSourceGroup: nativeType === 'radio' ? 'radio' : 'checkboxGroup',
      extractionActionGroup: '',
      options,
      optionsTruncated: Boolean(options.optionsTruncated),
      optionsScanReason: 'Options read from grouped native ' + nativeType + ' inputs under one question.',
      sourceUrl: window.location.href
    };
  }

  function buildAriaChoiceGroupField(root, choiceRole) {
    const choices = collectElementsAcrossRoots(root, '[role="' + choiceRole + '"]')
      .filter(choice => !choice.getAttribute('aria-disabled') && isVisible(choice) && !nonApplicationControlReason(choice));
    const options = uniqueOptions(choices
      .map(choice => {
        const label = ariaChoiceLabel(choice);
        return {
          value: choice.getAttribute('data-value') || choice.getAttribute('value') || label,
          label,
          selector: selectorFor(choice),
          source: 'dom',
          fillMethod: 'clickSelector',
          selected: choice.getAttribute('aria-checked') === 'true' || choice.getAttribute('aria-selected') === 'true',
          position: 0
        };
      })
      .filter(option => option.value || option.label));

    if (options.length < 2) {
      return null;
    }

    const fieldLabel = clippedLabel(bestQuestionText(root), MAX_LABEL_LENGTH);
    if (!fieldLabel) {
      return null;
    }

    const nativeType = choiceRole === 'radio' ? 'radio' : 'checkbox';
    const selectionInfo = inferChoiceSelectionMode(nativeType, fieldLabel, options, choices);
    const controlType = choiceRole === 'radio' ? 'radioGroup' : 'checkboxGroup';
    const sensitiveInfo = sensitiveFieldInfo(choices[0], fieldLabel);
    const requirement = requirementFactsForChoiceGroup(root, fieldLabel);

    return {
      selector: selectorFor(root),
      label: fieldLabel,
      inputType: controlType,
      fieldCategory: sensitiveInfo.fieldCategory,
      fieldSubCategory: sensitiveInfo.fieldSubCategory,
      fieldCategoryReason: sensitiveInfo.fieldCategoryReason,
      controlType,
      controlFamily: 'choice',
      selectionMode: selectionInfo.selectionMode,
      selectionModeReason: selectionInfo.reason,
      nativeInputType: nativeType,
      tagName: root.tagName ? root.tagName.toLowerCase() : '',
      role: root.getAttribute('role') || '',
      ariaHasPopup: '',
      ariaExpanded: '',
      ariaControls: '',
      ariaOwns: '',
      ariaActiveDescendant: '',
      ariaAutocomplete: '',
      ariaMultiselectable: selectionInfo.multiple ? 'true' : 'false',
      autocomplete: '',
      list: '',
      required: requirement.required,
      optional: requirement.optional,
      disabled: root.getAttribute('aria-disabled') === 'true' ? 'true' : 'false',
      readonly: '',
      multiple: selectionInfo.multiple ? 'true' : 'false',
      scanReason: 'ARIA ' + choiceRole + ' choices under one question.',
      requiresCapturedOption: true,
      valuePolicy: 'mustMatchCapturedOption',
      fillStrategy: 'clickCapturedChoice',
      optionSourceGroup: choiceRole === 'radio' ? 'radio' : 'checkboxGroup',
      extractionActionGroup: '',
      options,
      optionsTruncated: Boolean(options.optionsTruncated),
      optionsScanReason: 'Options read from ARIA ' + choiceRole + ' controls under one question.',
      sourceUrl: window.location.href
    };
  }

  function buildChoiceGroupFields(seen) {
    const fields = [];
    const groupKeys = new Set();
    const ariaGroups = collectElementsAcrossRoots(document, '[role="radiogroup"], [role="group"]');

    function addChoiceGroup(root, nativeType) {
      const groupKey = selectorFor(root) + '|' + nativeType;
      if (groupKeys.has(groupKey)) {
        return false;
      }

      const field = buildChoiceGroupField(root, nativeType);
      if (!field) {
        return false;
      }

      groupKeys.add(groupKey);
      fields.push(field);
      seen.add(selectorFor(root));
      choiceInputsIn(root, nativeType).forEach(choice => seen.add(selectorFor(choice)));
      return true;
    }

    function addAriaChoiceGroup(root, choiceRole) {
      const groupKey = selectorFor(root) + '|aria|' + choiceRole;
      if (groupKeys.has(groupKey)) {
        return false;
      }

      const field = buildAriaChoiceGroupField(root, choiceRole);
      if (!field) {
        return false;
      }

      groupKeys.add(groupKey);
      fields.push(field);
      seen.add(selectorFor(root));
      collectElementsAcrossRoots(root, '[role="' + choiceRole + '"]').forEach(choice => seen.add(selectorFor(choice)));
      return true;
    }

    ariaGroups.forEach(root => {
      if (!isVisible(root) || nonApplicationControlReason(root)) {
        return;
      }

      const role = normalize(root.getAttribute('role'));
      const nativeRadioCount = choiceInputsIn(root, 'radio').length;
      const nativeCheckboxCount = choiceInputsIn(root, 'checkbox').length;
      if (nativeRadioCount >= 2 || nativeCheckboxCount >= 2) {
        const nativeType = nativeRadioCount >= 2 ? 'radio' : 'checkbox';
        addChoiceGroup(root, nativeType);
        return;
      }

      const choiceRole = collectElementsAcrossRoots(root, '[role="radio"]').length > 0
        ? 'radio'
        : collectElementsAcrossRoots(root, '[role="checkbox"]').length > 0
          ? 'checkbox'
          : '';
      if (!choiceRole || role === 'group' && choiceRole !== 'checkbox') {
        return;
      }

      addAriaChoiceGroup(root, choiceRole);
    });

    const questionRoots = collectElementsAcrossRoots(document, [
      'sr-screening-question',
      'spl-form-element',
      '[id^="spl-form-element_"]',
      '[id^="question_"]',
      '[data-question]',
      '[class*="question"]',
      '[class*="field"]',
      'fieldset'
    ].join(', '));

    questionRoots.forEach(root => {
      if (!isVisible(root) || nonApplicationControlReason(root)) {
        return;
      }

      const nativeRadioCount = choiceInputsIn(root, 'radio').length;
      const nativeCheckboxCount = choiceInputsIn(root, 'checkbox').length;
      if (nativeRadioCount >= 2 || nativeCheckboxCount >= 2) {
        addChoiceGroup(root, nativeRadioCount >= 2 ? 'radio' : 'checkbox');
        return;
      }

      const ariaRadioCount = collectElementsAcrossRoots(root, '[role="radio"]').filter(isVisible).length;
      const ariaCheckboxCount = collectElementsAcrossRoots(root, '[role="checkbox"]').filter(isVisible).length;
      if (ariaRadioCount >= 2 || ariaCheckboxCount >= 2) {
        addAriaChoiceGroup(root, ariaRadioCount >= 2 ? 'radio' : 'checkbox');
      }
    });

    const inputs = collectElementsAcrossRoots(document, 'input[type="radio"], input[type="checkbox"]');

    inputs.forEach(input => {
      if (!isUsableChoiceInput(input)) {
        return;
      }

      const nativeType = normalize(input.type);
      const root = nearestChoiceGroupRoot(input);
      if (!root) {
        return;
      }

      addChoiceGroup(root, nativeType);
    });

    return fields;
  }

  function uniqueOptions(options) {
    const seen = new Set();
    const unique = options.filter(option => {
      const key = normalize(option.value) + '|' + normalize(option.label);
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    }).map((option, index) => {
      option.position = index;
      return option;
    });

    const limited = unique.slice(0, MAX_OPTIONS_PER_FIELD);
    limited.optionsTruncated = unique.length > MAX_OPTIONS_PER_FIELD;
    limited.totalOptionsCount = unique.length;
    return limited;
  }

  function wait(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
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

  function dispatchMouseEvent(element, type) {
    element.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  }

  function popupTriggerCandidates(element) {
    const candidates = [
      element,
      element.closest('[role="combobox"], [aria-haspopup], button, [role="button"]'),
      element.parentElement,
      element.parentElement ? element.parentElement.querySelector('[aria-haspopup], [role="combobox"], button, [role="button"]') : null
    ];

    return Array.from(new Set(candidates.filter(Boolean).filter(isVisible)));
  }

  function extractionTargetSummary(element) {
    if (!element) {
      return null;
    }

    return {
      selector: selectorFor(element),
      tagName: element.tagName ? element.tagName.toLowerCase() : '',
      id: element.id || '',
      role: element.getAttribute ? element.getAttribute('role') || '' : '',
      ariaHasPopup: element.getAttribute ? element.getAttribute('aria-haspopup') || '' : '',
      ariaExpanded: element.getAttribute ? element.getAttribute('aria-expanded') || '' : '',
      className: typeof element.className === 'string' ? element.className.slice(0, 160) : ''
    };
  }

  function runExtractionAction(element, action) {
    if (action.action === 'focus') {
      try {
        element.focus({ preventScroll: true });
      } catch (error) {
        element.focus();
      }
    }

    if (action.action === 'pointerdown') {
      dispatchPointerEvent(element, 'pointerdown');
    }

    if (action.action === 'mousedown') {
      dispatchMouseEvent(element, 'mousedown');
    }

    if (action.action === 'pointerup') {
      dispatchPointerEvent(element, 'pointerup');
    }

    if (action.action === 'mouseup') {
      dispatchMouseEvent(element, 'mouseup');
    }

    if (action.action === 'click') {
      dispatchMouseEvent(element, 'click');
    }

    if (action.action === 'keydown' && action.key) {
      dispatchKeyboardEvent(element, action.key);
    }
  }

  function optionActionWaitMs(action) {
    if (typeof action.delayMs === 'number') {
      return Math.max(action.delayMs, 0);
    }

    return DEFAULT_OPTION_ACTION_WAIT_MS;
  }

  function waitForOptions(readOptions, timeoutMs) {
    const immediateOptions = readOptions();
    if (immediateOptions.length > 0) {
      return Promise.resolve(immediateOptions);
    }

    return new Promise(resolve => {
      let settled = false;
      let interval = null;
      const finish = options => {
        if (settled) {
          return;
        }

        settled = true;
        if (observer) {
          observer.disconnect();
        }
        if (interval) {
          window.clearInterval(interval);
        }
        window.clearTimeout(timeout);
        resolve(options || []);
      };

      const poll = () => {
        const options = readOptions();
        if (options.length > 0) {
          finish(options);
        }
      };

      let observer = null;
      try {
        observer = new MutationObserver(poll);
        observer.observe(document.documentElement || document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['aria-expanded', 'aria-hidden', 'style', 'class']
        });
      } catch (error) {
        observer = null;
      }

      interval = window.setInterval(poll, 75);

      const timeout = window.setTimeout(() => finish(readOptions()), timeoutMs);
    });
  }

  async function runExtractionActionsUntilOptions(element, actionGroup, readOptions) {
    const rules = window.__fieldControlRules || {};
    const actions = rules.extractionActions && Array.isArray(rules.extractionActions[actionGroup])
      ? rules.extractionActions[actionGroup]
      : [];
    const targets = popupTriggerCandidates(element);
    const trace = {
      actionGroup,
      targetCount: targets.length,
      targets: targets.map(extractionTargetSummary).filter(Boolean),
      attempts: []
    };
    window.__lastOptionExtractionTrace = trace;

    for (let index = 0; index < actions.length; index++) {
      const action = actions[index];
      for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
        runExtractionAction(targets[targetIndex], action);
        const options = await waitForOptions(readOptions, optionActionWaitMs(action));
        trace.attempts.push({
          action: action.action,
          key: action.key || '',
          targetIndex,
          waitMs: optionActionWaitMs(action),
          optionCount: options.length,
          activeElement: extractionTargetSummary(document.activeElement),
          ariaExpanded: element.getAttribute('aria-expanded') || '',
          ariaActiveDescendant: element.getAttribute('aria-activedescendant') || ''
        });
        if (options.length > 0) {
          trace.result = 'options-found';
          return options;
        }
      }
    }

    const finalOptions = readOptions();
    trace.result = finalOptions.length > 0 ? 'final-read-options-found' : 'no-options';
    trace.finalOptionCount = finalOptions.length;
    return finalOptions;
  }

  async function waitForLateRenderedOptions(readOptions) {
    const options = readOptions();
    if (options.length > 0) {
      return options;
    }

    return waitForOptions(readOptions, MAX_ACTIVE_OPTION_FINAL_WAIT_MS);
  }

  function closePopup(element) {
    dispatchKeyboardEvent(element, 'Escape');
    element.blur();
  }

  function closeOpenPopups() {
    try {
      const targets = [
        window,
        document,
        document.activeElement,
        document.body,
        document.documentElement
      ].concat(Array.from(document.querySelectorAll('[aria-expanded="true"], [role="combobox"]')));

      Array.from(new Set(targets.filter(Boolean))).forEach(target => {
        dispatchKeyboardEvent(target, 'Escape');
        if (typeof target.blur === 'function') {
          target.blur();
        }
      });

      if (document.body) {
        dispatchMouseEvent(document.body, 'mousedown');
        dispatchMouseEvent(document.body, 'mouseup');
        dispatchMouseEvent(document.body, 'click');
      }

      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
    } catch (error) {
      // Best-effort cleanup only.
    }
  }

  function hasVisibleReactSelectOptionsFor(element) {
    return visibleReactSelectOptionsFor(element).length > 0;
  }

  function cleanupPopupsAsync(element) {
    closeOpenPopups();
    return new Promise(resolve => {
      window.setTimeout(closeOpenPopups, 50);
      window.setTimeout(() => {
        closeOpenPopups();
        if (!element || !hasVisibleReactSelectOptionsFor(element)) {
          resolve(true);
          return;
        }

        window.setTimeout(() => {
          closeOpenPopups();
          resolve(!hasVisibleReactSelectOptionsFor(element));
        }, 200);
      }, 150);
    });
  }

  function gridOptionFromElement(element) {
    const label = optionTextFor(element);
    if (!label) {
      return null;
    }

    return {
      value: element.getAttribute('data-value') || label,
      label,
      selector: selectorFor(element),
      selected: element.getAttribute('aria-selected') === 'true',
      position: 0
    };
  }

  const STRICT_OPTION_SELECTOR = [
    '[role="option"]',
    'option',
    '[role="menuitem"]',
    '[role="grid"] [role="row"]',
    '[role="grid"] [role="gridcell"]',
    '[role="listbox"] [data-value]',
    '[role="menu"] [data-value]',
    '[role="grid"] [data-value]',
    'spl-option',
    'spl-dropdown-option',
    'spl-autocomplete-option',
    '[class*="c-spl-option"]',
    '[class*="c-spl-dropdown-option"]',
    '[class*="c-spl-autocomplete-option"]'
  ].join(', ');

  const SCOPED_POPUP_OPTION_SELECTOR = [
    '[role="option"]',
    'option',
    '[role="menuitem"]',
    '[role="row"]',
    '[role="gridcell"]',
    '[data-value]',
    'li',
    'button',
    '[role="button"]',
    '[class*="option"]',
    '[class*="Option"]',
    '[class*="item"]',
    '[class*="Item"]',
    '[class*="result"]',
    '[class*="Result"]',
    '[class*="suggestion"]',
    '[class*="Suggestion"]',
    '[class*="c-spl-option"]',
    '[class*="c-spl-dropdown-option"]',
    '[class*="c-spl-autocomplete-option"]',
    'spl-option',
    'spl-dropdown-option',
    'spl-autocomplete-option',
    '[data-testid*="option"]',
    '[data-test-id*="option"]'
  ].join(', ');

  const FALLBACK_POPUP_CONTAINER_SELECTOR = [
    '[role="listbox"]',
    '[role="menu"]',
    '[role="grid"]',
    '[id^="menu-"]',
    '[id*="listbox"]',
    '[id*="dropdown"]',
    '[class*="listbox"]',
    '[class*="Listbox"]',
    '[class*="menu"]',
    '[class*="Menu"]',
    '[class*="dropdown"]',
    '[class*="Dropdown"]',
    '[class*="autocomplete"]',
    '[class*="Autocomplete"]',
    '[class*="suggestions"]',
    '[class*="Suggestions"]',
    '[class*="c-spl-dropdown"]',
    '[class*="c-spl-autocomplete"]',
    '[class*="c-spl-menu"]',
    'spl-dropdown',
    'spl-autocomplete',
    'spl-dropdown-search',
    '[class*="popover"]',
    '[class*="Popover"]'
  ].join(', ');

  function isInteractiveOptionCandidate(element) {
    if (!element || !isVisible(element)) {
      return false;
    }

    const text = optionTextFor(element);
    if (!isOptionText(text)) {
      return false;
    }

    const tag = element.tagName ? element.tagName.toLowerCase() : '';
    const role = normalize(element.getAttribute('role'));
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      return false;
    }

    return tag === 'option' ||
      tag === 'li' ||
      tag === 'button' ||
      role === 'option' ||
      role === 'menuitem' ||
      role === 'row' ||
      role === 'gridcell' ||
      role === 'button' ||
      tag === 'spl-option' ||
      tag === 'spl-dropdown-option' ||
      tag === 'spl-autocomplete-option' ||
      Boolean(element.getAttribute('data-value')) ||
      /(?:^|\s)(?:option|item|result|suggestion)(?:\s|$)/i.test(String(element.className || '')) ||
      /\bc-spl-(?:dropdown-)?option\b/i.test(String(element.className || '')) ||
      /\bc-spl-autocomplete-option\b/i.test(String(element.className || '')) ||
      /option/i.test(element.getAttribute('data-testid') || '') ||
      /option/i.test(element.getAttribute('data-test-id') || '');
  }

  function optionCandidateElementsFrom(root, allowScopedFallback) {
    if (!root) {
      return [];
    }

    const strict = collectElementsAcrossRoots(root, STRICT_OPTION_SELECTOR)
      .filter(isVisible)
      .filter(option => isOptionText(optionTextFor(option)));
    if (strict.length > 0 || !allowScopedFallback) {
      return strict;
    }

    return collectElementsAcrossRoots(root, SCOPED_POPUP_OPTION_SELECTOR)
      .filter(isInteractiveOptionCandidate)
      .filter(candidate => !collectElementsAcrossRoots(candidate, SCOPED_POPUP_OPTION_SELECTOR)
        .some(child => child !== candidate && isInteractiveOptionCandidate(child) && optionTextFor(candidate).includes(optionTextFor(child))));
  }

  function visibleListboxOptionsFrom(root) {
    if (!root) {
      return [];
    }

    return uniqueOptions(optionCandidateElementsFrom(root, true)
      .map(option => optionFromElement(option, selectorFor(option), option.getAttribute('aria-selected') === 'true'))
      .filter(Boolean));
  }

  function controlledPopupIds(element) {
    return [
      element.getAttribute('aria-controls'),
      element.getAttribute('aria-owns')
    ]
      .filter(Boolean)
      .join(' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  function elementRootById(element, id) {
    if (!id) {
      return null;
    }

    const root = element && element.getRootNode ? element.getRootNode() : document;
    try {
      if (root && typeof root.getElementById === 'function') {
        const rooted = root.getElementById(id);
        if (rooted) {
          return rooted;
        }
      }

      if (root && typeof root.querySelector === 'function') {
        const rooted = root.querySelector('#' + cssEscape(id));
        if (rooted) {
          return rooted;
        }
      }
    } catch (error) {
      // Fall through to the document lookup.
    }

    const acrossRoots = collectElementsAcrossRoots(document, '#' + cssEscape(id));
    return acrossRoots.length > 0 ? acrossRoots[0] : document.getElementById(id);
  }

  function associatedListboxRoots(element) {
    const roots = controlledPopupIds(element)
      .map(id => elementRootById(element, id))
      .filter(Boolean)
      .filter(root => isVisible(root) || optionCandidateElementsFrom(root, false).length > 0);

    const localRoot = composedClosest(element, '[role="combobox"], [aria-haspopup], .select, .select__control, .react-select__control, .form-field, .form-group');
    if (localRoot) {
      const localListbox = collectElementsAcrossRoots(localRoot, '[role="listbox"], [role="menu"], [role="grid"], [role="option"], [role="menuitem"], option, [data-value], spl-dropdown, spl-autocomplete, spl-option, spl-dropdown-option, spl-autocomplete-option, [class*="c-spl-dropdown"], [class*="c-spl-autocomplete"], [class*="c-spl-option"]')
        .find(isVisible);
      if (localListbox) {
        roots.push(localListbox.matches('[role="listbox"], [role="menu"], [role="grid"], spl-dropdown, spl-autocomplete, [class*="c-spl-dropdown"], [class*="c-spl-autocomplete"]') ? localListbox : localListbox.parentElement);
      }
    }

    return Array.from(new Set(roots.filter(Boolean)));
  }

  function visibleOptionKey(option) {
    return [
      optionTextFor(option),
      option.getAttribute('aria-label'),
      option.getAttribute('value'),
      option.getAttribute('data-value'),
      selectorFor(option)
    ].map(value => String(value || '').trim()).join('|');
  }

  function reactSelectOptionPrefixFor(element) {
    const id = element && element.id ? String(element.id).trim() : '';
    return id ? 'react-select-' + id + '-option-' : '';
  }

  function visibleReactSelectOptionsFor(element) {
    const prefix = reactSelectOptionPrefixFor(element);
    if (!prefix) {
      return [];
    }

    return uniqueOptions(collectElementsAcrossRoots(document, '[id^="' + cssEscape(prefix) + '"]')
      .filter(isVisible)
      .filter(option => isInteractiveOptionCandidate(option) || normalize(option.getAttribute('role')) === 'option')
      .map(option => optionFromElement(option, selectorFor(option), option.getAttribute('aria-selected') === 'true'))
      .filter(Boolean));
  }

  function visibleGlobalListboxOptions(excludedOptionKeys) {
    return uniqueOptions(collectElementsAcrossRoots(document, STRICT_OPTION_SELECTOR)
      .filter(isVisible)
      .filter(option => !excludedOptionKeys || !excludedOptionKeys.has(visibleOptionKey(option)))
      .map(option => optionFromElement(option, selectorFor(option), option.getAttribute('aria-selected') === 'true'))
      .filter(Boolean));
  }

  function visiblePopupContainersFor(element) {
    const roots = controlledPopupIds(element)
      .map(id => elementRootById(element, id))
      .filter(Boolean);

    roots.push.apply(roots, collectElementsAcrossRoots(document, FALLBACK_POPUP_CONTAINER_SELECTOR)
      .filter(isVisible)
      .filter(root => !nonApplicationControlReason(root)));

    return Array.from(new Set(roots.filter(Boolean)))
      .filter(root => {
        const rect = root.getBoundingClientRect();
        return rect.width >= 80 && rect.height >= 16;
      });
  }

  function fallbackPopupTextOptionsFor(element, excludedOptionKeys) {
    const roots = visiblePopupContainersFor(element);
    const candidates = [];

    roots.forEach(root => {
      const structured = optionCandidateElementsFrom(root, true);
      if (structured.length > 0) {
        candidates.push.apply(candidates, structured);
        return;
      }

      collectElementsAcrossRoots(root, '*')
        .filter(isVisible)
        .filter(candidate => {
          const tag = candidate.tagName ? candidate.tagName.toLowerCase() : '';
          if (['input', 'textarea', 'select', 'script', 'style', 'svg', 'path'].includes(tag)) {
            return false;
          }

          const text = optionTextFor(candidate);
          if (!isOptionText(text)) {
            return false;
          }

          const childWithSameText = Array.from(candidate.children || [])
            .some(child => isVisible(child) && optionTextFor(child) === text);
          return !childWithSameText;
        })
        .forEach(candidate => candidates.push(candidate));
    });

    return uniqueOptions(candidates
      .filter(option => !excludedOptionKeys || !excludedOptionKeys.has(visibleOptionKey(option)))
      .map(option => optionFromElement(option, selectorFor(option), option.getAttribute('aria-selected') === 'true'))
        .filter(Boolean));
  }

  function actionButtonText(element) {
    if (!element) {
      return '';
    }

    const value = element.getAttribute('value') || element.getAttribute('aria-label') || element.getAttribute('title') || '';
    const text = compactText([element.textContent, value].filter(Boolean).join(' '));
    return clippedLabel(text, 120);
  }

  function actionKindForButton(element, text) {
    const haystack = normalize([
      text,
      element.getAttribute('id'),
      element.getAttribute('name'),
      element.getAttribute('class'),
      element.getAttribute('data-testid'),
      element.getAttribute('data-test-id'),
      element.getAttribute('aria-haspopup')
    ].filter(Boolean).join(' '));
    const nativeType = normalize(element.getAttribute('type'));
    const role = normalize(element.getAttribute('role'));
    const ariaHasPopup = normalize(element.getAttribute('aria-haspopup'));

    if (role === 'combobox' || ariaHasPopup) {
      return 'popupTrigger';
    }

    if (nativeType === 'submit' || /\b(submit|apply|send application|complete application)\b/.test(haystack)) {
      return 'submit';
    }

    if (/\b(next|continue|save and continue|proceed|review)\b/.test(haystack)) {
      return 'next';
    }

    if (/\b(back|previous|return)\b/.test(haystack)) {
      return 'back';
    }

    if (/\b(upload|attach|resume|cv|choose file|browse)\b/.test(haystack)) {
      return 'upload';
    }

    if (/\b(search|lookup|find|select)\b/.test(haystack)) {
      return 'lookup';
    }

    if (/\b(cancel|close|dismiss)\b/.test(haystack)) {
      return 'cancel';
    }

    if (/\b(delete|remove|clear)\b/.test(haystack)) {
      return 'destructive';
    }

    return 'action';
  }

  function scanActionButtons() {
    const selector = [
      'button',
      'input[type="button"]',
      'input[type="submit"]',
      'input[type="reset"]',
      '[role="button"]',
      'a[role="button"]',
      '[aria-haspopup]:not(input):not(select):not(textarea)'
    ].join(', ');
    const seen = new Set();

    return collectElementsAcrossRoots(document, selector)
      .filter(element => isVisible(element) && !nonApplicationControlReason(element))
      .map(element => {
        const elementSelector = selectorFor(element);
        if (seen.has(elementSelector)) {
          return null;
        }

        seen.add(elementSelector);
        const text = actionButtonText(element);
        const contextRoot = requirementContextRoot(element) || composedClosest(element, 'form, [role="form"], main, section, article');
        return {
          selector: elementSelector,
          label: text,
          actionKind: actionKindForButton(element, text),
          tagName: element.tagName ? element.tagName.toLowerCase() : '',
          nativeType: normalize(element.getAttribute('type')),
          role: normalize(element.getAttribute('role')),
          ariaHasPopup: normalize(element.getAttribute('aria-haspopup')),
          ariaExpanded: normalize(element.getAttribute('aria-expanded')),
          disabled: element.disabled || element.getAttribute('aria-disabled') === 'true' ? 'true' : 'false',
          contextSelector: contextRoot ? selectorFor(contextRoot) : ''
        };
      })
      .filter(Boolean)
      .slice(0, 120);
  }

  const optionSourceHandlers = {
    nativeSelect: function (element) {
      if (element.tagName.toLowerCase() !== 'select') {
        return [];
      }

      return uniqueOptions(Array.from(element.options)
        .map(option => optionFromElement(option, '', option.selected))
        .filter(Boolean));
    },

    radioGroup: function (element) {
      const radios = normalize(element.type) === 'radio' && element.name
        ? Array.from(document.querySelectorAll('input[type="radio"][name="' + cssEscape(element.name) + '"]'))
        : choiceInputsIn(element, 'radio');

      if (radios.length === 0) {
        return [];
      }

      return uniqueOptions(radios
        .map(radio => {
          const label = choiceInputLabel(radio);
          return {
            value: radio.value || label,
            label,
            selector: selectorFor(radio),
            source: 'dom',
            fillMethod: 'clickSelector',
            selected: radio.checked,
            position: 0
          };
        })
        .filter(option => option.value || option.label));
    },

    checkboxGroup: function (element) {
      const checkboxes = normalize(element.type) === 'checkbox' && element.name
        ? Array.from(document.querySelectorAll('input[type="checkbox"][name="' + cssEscape(element.name) + '"]'))
        : choiceInputsIn(element, 'checkbox');

      if (checkboxes.length === 0) {
        return [];
      }

      return uniqueOptions(checkboxes
        .map(checkbox => {
          const label = choiceInputLabel(checkbox);
          return {
            value: checkbox.value || label,
            label,
            selector: selectorFor(checkbox),
            source: 'dom',
            fillMethod: 'clickSelector',
            selected: checkbox.checked,
            position: 0
          };
        })
        .filter(option => option.value || option.label));
    },

    datalist: function (element) {
      const listId = element.getAttribute('list');
      const list = listId ? elementRootById(element, listId) : null;
      if (!list) {
        return [];
      }

      return uniqueOptions(Array.from(list.querySelectorAll('option'))
        .map(option => optionFromElement(option, '', false))
        .filter(Boolean));
    },

    ariaControlledListbox: function (element) {
      const listIds = [
        element.getAttribute('aria-controls'),
        element.getAttribute('aria-owns')
      ]
        .filter(Boolean)
        .join(' ')
        .split(/\s+/)
        .filter(Boolean);

      return uniqueOptions(listIds
        .map(id => elementRootById(element, id))
        .filter(Boolean)
        .flatMap(list => optionCandidateElementsFrom(list, true))
        .map(option => optionFromElement(option, selectorFor(option), option.getAttribute('aria-selected') === 'true'))
        .filter(Boolean));
    },

    visibleListbox: function (element) {
      const reactSelectOptions = visibleReactSelectOptionsFor(element);
      if (reactSelectOptions.length > 0) {
        return reactSelectOptions;
      }

      if (reactSelectOptionPrefixFor(element)) {
        return [];
      }

      return uniqueOptions(associatedListboxRoots(element)
        .flatMap(visibleListboxOptionsFrom));
    },

    ariaControlledGrid: function (element) {
      const gridIds = [
        element.getAttribute('aria-controls'),
        element.getAttribute('aria-owns')
      ]
        .filter(Boolean)
        .join(' ')
        .split(/\s+/)
        .filter(Boolean);

      return uniqueOptions(gridIds
        .map(id => elementRootById(element, id))
        .filter(Boolean)
        .flatMap(grid => optionCandidateElementsFrom(grid, true))
        .filter(isVisible)
        .map(gridOptionFromElement)
        .filter(Boolean));
    },

    activePopupListbox: async function (element, source) {
      const existingVisibleOptionKeys = new Set(collectElementsAcrossRoots(document, STRICT_OPTION_SELECTOR)
        .filter(isVisible)
        .map(visibleOptionKey));

      const readOwnedOptions = () => {
        const reactSelectOptions = visibleReactSelectOptionsFor(element);
        if (reactSelectOptions.length > 0) {
          return reactSelectOptions;
        }

        if (reactSelectOptionPrefixFor(element)) {
          return [];
        }

        const associatedOptions = optionSourceHandlers.visibleListbox(element);
        if (associatedOptions.length > 0) {
          return associatedOptions;
        }

        const globalOptions = visibleGlobalListboxOptions(existingVisibleOptionKeys);
        return globalOptions.length > 0
          ? globalOptions
          : fallbackPopupTextOptionsFor(element, existingVisibleOptionKeys);
      };

      let options = await runExtractionActionsUntilOptions(element, source.actionGroup, readOwnedOptions);
      options = options.length > 0 ? options : await waitForLateRenderedOptions(readOwnedOptions);
      closePopup(element);
      return options;
    },

    activePopupGrid: async function (element, source) {
      const readGridOptions = () => uniqueOptions(collectElementsAcrossRoots(document, '[role="grid"]')
        .flatMap(grid => optionCandidateElementsFrom(grid, true))
        .filter(isVisible)
        .map(gridOptionFromElement)
        .filter(Boolean));

      let options = await runExtractionActionsUntilOptions(element, source.actionGroup, readGridOptions);
      options = options.length > 0 ? options : await waitForLateRenderedOptions(readGridOptions);
      closePopup(element);
      return options;
    }
  };

  async function optionsFor(element, controlType, options) {
    const rules = window.__fieldControlRules || {};
    const sources = rules.optionSources && Array.isArray(rules.optionSources[controlType])
      ? rules.optionSources[controlType]
      : [];
    const allowActionRequiredSources = Boolean(options && options.allowActionRequiredSources);
    const attemptedSources = [];
    const skippedSources = [];
    const errors = [];

    for (let index = 0; index < sources.length; index++) {
      const source = sources[index];
      if (source.requiresAction && !allowActionRequiredSources) {
        skippedSources.push(source.source);
        continue;
      }

      const handler = optionSourceHandlers[source.source];
      if (!handler) {
        continue;
      }

      attemptedSources.push(source.source);

      let options = [];
      try {
        options = await handler(element, source);
      } catch (error) {
        errors.push(source.source + ': ' + (error && error.message ? error.message : String(error)));
        continue;
      }

      if (options.length > 0) {
        return {
          options,
          optionsTruncated: Boolean(options.optionsTruncated),
          optionsScanReason: source.reason || 'Options found in page DOM.',
          optionExtractionMode: allowActionRequiredSources ? 'active-open-only' : 'passive',
          attemptedSources,
          skippedSources,
          errors
        };
      }
    }

    return {
      options: [],
      optionsTruncated: false,
      optionExtractionMode: allowActionRequiredSources ? 'active-open-only' : 'passive',
      attemptedSources,
      skippedSources,
      errors,
      optionsScanReason: sources.length > 0
        ? errors.length > 0
          ? 'No options found. Extraction errors: ' + errors.join('; ')
          : attemptedSources.length > 0
            ? 'No options found after trying sources: ' + attemptedSources.join(', ') + '.'
            : skippedSources.length > 0
              ? 'No passive options found; active sources skipped during scan: ' + skippedSources.join(', ') + '.'
              : 'No option source available for this control.'
        : ''
    };
  }

  async function findFields() {
    const fields = [];
    const rules = window.__fieldControlRules || {};
    const selectors = Array.isArray(rules.fieldSelectors)
      ? rules.fieldSelectors
      : [
        'input:not([type="hidden"]):not([type="file"]):not([id*="recaptcha"]):not([name*="recaptcha"]):not([id*="hcaptcha"]):not([name*="hcaptcha"])',
        'textarea:not([id*="recaptcha"]):not([name*="recaptcha"]):not([id*="hcaptcha"]):not([name*="hcaptcha"])',
        'select',
        '[role="combobox"]',
        '[role="textbox"]',
        '[role="searchbox"]',
        '[aria-haspopup="listbox"]'
    ];
    const seen = new Set();
    const seenFileContainers = new Set();

    window.__scanDebug = Object.assign(window.__scanDebug || {}, {
      pageUrl: window.location.href,
      pageTitle: document.title || '',
      readyState: document.readyState,
      selectors: selectors,
      selectorCounts: {},
      fieldCount: 0,
      processedFieldCount: 0,
      activeField: null,
      actionButtons: [],
      actionButtonCount: 0,
      optionExtractions: [],
      shadowCapture: typeof domShared.shadowCaptureDiagnostics === 'function'
        ? domShared.shadowCaptureDiagnostics()
        : null,
      errors: Array.isArray(window.__scanDebug?.errors) ? window.__scanDebug.errors : []
    });

    const capability = window.__capabilityProbe && typeof window.__capabilityProbe.probeCapabilities === 'function'
      ? window.__capabilityProbe.probeCapabilities()
      : {
        scannable: true,
        status: 'unknown',
        reason: null,
        message: 'Page capability probe is not available.',
        evidence: {}
      };
    window.__scanCapability = capability;
    window.__scanDebug.capability = capability;
    window.__scanDebug.actionButtons = scanActionButtons();
    window.__scanDebug.actionButtonCount = window.__scanDebug.actionButtons.length;

    buildChoiceGroupFields(seen).forEach(field => fields.push(field));

    for (let selectorIndex = 0; selectorIndex < selectors.length; selectorIndex++) {
      const selector = selectors[selectorIndex];
      const elements = collectElementsAcrossRoots(document, selector);
      window.__scanDebug.selectorCounts[selector] = elements.length;

      for (let elementIndex = 0; elementIndex < elements.length; elementIndex++) {
        const element = elements[elementIndex];
        const fieldSelector = selectorFor(element);
        if (seen.has(fieldSelector)) {
          continue;
        }
        seen.add(fieldSelector);

        const nonApplicationReason = nonApplicationControlReason(element);
        if (nonApplicationReason) {
          window.__scanDebug.skippedNonApplicationControls = Array.isArray(window.__scanDebug.skippedNonApplicationControls)
            ? window.__scanDebug.skippedNonApplicationControls
            : [];
          window.__scanDebug.skippedNonApplicationControls.push({
            selector: fieldSelector,
            reason: nonApplicationReason
          });
          continue;
        }

        const fieldLabel = labelFor(element);
        const controlInfo = controlInfoFor(element, fieldLabel);
        if (!fieldLabel && controlInfo.controlType === 'checkboxBoolean') {
          window.__scanDebug.skippedUnlabeledCheckboxes = Array.isArray(window.__scanDebug.skippedUnlabeledCheckboxes)
            ? window.__scanDebug.skippedUnlabeledCheckboxes
            : [];
          window.__scanDebug.skippedUnlabeledCheckboxes.push({
            selector: fieldSelector,
            reason: 'Standalone checkbox has no trustworthy label.'
          });
          continue;
        }

        if (shouldSkipActionOnlyPopupButton(element, controlInfo)) {
          window.__scanDebug.skippedActionOnlyPopupButtons = Array.isArray(window.__scanDebug.skippedActionOnlyPopupButtons)
            ? window.__scanDebug.skippedActionOnlyPopupButtons
            : [];
          window.__scanDebug.skippedActionOnlyPopupButtons.push({
            selector: fieldSelector,
            label: fieldLabel,
            controlType: controlInfo.controlType,
            ariaHasPopup: controlInfo.facts.ariaHasPopup
          });
          continue;
        }

        const owningChoiceControl = shouldSkipNestedChoiceTextInput(element, controlInfo)
          ? owningChoiceControlForNestedInput(element)
          : null;
        if (owningChoiceControl) {
          window.__scanDebug.skippedNestedChoiceInputs = Array.isArray(window.__scanDebug.skippedNestedChoiceInputs)
            ? window.__scanDebug.skippedNestedChoiceInputs
            : [];
          window.__scanDebug.skippedNestedChoiceInputs.push({
            selector: fieldSelector,
            label: fieldLabel,
            owningChoiceSelector: selectorFor(owningChoiceControl)
          });
          continue;
        }

        if (controlInfo.controlType === 'file') {
          const fileContainerKey = fileFieldContainerKey(element, fieldLabel);
          const fileDedupKey = fileContainerKey || (fieldLabel ? 'label:' + normalize(fieldLabel) : '');
          if (fileDedupKey && seenFileContainers.has(fileDedupKey)) {
            window.__scanDebug.skippedDuplicateFileFields = Array.isArray(window.__scanDebug.skippedDuplicateFileFields)
              ? window.__scanDebug.skippedDuplicateFileFields
              : [];
            window.__scanDebug.skippedDuplicateFileFields.push({
              selector: fieldSelector,
              label: fieldLabel,
              dedupKey: fileDedupKey
            });
            continue;
          }

          if (fileDedupKey) {
            seenFileContainers.add(fileDedupKey);
          }
        }

        if (!fieldLabel && (controlInfo.controlType === 'checkboxBoolean' || controlInfo.controlType === 'file')) {
          window.__scanDebug.labelDiagnostics = Array.isArray(window.__scanDebug.labelDiagnostics)
            ? window.__scanDebug.labelDiagnostics
            : [];
          window.__scanDebug.labelDiagnostics.push({
            selector: fieldSelector,
            controlType: controlInfo.controlType,
            nativeInputType: controlInfo.facts.nativeType,
            candidates: labelDebugCandidatesFor(element)
          });
        }
        window.__scanDebug.activeField = {
          selector: fieldSelector,
          label: fieldLabel,
          controlType: controlInfo.controlType,
          optionSourceGroup: controlInfo.optionSourceGroup
        };
        const optionInfo = await optionsFor(element, controlInfo.controlType, { allowActionRequiredSources: false });
        const sensitiveInfo = sensitiveFieldInfo(element, fieldLabel);
        window.__scanDebug.processedFieldCount++;
        window.__scanDebug.optionExtractions.push({
          selector: fieldSelector,
          controlType: controlInfo.controlType,
          mode: optionInfo.optionExtractionMode,
          attemptedSources: optionInfo.attemptedSources || [],
          skippedSources: optionInfo.skippedSources || [],
          errors: optionInfo.errors || [],
          optionsCount: optionInfo.options.length,
          optionsTruncated: optionInfo.optionsTruncated,
          reason: optionInfo.optionsScanReason
        });

        fields.push({
          selector: fieldSelector,
          label: fieldLabel,
          inputType: controlInfo.controlType,
          fieldCategory: sensitiveInfo.fieldCategory,
          fieldSubCategory: sensitiveInfo.fieldSubCategory,
          fieldCategoryReason: sensitiveInfo.fieldCategoryReason,
          controlType: controlInfo.controlType,
          controlFamily: controlInfo.controlFamily,
          selectionMode: controlInfo.selectionMode,
          selectionModeReason: controlInfo.selectionModeReason,
          nativeInputType: controlInfo.facts.nativeType,
          tagName: controlInfo.facts.tagName,
          role: controlInfo.facts.role,
          ariaHasPopup: controlInfo.facts.ariaHasPopup,
          ariaExpanded: controlInfo.facts.ariaExpanded,
          ariaControls: controlInfo.facts.ariaControls,
          ariaOwns: controlInfo.facts.ariaOwns,
          ariaActiveDescendant: controlInfo.facts.ariaActiveDescendant,
          ariaAutocomplete: controlInfo.facts.ariaAutocomplete,
          ariaMultiselectable: controlInfo.facts.ariaMultiselectable,
          autocomplete: controlInfo.facts.autocomplete,
          list: controlInfo.facts.list,
          required: controlInfo.facts.required,
          optional: controlInfo.facts.optional,
          disabled: controlInfo.facts.disabled,
          readonly: controlInfo.facts.readonly,
          multiple: controlInfo.facts.multiple,
          scanReason: controlInfo.scanReason,
          requiresCapturedOption: controlInfo.requiresCapturedOption,
          valuePolicy: controlInfo.valuePolicy,
          fillStrategy: controlInfo.fillStrategy,
          optionSourceGroup: controlInfo.optionSourceGroup,
          extractionActionGroup: controlInfo.extractionActionGroup,
          options: optionInfo.options,
          optionsTruncated: optionInfo.optionsTruncated,
          optionsScanReason: optionInfo.optionsScanReason,
          sourceUrl: window.location.href
        });
      }
    }

    window.__scanDebug.fieldCount = fields.length;
    window.__scanDebug.detectedSelectors = fields.map(field => field.selector);
    window.__scanDebug.activeField = null;

    if (window.__capabilityProbe && typeof window.__capabilityProbe.probeCapabilities === 'function') {
      const finalCapability = window.__capabilityProbe.probeCapabilities();
      window.__scanCapability = finalCapability;
      window.__scanDebug.capability = finalCapability;
    }

    return fields;
  }

  window.__scanDebug = {
    pageUrl: window.location.href,
    pageTitle: document.title || '',
    readyState: document.readyState,
    selectorCounts: {},
    fieldCount: 0,
    detectedSelectors: [],
    errors: [],
    lastError: null
  };

  window.addEventListener('error', function (event) {
    const message = event && event.message ? String(event.message) : 'Unknown browser error';
    const source = event && event.filename ? String(event.filename) : 'unknown';
    const line = event && event.lineno ? String(event.lineno) : 'unknown';
    window.__scanDebug.errors.push({ message, source, line, stack: event && event.error ? String(event.error.stack || event.error) : '' });
    window.__scanDebug.lastError = { message, source, line };
  });

  window.addEventListener('unhandledrejection', function (event) {
    const reason = event && event.reason ? String(event.reason && event.reason.stack ? event.reason.stack : event.reason) : 'Unhandled promise rejection';
    window.__scanDebug.errors.push({ message: reason, source: 'unhandledrejection', line: 'n/a' });
    window.__scanDebug.lastError = { message: reason, source: 'unhandledrejection', line: 'n/a' };
  });

  const originalConsoleError = console.error.bind(console);
  console.error = function () {
    const message = Array.from(arguments).map(arg => String(arg)).join(' ');
    window.__scanDebug.errors.push({ message, source: 'console.error', line: 'n/a' });
    window.__scanDebug.lastError = { message, source: 'console.error', line: 'n/a' };
    return originalConsoleError.apply(console, arguments);
  };

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

  window.__classifyPage = function () {
    return classifyPage();
  };

  window.__scanFields = function () {
    try {
      return findFields();
    } catch (error) {
      const message = error && error.stack ? String(error.stack) : String(error);
      window.__scanDebug = Object.assign(window.__scanDebug || {}, {
        errors: Array.isArray(window.__scanDebug?.errors) ? window.__scanDebug.errors : [],
        lastError: { message, source: 'scan', line: 'n/a' }
      });
      window.__scanDebug.errors.push({ message, source: 'scan', line: 'n/a' });
      return [];
    }
  };

  window.__extractOptionsForField = async function (selector) {
    const startedAt = Date.now();
    const appendTargetedOptionDebug = entry => {
      window.__scanDebug = Object.assign(window.__scanDebug || {}, {
        targetedOptionExtractions: Array.isArray(window.__scanDebug?.targetedOptionExtractions)
          ? window.__scanDebug.targetedOptionExtractions
          : []
      });
      window.__scanDebug.targetedOptionExtractions.push(Object.assign({
        selector,
        durationMs: Date.now() - startedAt
      }, entry || {}));
    };

    try {
      closeOpenPopups();
      const element = resolveScopedSelector(selector);
      if (!element) {
        appendTargetedOptionDebug({
          ok: false,
          optionCount: 0,
          message: 'Element not found.'
        });
        return {
          ok: false,
          selector,
          options: [],
          optionsTruncated: false,
          message: 'Element not found.'
        };
      }

      const fieldLabel = labelFor(element);
      const controlInfo = controlInfoFor(element, fieldLabel);
      const optionInfo = await optionsFor(element, controlInfo.controlType, { allowActionRequiredSources: true });
      const popupClosed = await cleanupPopupsAsync(element);
      appendTargetedOptionDebug({
        ok: optionInfo.options.length > 0,
        label: fieldLabel,
        controlType: controlInfo.controlType,
        optionCount: optionInfo.options.length,
        optionsTruncated: optionInfo.optionsTruncated,
        message: optionInfo.optionsScanReason || 'Options extracted.',
        mode: optionInfo.optionExtractionMode,
        attemptedSources: optionInfo.attemptedSources || [],
        skippedSources: optionInfo.skippedSources || [],
        errors: optionInfo.errors || [],
        trace: window.__lastOptionExtractionTrace || null,
        popupClosed
      });

      return {
        ok: optionInfo.options.length > 0,
        selector,
        controlType: controlInfo.controlType,
        options: optionInfo.options,
        optionsTruncated: optionInfo.optionsTruncated,
        message: optionInfo.optionsScanReason || 'Options extracted.',
        popupClosed
      };
    } catch (error) {
      await cleanupPopupsAsync(null);
      const message = error && error.stack ? String(error.stack) : String(error);
      appendTargetedOptionDebug({
        ok: false,
        optionCount: 0,
        message,
        trace: window.__lastOptionExtractionTrace || null
      });
      window.__scanDebug = Object.assign(window.__scanDebug || {}, {
        errors: Array.isArray(window.__scanDebug?.errors) ? window.__scanDebug.errors : []
      });
      window.__scanDebug.errors.push({ message, source: 'extractOptionsForField', line: 'n/a' });
      return {
        ok: false,
        selector,
        options: [],
        optionsTruncated: false,
        message
      };
    }
  };

  window.__closeOpenOptionPopups = function () {
    return cleanupPopupsAsync(null);
  };
})();
