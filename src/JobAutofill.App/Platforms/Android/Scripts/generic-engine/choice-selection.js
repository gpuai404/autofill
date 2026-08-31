(function (global) {
  'use strict';
  const textUtils = global.__textUtils;
  if (typeof textUtils?.humanize !== 'function') {
    throw new Error('choice-selection.js requires shared text utilities.');
  }

  const humanize = textUtils.humanize;

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
      /multiple (?:answers|responses|selections|options)/
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

    if (yesNoLike) {
      return {
        selectionMode: 'single',
        multiple: false,
        reason: 'Yes/no style checkbox options indicate a mutually exclusive answer set.'
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


  global.__choiceSelection = { normalizedChoiceText, hasAnyTextMatch, inferChoiceSelectionMode };
})(window);
