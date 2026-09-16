(function (global) {
  'use strict';
  const textUtils = global.__textUtils;
  if (typeof textUtils?.normalize !== 'function') {
    throw new Error('control-classification.js requires shared text utilities.');
  }

  const normalize = textUtils.normalize;

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

  function controlInfoFor(element, labelText, factsFor) {
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

  function buildFieldModel(config) {
    const field = config || {};
    const facts = field.facts || {};
    const controlInfo = field.controlInfo || {};
    const sensitiveInfo = field.sensitiveInfo || {};
    const options = Array.isArray(field.options) ? field.options : [];

    return {
      selector: field.selector || '',
      label: field.label || '',
      labelSource: field.labelEvidence?.source || 'unknown',
      labelConfidence: Number(field.labelEvidence?.confidence || 0),
      inputType: controlInfo.controlType || '',
      fieldCategory: sensitiveInfo.fieldCategory || '',
      fieldSubCategory: sensitiveInfo.fieldSubCategory || '',
      fieldCategoryReason: sensitiveInfo.fieldCategoryReason || '',
      controlType: controlInfo.controlType || '',
      controlFamily: controlInfo.controlFamily || '',
      selectionMode: controlInfo.selectionMode || '',
      selectionModeReason: controlInfo.selectionModeReason || '',
      nativeInputType: facts.nativeType || '',
      tagName: facts.tagName || '',
      role: facts.role || '',
      ariaHasPopup: facts.ariaHasPopup || '',
      ariaExpanded: facts.ariaExpanded || '',
      ariaControls: facts.ariaControls || '',
      ariaOwns: facts.ariaOwns || '',
      ariaActiveDescendant: facts.ariaActiveDescendant || '',
      ariaAutocomplete: facts.ariaAutocomplete || '',
      ariaMultiselectable: facts.ariaMultiselectable || '',
      autocomplete: facts.autocomplete || '',
      list: facts.list || '',
      required: facts.required || '',
      optional: facts.optional || '',
      disabled: facts.disabled || '',
      readonly: facts.readonly || '',
      multiple: facts.multiple || '',
      scanReason: controlInfo.scanReason || '',
      fieldMessage: field.fieldMessage || '',
      requiresCapturedOption: Boolean(controlInfo.requiresCapturedOption),
      valuePolicy: controlInfo.valuePolicy || '',
      fillStrategy: controlInfo.fillStrategy || '',
      optionSourceGroup: controlInfo.optionSourceGroup || '',
      extractionActionGroup: controlInfo.extractionActionGroup || '',
      options,
      optionsTruncated: Boolean(field.optionsTruncated),
      optionsScanReason: field.optionsScanReason || '',
      sourceUrl: field.sourceUrl || ''
    };
  }

  global.__controlClassification = { matchesExpected, matchesRule, selectionModeFor, controlInfoFor, buildFieldModel };
})(window);
