(function (global) {
  'use strict';

  const dom = global.__domShared || {};

  function optionValue(option) {
    return option ? (option.value ?? option.Value ?? '') : '';
  }

  function optionLabel(option) {
    return option
      ? (option.label ?? option.Label ?? option.value ?? option.Value ?? '')
      : '';
  }

  function optionFillText(option) {
    return optionLabel(option) || optionValue(option);
  }

  function optionSelector(option) {
    return option ? (option.selector ?? option.Selector ?? '') : '';
  }

  function optionPosition(option) {
    if (!option) return -1;
    const value = option.position === undefined ? option.Position : option.position;
    const number = Number(value);
    return Number.isInteger(number) ? number : -1;
  }

  function optionSource(option) {
    return option ? (option.source ?? option.Source ?? '') : '';
  }

  function optionFillMethod(option) {
    return option ? (option.fillMethod ?? option.FillMethod ?? '') : '';
  }

  const normalize = typeof dom.normalize === 'function'
    ? dom.normalize
    : value => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

  function searchTexts(option) {
    return Array.from(new Set([
      optionLabel(option),
      optionValue(option),
      optionFillText(option)
    ].map(normalize).filter(Boolean)));
  }

  function tokens(value) {
    return normalize(value)
      .split(/[^a-z0-9]+/)
      .filter(token => token.length >= 2);
  }

  function tokenOverlapScore(left, right) {
    const leftTokens = tokens(left);
    const rightTokens = tokens(right);
    if (!leftTokens.length || !rightTokens.length) return 0;

    const rightSet = new Set(rightTokens);
    const overlap = leftTokens.filter(token => rightSet.has(token)).length;
    return overlap / Math.max(leftTokens.length, rightTokens.length);
  }

  function visibleText(item) {
    return normalize(item && (item.textContent || item.getAttribute('aria-label') || ''));
  }

  function visibleValue(item) {
    return normalize(item && (item.getAttribute('value') || item.getAttribute('data-value') || ''));
  }

  function scoreVisibleOption(item, option) {
    const targets = searchTexts(option);
    const candidates = [visibleText(item), visibleValue(item)].filter(Boolean);
    if (!targets.length || !candidates.length) return 0;

    let best = 0;
    targets.forEach(target => candidates.forEach(candidate => {
      if (candidate === target) {
        best = Math.max(best, 1);
        return;
      }

      const shorter = Math.min(candidate.length, target.length);
      if (shorter >= 4 && (candidate.startsWith(target) || target.startsWith(candidate))) {
        best = Math.max(best, 0.92);
        return;
      }

      if (shorter >= 4 && (candidate.includes(target) || target.includes(candidate))) {
        best = Math.max(best, 0.82);
        return;
      }

      best = Math.max(best, tokenOverlapScore(candidate, target));
    }));

    return best;
  }

  function isStructuredPopupOption(item) {
    return item.getAttribute('role') === 'option' ||
      item.getAttribute('role') === 'menuitem' ||
      item.closest('[role="listbox"], [role="menu"], [role="grid"]') !== null;
  }

  function findBestVisibleOption(items, option, settings) {
    const options = settings || {};
    const minimumScore = typeof options.minimumScore === 'number' ? options.minimumScore : 1;
    const value = normalize(optionValue(option));
    const label = normalize(optionLabel(option));

    const exact = items.find(item => {
      const text = visibleText(item);
      const itemValue = visibleValue(item);
      return text === label || text === value || itemValue === value || itemValue === label;
    });
    if (exact) return exact;

    const scored = items
      .map(item => ({ item, score: scoreVisibleOption(item, option) }))
      .filter(candidate => candidate.score >= minimumScore)
      .sort((left, right) => right.score - left.score)[0];
    if (scored) return scored.item;

    if (options.allowVerifiedPosition) {
      const position = optionPosition(option);
      if (position >= 0 && position < items.length && items.every(isStructuredPopupOption)) {
        const positioned = items[position];
        if (scoreVisibleOption(positioned, option) >= minimumScore) return positioned;
      }
    }

    return null;
  }

  function matchesSelectedOption(item, option) {
    if (!item || !option) return false;
    const text = visibleText(item);
    const value = visibleValue(item);
    const expectedText = normalize(optionLabel(option));
    const expectedValue = normalize(optionValue(option));
    return text === expectedText || text === expectedValue ||
      value === expectedText || value === expectedValue;
  }

  function findNativeSelectOption(options, value) {
    const target = normalize(value);
    if (!target) return null;

    const nativeOptions = Array.from(options || []);
    return nativeOptions.find(option => {
      return normalize(option.value) === target || normalize(option.text) === target;
    }) || nativeOptions.find(option => {
      return normalize(option.text).startsWith(target);
    }) || nativeOptions.find(option => {
      const optionValueText = normalize(option.value);
      return optionValueText && target.length > 2 && optionValueText.includes(target);
    }) || null;
  }

  function findRadio(radios, value) {
    const target = normalize(value);
    return Array.from(radios || []).find(radio => {
      const radioValue = normalize(radio.value);
      const radioLabel = radio.labels && radio.labels.length
        ? normalize(radio.labels[0].textContent)
        : '';
      return radioValue === target || radioLabel === target ||
        (radioValue && target.includes(radioValue)) ||
        (radioLabel && target.includes(radioLabel));
    }) || null;
  }

  function searchQueryCandidates(option) {
    const normalized = normalize(optionFillText(option));
    if (!normalized) return [];

    const words = normalized.split(/\s+/).filter(Boolean);
    const compact = normalized.replace(/[^a-z0-9]/g, '');
    return Array.from(new Set([
      normalized,
      normalized.split(/[,;\n]/)[0],
      words.slice(0, 4).join(' '),
      words.slice(0, 3).join(' '),
      compact.slice(0, 4),
      compact.slice(0, 3),
      compact.slice(0, 2)
    ].map(normalize).filter(value => value.length >= 2)));
  }

  async function extractOptions(element, controlType, options, optionSourceHandlers) {
    const rules = global.__fieldControlRules || {};
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
      if (!handler) continue;

      attemptedSources.push(source.source);
      let extractedOptions = [];
      try {
        extractedOptions = await handler(element, source);
      } catch (error) {
        errors.push(source.source + ': ' + (error && error.message ? error.message : String(error)));
        continue;
      }

      if (extractedOptions.length > 0) {
        return {
          options: extractedOptions,
          optionsTruncated: Boolean(extractedOptions.optionsTruncated),
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

  global.__optionHandling = {
    optionValue,
    optionLabel,
    optionFillText,
    optionSelector,
    optionPosition,
    optionSource,
    optionFillMethod,
    normalize,
    scoreVisibleOption,
    findBestVisibleOption,
    matchesSelectedOption,
    findNativeSelectOption,
    findRadio,
    searchQueryCandidates,
    isStructuredPopupOption,
    extractOptions
  };
})(window);
