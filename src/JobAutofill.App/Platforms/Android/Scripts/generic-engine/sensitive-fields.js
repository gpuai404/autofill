(function (global) {
  'use strict';
  const textUtils = global.__textUtils;
  if (typeof textUtils?.normalize !== 'function') {
    throw new Error('sensitive-fields.js requires shared text utilities.');
  }

  const normalize = textUtils.normalize;

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


  global.__sensitiveFields = { sensitiveFieldInfo };
})(window);
