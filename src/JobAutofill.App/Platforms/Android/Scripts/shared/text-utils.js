(function (global) {
  'use strict';

  // Text escaping and normalization utilities shared by scanner and filler.

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }

    return String(value).replace(/["\\]/g, '\\$&');
  }

  const domShared = global.__domShared || {};
  const normalize = typeof domShared.normalize === 'function'
    ? domShared.normalize
    : value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

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

  function clipText(value, maxLength) {
    const text = String(value || '');
    if (text.length <= maxLength) {
      return text;
    }

    return text.slice(0, maxLength).replace(/\s+\S*$/, '').trim();
  }

  global.__textUtils = {
    cssEscape,
    normalize,
    humanize,
    compactText,
    clipText
  };
})(window);
