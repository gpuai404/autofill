(function () {
  const MAX_LABEL_LENGTH = 180;
  const MAX_CONTEXT_LABEL_LENGTH = 260;
  const domShared = window.__domShared || {};
  const shadowRootFor = typeof domShared.shadowRootFor === 'function'
    ? domShared.shadowRootFor
    : element => element && element.shadowRoot ? element.shadowRoot : null;
  const traversal = window.__genericDomTraversal || {};
  const composedParentElement = typeof traversal.composedParentElement === 'function'
    ? traversal.composedParentElement
    : element => element && element.parentElement ? element.parentElement : null;
  const composedClosest = typeof traversal.composedClosest === 'function'
    ? traversal.composedClosest
    : () => null;

  const textUtils = window.__textUtils;
  const selectorResolver = window.__selectorResolver || {};
  if (typeof textUtils?.humanize !== 'function' || typeof textUtils?.compactText !== 'function' || typeof textUtils?.clipText !== 'function') {
    throw new Error('label-discovery.js requires shared text utilities.');
  }

  const humanize = textUtils.humanize;
  const compactText = textUtils.compactText;
  const clipText = textUtils.clipText;
  const selectorFor = typeof selectorResolver.selectorFor === 'function'
    ? selectorResolver.selectorFor
    : () => '';
  const normalize = typeof textUtils.normalize === 'function'
    ? textUtils.normalize
    : value => String(value || '').toLowerCase();
  function clippedLabel(value, maxLength) {
    const text = humanize(value);
    return clipText(text, maxLength);
  }
  function isGenericPlaceholderText(value) {
    const text = humanize(value).toLowerCase();
    if (!text) return true;
    const patterns = [/^select(?:\.\.\.)?$/, /^choose(?:\.\.\.)?$/, /^pick(?: one)?$/, /^please select(?:\.\.\.)?$/, /^please choose(?:\.\.\.)?$/, /^make a selection$/, /^select one$/, /^choose one$/, /^select an option$/, /^choose an option$/, /^\.\.\.$/, /^--\s*(select|choose)\s*--$/];
    return patterns.some(pattern => pattern.test(text));
  }
  function isValidationMessageText(value) {
    const text = humanize(value).toLowerCase();
    if (!text) return false;
    const patterns = [/^value is required\.?$/, /^this field is required\.?$/, /^field is required\.?$/, /^required field\.?$/, /^required\.?$/, /^please enter a value\.?$/, /^please select a value\.?$/, /^please make a selection\.?$/, /^invalid value\.?$/];
    return patterns.some(pattern => pattern.test(text));
  }
  function isLiveMessageElement(element) {
    if (!element || typeof element.getAttribute !== 'function') {
      return false;
    }

    const role = normalize(element.getAttribute('role'));
    const ariaLive = normalize(element.getAttribute('aria-live'));
    const className = normalize(element.getAttribute('class'));
    const dataTestId = normalize(element.getAttribute('data-testid'));
    const dataTestIdAlt = normalize(element.getAttribute('data-test-id'));

    return role === 'alert' ||
      role === 'status' ||
      Boolean(ariaLive) ||
      className.includes('error') ||
      className.includes('invalid') ||
      className.includes('loading') ||
      dataTestId.includes('error') ||
      dataTestId.includes('loading') ||
      dataTestIdAlt.includes('error') ||
      dataTestIdAlt.includes('loading');
  }
  function isLikelyFieldMessageText(value) {
    const text = humanize(value).toLowerCase();
    if (!text) {
      return false;
    }

    return isValidationMessageText(text) ||
      /\b(no .* found|not found|invalid|error|failed|unable|try again|try entering|loading|please wait)\b/.test(text);
  }
  function directNonMessageTextFor(element) {
    if (!element) {
      return '';
    }

    const direct = directTextFor(element);
    if (isUsableLabelText(direct) && !isLikelyFieldMessageText(direct)) {
      return direct;
    }

    const chunks = visibleTextChunks(element, null).filter(chunk => !isLikelyFieldMessageText(chunk));
    const text = compactText(chunks.join(' '));
    return isUsableLabelText(text) ? text : '';
  }
  function isMeaningfulLabelText(value) {
    const text = humanize(value);
    return Boolean(text) && text.length <= MAX_CONTEXT_LABEL_LENGTH && !isValidationMessageText(text) && !isGenericPlaceholderText(text) && !/^(?:select|choose|pick)\b/i.test(text);
  }
  const isVisible = typeof domShared.isVisible === 'function' ? domShared.isVisible : function (element) {
    if (!element || typeof window.getComputedStyle !== 'function' || typeof element.getBoundingClientRect !== 'function') return true;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value).replace(/["\\]/g, '\\$&');
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
        return;
      }

      const elementNode = node.nodeType === Node.ELEMENT_NODE ? node : null;
      if (elementNode) {
        const tag = elementNode.tagName ? elementNode.tagName.toLowerCase() : '';
        if (tag === 'script' || tag === 'style' || tag === 'noscript' || isLiveMessageElement(elementNode)) {
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


  function containsFieldControl(element) {
    try {
      return Boolean(element.querySelector('input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"], [role="searchbox"], [role="combobox"], [aria-haspopup]'));
    } catch (error) {
      return false;
    }
  }

  function labelTextFromNearbyElement(element) {
    if (!element || !isVisible(element) || isLiveMessageElement(element)) {
      return '';
    }

    const direct = directTextFor(element);
    if (isUsableLabelText(direct)) {
      return direct;
    }

    const labelCandidate = element.matches && element.matches('label, legend, th, dt, [data-label], [data-testid*="label"], [data-test-id*="label"], [class*="label"], [class*="question"]')
      ? element
      : element.querySelector('label, legend, th, dt, [data-label], [data-testid*="label"], [data-test-id*="label"], [class*="label"], [class*="question"], p, span');
    if (labelCandidate && !isLiveMessageElement(labelCandidate)) {
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
      if (tag === 'script' || tag === 'style' || elementNode.getAttribute('aria-hidden') === 'true' || isLiveMessageElement(elementNode)) {
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
      if (elementNode.getAttribute('aria-hidden') === 'true' || isLiveMessageElement(elementNode)) {
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

  function nativeSelectOptionTexts(element) {
    try {
      return Array.from(element.options || [])
        .map(option => compactText(option.textContent || option.label || option.value))
        .filter(isUsableLabelText)
        .slice(0, 25);
    } catch (error) {
      return [];
    }
  }

  function isPollutedNativeSelectLabel(element, text) {
    if (!element || !element.tagName || element.tagName.toLowerCase() !== 'select') {
      return false;
    }

    const normalizedText = normalize(text);
    if (!normalizedText) {
      return false;
    }

    const optionTexts = nativeSelectOptionTexts(element)
      .map(normalize)
      .filter(Boolean);
    const matchedOptions = optionTexts.filter(optionText => normalizedText.includes(optionText));
    return matchedOptions.length >= 2;
  }

  function addCandidate(candidates, element, text) {
    if (!isUsableLabelText(text)) {
      return;
    }

    if (isPollutedNativeSelectLabel(element, text)) {
      return;
    }

    candidates.push(text);
  }

  function uniqueTexts(values) {
    const seen = new Set();
    return values.filter(value => {
      const normalizedValue = normalize(value);
      if (!normalizedValue || seen.has(normalizedValue)) {
        return false;
      }

      seen.add(normalizedValue);
      return true;
    });
  }

  function fieldMessageFor(element, labelText) {
    if (!element) {
      return '';
    }

    const root = requirementContextRoot(element);
    const messages = [];
    const associatedLabels = Array.from(element.labels || []);
    const describedByText = textFromDescribedBy(element);
    if (describedByText && isLikelyFieldMessageText(describedByText)) {
      messages.push(describedByText);
    }

    associatedLabels.forEach(labelElement => {
      if (!labelElement || typeof labelElement.querySelectorAll !== 'function') {
        const labelTextContent = compactText(labelElement?.textContent);
        if (labelTextContent && labelTextContent !== labelText && isLikelyFieldMessageText(labelTextContent)) {
          messages.push(labelTextContent);
        }
        return;
      }

      Array.from(labelElement.querySelectorAll('*'))
        .filter(isLiveMessageElement)
        .map(candidate => compactText(candidate.textContent))
        .filter(text => text && normalize(text) !== normalize(labelText))
        .forEach(text => messages.push(text));

      Array.from(labelElement.querySelectorAll('span, div, p, small, strong, em'))
        .map(candidate => compactText(candidate.textContent))
        .filter(text => text && normalize(text) !== normalize(labelText) && isLikelyFieldMessageText(text))
        .forEach(text => messages.push(text));
    });

    if (root && root.querySelectorAll) {
      Array.from(root.querySelectorAll('[role="alert"], [role="status"], [aria-live], [class*="error"], [class*="invalid"], [class*="loading"], [data-testid*="error"], [data-testid*="loading"], [data-test-id*="error"], [data-test-id*="loading"]'))
        .map(candidate => compactText(candidate.textContent))
        .filter(text => text && normalize(text) !== normalize(labelText) && isLikelyFieldMessageText(text))
        .forEach(text => messages.push(text));
    }

    const uniqueMessages = uniqueTexts(messages);
    return uniqueMessages.length > 0
      ? clipText(uniqueMessages.join(' '), MAX_LABEL_LENGTH)
      : '';
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

      const questionRoot = composedClosest(current, '.field, .application-question, .question, [data-question], [data-label], [data-testid*="label"], [aria-labelledby]');
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
      if (!candidate || isLiveMessageElement(candidate)) {
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

    const visibleChunks = visibleTextChunks(root, null);
    const text = compactText(visibleChunks.join(' '));
    return isUsableLabelText(text) ? text : '';
  }

  function labelEvidenceFor(element) {
    const evidence = [];
    function consider(text, source, confidence) {
      const accepted = [];
      addCandidate(accepted, element, text);
      if (accepted.length > 0) evidence.push({ text: clippedLabel(accepted[0], MAX_LABEL_LENGTH), source, confidence });
    }

    if (element.labels && element.labels.length) {
      consider(directNonMessageTextFor(element.labels[0]) || compactText(element.labels[0].textContent), 'associated-label', 1);
    }
    if (element.id) {
      const root = element.getRootNode ? element.getRootNode() : element.ownerDocument || document;
      const explicitLabel = root.querySelector ? root.querySelector('label[for="' + cssEscape(element.id) + '"]') : null;
      consider(explicitLabel ? (directNonMessageTextFor(explicitLabel) || compactText(explicitLabel.textContent)) : '', 'label-for', 1);
    }
    consider(textFromLabelledBy(element), 'aria-labelledby', 0.98);
    consider(element.getAttribute('aria-label'), 'aria-label', 0.96);
    consider(humanize(element.getAttribute('placeholder') || ''), 'placeholder', 0.70);
    consider(humanize(element.getAttribute('data-testid') || ''), 'test-id', 0.55);
    consider(labelTextForStandaloneBinaryOrFile(element), 'control-shape', 0.88);
    consider(nearestLabelText(element), 'nearby-question', 0.78);
    consider(labelTextAbove(element), 'nearby-text', 0.68);
    consider(textFromDescribedBy(element), 'aria-describedby', 0.60);

    return evidence.length > 0 ? evidence[0] : { text: '', source: 'none', confidence: 0 };
  }

  function labelFor(element) {
    return labelEvidenceFor(element).text;
  }


  window.__labelDiscovery = {
    labelFor,
    labelEvidenceFor,
    fieldMessageFor,
    clippedLabel,
    isGenericPlaceholderText,
    isValidationMessageText,
    isMeaningfulLabelText,
    textFromLabelledBy,
    textFromDescribedBy,
    requirementContextRoot,
    requirementInfoFor,
    isUsableLabelText,
    textContentAcrossOpenRoots,
    fileFieldContainerKey,
    labelDebugCandidatesFor,
    labelTextAbove,
    directTextFor,
    bestQuestionText
  };
})();
