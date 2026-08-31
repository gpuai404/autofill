(function (global) {
  'use strict';
  const textUtils = global.__textUtils;
  if (typeof textUtils?.normalize !== 'function' || typeof textUtils?.compactText !== 'function' || typeof textUtils?.clipText !== 'function') {
    throw new Error('action-classification.js requires shared text utilities.');
  }

  const normalize = textUtils.normalize;
  const compactText = textUtils.compactText;
  const clipText = textUtils.clipText;
  function textNodesOnly(element) {
    return compactText(Array.from(element?.childNodes || [])
      .filter(node => node && node.nodeType === 3)
      .map(node => node.textContent || '')
      .join(' '));
  }

  function descendentText(element, selector) {
    if (!element || typeof element.querySelectorAll !== 'function') {
      return '';
    }

    const texts = Array.from(element.querySelectorAll(selector))
      .map(candidate => compactText(candidate.textContent))
      .filter(Boolean);
    return compactText(texts.join(' '));
  }

  function cleanedActionText(value) {
    return compactText(String(value || '')
      .replace(/\bloading\b[:.\s]*/gi, ' ')
      .replace(/\bprofile added\b/gi, ' ')
      .replace(/\s+/g, ' '));
  }
  function actionButtonText(element) {
    if (!element) {
      return '';
    }

    const explicit = element.getAttribute('aria-label') || element.getAttribute('title') || element.getAttribute('value') || '';
    const directText = textNodesOnly(element);
    const providerText = descendentText(element, '[aria-label], [title], span, div, strong, em');
    const text = cleanedActionText(compactText([explicit, directText, providerText, element.textContent].filter(Boolean).join(' ')));
    return clipText(text, 120);
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

    if (haystack.includes('linkedin') ||
      haystack.includes('indeed') ||
      haystack.includes('google') ||
      haystack.includes('microsoft') ||
      haystack.includes('apple') ||
      haystack.includes('facebook') ||
      haystack.includes('github') ||
      haystack.includes('sso') ||
      haystack.includes('oauth') ||
      haystack.includes('sign in') ||
      haystack.includes('log in') ||
      haystack.includes('login')) {
      return 'sso';
    }

    if (role === 'combobox' || ariaHasPopup) {
      return 'popupTrigger';
    }

    if (nativeType === 'submit' || /\b(submit|send application|complete application|submit application|submit your application)\b/.test(haystack)) {
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


  global.__actionClassification = { actionButtonText, actionKindForButton };
})(window);
