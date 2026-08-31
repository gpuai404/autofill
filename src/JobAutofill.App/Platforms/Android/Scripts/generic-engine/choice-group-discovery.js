(function (global) {
  'use strict';

  function createCollector(deps) {
    const options = deps || {};
    const collectElementsAcrossRoots = options.collectElementsAcrossRoots;
    const composedClosest = options.composedClosest;
    const isVisible = options.isVisible;
    const normalize = options.normalize;
    const selectorFor = options.selectorFor;
    const clippedLabel = options.clippedLabel;
    const isUsableLabelText = options.isUsableLabelText;
    const isMeaningfulLabelText = options.isMeaningfulLabelText;
    const textFromLabelledBy = options.textFromLabelledBy;
    const textContentAcrossOpenRoots = options.textContentAcrossOpenRoots;
    const bestQuestionText = options.bestQuestionText;
    const requirementInfoFor = options.requirementInfoFor;
    const nonApplicationControlReason = options.nonApplicationControlReason;
    const buildChoiceField = options.buildChoiceField;
    const choiceOption = options.choiceOption;
    const uniqueOptions = options.uniqueOptions;
    const questionRootSelector = options.questionRootSelector;
    const choiceVisualControlSelector = options.choiceVisualControlSelector;
    const maxContextLabelLength = options.maxContextLabelLength || 260;
    const maxLabelLength = options.maxLabelLength || 180;

    function containsNestedQuestionGroup(root, nativeType) {
      return collectElementsAcrossRoots(root, questionRootSelector)
        .some(candidate => candidate !== root &&
          isVisible(candidate) &&
          !nonApplicationControlReason(candidate) &&
          choiceInputsIn(candidate, nativeType).length >= 2);
    }

    function normalizedOptionLabels(values) {
      return new Set(values
        .map(option => normalize(option && (option.label || option.value) || ''))
        .filter(Boolean));
    }

    function looksLikeOptionText(text, optionLabels) {
      const normalizedText = normalize(text);
      if (!normalizedText) {
        return false;
      }

      if (optionLabels.has(normalizedText)) {
        return true;
      }

      return Array.from(optionLabels).some(optionLabel => optionLabel && normalizedText.startsWith(optionLabel));
    }

    function resolveChoiceGroupLabel(root, options) {
      const optionLabels = normalizedOptionLabels(options);
      let current = root;

      for (let depth = 0; current && current !== document.body && depth < 8; depth++) {
        const text = bestQuestionText(current);
        if (text && isMeaningfulLabelText(text) && !looksLikeOptionText(text, optionLabels)) {
          return text;
        }

        current = current.parentElement;
      }

      return bestQuestionText(root);
    }

    function labelScore(field) {
      if (!field || !field.label) {
        return -1;
      }

      const label = normalize(field.label);
      if (!label) {
        return -1;
      }

      const optionLabels = normalizedOptionLabels(field.options || []);
      if (optionLabels.has(label)) {
        return -1000;
      }

      return field.label.length;
    }

    function choiceInputLabel(input) {
      if (input.labels && input.labels.length) {
        const labelText = textContentAcrossOpenRoots(input.labels[0]) || input.labels[0].textContent;
        if (isUsableLabelText(labelText) && labelText.length <= maxContextLabelLength) {
          return clippedLabel(labelText, maxLabelLength);
        }
      }

      const label = composedClosest(input, 'label');
      if (label) {
        const text = textContentAcrossOpenRoots(label) || label.textContent;
        if (isUsableLabelText(text) && text.length <= maxContextLabelLength) {
          return clippedLabel(text, maxLabelLength);
        }
      }

      const labelledBy = textFromLabelledBy(input);
      if (isUsableLabelText(labelledBy) && labelledBy.length <= maxContextLabelLength) {
        return clippedLabel(labelledBy, maxLabelLength);
      }

      const ariaLabel = input.getAttribute('aria-label');
      if (isUsableLabelText(ariaLabel)) {
        return clippedLabel(ariaLabel, maxLabelLength);
      }

      return clippedLabel(input.value || input.name || input.id || '', maxLabelLength);
    }

    function ariaChoiceLabel(element) {
      const labelledBy = textFromLabelledBy(element);
      if (isUsableLabelText(labelledBy) && labelledBy.length <= maxContextLabelLength) {
        return clippedLabel(labelledBy, maxLabelLength);
      }

      const ariaLabel = element.getAttribute('aria-label');
      if (isUsableLabelText(ariaLabel)) {
        return clippedLabel(ariaLabel, maxLabelLength);
      }

      const text = textContentAcrossOpenRoots(element) || element.textContent;
      if (isUsableLabelText(text) && text.length <= maxContextLabelLength) {
        return clippedLabel(text, maxLabelLength);
      }

      return clippedLabel(element.getAttribute('data-value') || element.id || '', maxLabelLength);
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

      const visualControl = composedClosest(input, choiceVisualControlSelector);
      return Boolean(visualControl && isVisible(visualControl));
    }

    function choiceInputsIn(root, nativeType) {
      return collectElementsAcrossRoots(root, 'input[type="' + nativeType + '"]')
        .filter(input => !input.disabled && isUsableChoiceInput(input) && !nonApplicationControlReason(input));
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
          if (containsNestedQuestionGroup(current, nativeType)) {
            current = current.parentElement;
            continue;
          }

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

    function buildNativeChoiceGroupField(root, nativeType) {
      const inputs = choiceInputsIn(root, nativeType);
      const options = uniqueOptions(inputs
        .map(input => choiceOption(input.value, choiceInputLabel(input), selectorFor(input), input.checked))
        .filter(option => option.value || option.label));

      return buildChoiceField(root, options, {
        fieldLabel: resolveChoiceGroupLabel(root, options),
        inputs,
        nativeType,
        controlType: nativeType === 'radio' ? 'radioGroup' : 'checkboxGroup',
        tagName: 'input',
        role: '',
        disabled: '',
        requirementFacts: requirementFactsForChoiceGroup(root),
        scanReason: 'Grouped native ' + nativeType + ' inputs under one question.',
        optionsScanReason: 'Options read from grouped native ' + nativeType + ' inputs under one question.',
        optionSourceGroup: nativeType === 'radio' ? 'radio' : 'checkboxGroup'
      });
    }

    function buildAriaChoiceGroupField(root, choiceRole) {
      const choices = collectElementsAcrossRoots(root, '[role="' + choiceRole + '"]')
        .filter(choice => !choice.getAttribute('aria-disabled') && isVisible(choice) && !nonApplicationControlReason(choice));
      const options = uniqueOptions(choices
        .map(choice => choiceOption(
          choice.getAttribute('data-value') || choice.getAttribute('value'),
          ariaChoiceLabel(choice),
          selectorFor(choice),
          choice.getAttribute('aria-checked') === 'true' || choice.getAttribute('aria-selected') === 'true'))
        .filter(option => option.value || option.label));
      const nativeType = choiceRole === 'radio' ? 'radio' : 'checkbox';

      return buildChoiceField(root, options, {
        fieldLabel: resolveChoiceGroupLabel(root, options),
        inputs: choices,
        nativeType,
        controlType: choiceRole === 'radio' ? 'radioGroup' : 'checkboxGroup',
        tagName: root.tagName ? root.tagName.toLowerCase() : '',
        role: root.getAttribute('role') || '',
        disabled: root.getAttribute('aria-disabled') === 'true' ? 'true' : 'false',
        requirementFacts: requirementFactsForChoiceGroup(root),
        scanReason: 'ARIA ' + choiceRole + ' choices under one question.',
        optionsScanReason: 'Options read from ARIA ' + choiceRole + ' controls under one question.',
        optionSourceGroup: choiceRole === 'radio' ? 'radio' : 'checkboxGroup'
      });
    }

    function groupMembers(root, mode, type) {
      return mode === 'aria'
        ? collectElementsAcrossRoots(root, '[role="' + type + '"]')
          .filter(choice => !choice.getAttribute('aria-disabled') && isVisible(choice) && !nonApplicationControlReason(choice))
        : choiceInputsIn(root, type);
    }

    function collectChoiceGroupFields(seen) {
      const fields = [];
      const groupIndexByKey = new Map();
      const ariaGroups = collectElementsAcrossRoots(document, '[role="radiogroup"], [role="group"]');

      function addGroup(root, mode, type) {
        const members = groupMembers(root, mode, type);
        if (members.length < 2) {
          return;
        }

        const memberSelectors = members.map(selectorFor).filter(Boolean).sort();
        const groupKey = type + '|' + memberSelectors.join('|');

        const field = mode === 'aria'
          ? buildAriaChoiceGroupField(root, type)
          : buildNativeChoiceGroupField(root, type);
        if (!field) {
          seen.add(selectorFor(root));
          members.forEach(choice => seen.add(selectorFor(choice)));
          return;
        }

        const existingIndex = groupIndexByKey.get(groupKey);
        if (existingIndex === undefined) {
          groupIndexByKey.set(groupKey, fields.length);
          fields.push(field);
        } else if (labelScore(field) > labelScore(fields[existingIndex])) {
          fields[existingIndex] = field;
        }

        seen.add(selectorFor(root));

        if (mode === 'aria') {
          members.forEach(choice => seen.add(selectorFor(choice)));
          return;
        }

        members.forEach(choice => seen.add(selectorFor(choice)));
      }

      ariaGroups.forEach(root => {
        if (!isVisible(root) || nonApplicationControlReason(root)) {
          return;
        }

        const role = normalize(root.getAttribute('role'));
        const nativeRadioCount = choiceInputsIn(root, 'radio').length;
        const nativeCheckboxCount = choiceInputsIn(root, 'checkbox').length;
        if (nativeRadioCount >= 2 || nativeCheckboxCount >= 2) {
          addGroup(root, 'native', nativeRadioCount >= 2 ? 'radio' : 'checkbox');
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

        addGroup(root, 'aria', choiceRole);
      });

      collectElementsAcrossRoots(document, questionRootSelector).forEach(root => {
        if (!isVisible(root) || nonApplicationControlReason(root)) {
          return;
        }

        const ariaRadioCount = collectElementsAcrossRoots(root, '[role="radio"]').filter(isVisible).length;
        const ariaCheckboxCount = collectElementsAcrossRoots(root, '[role="checkbox"]').filter(isVisible).length;
        if (ariaRadioCount >= 2 || ariaCheckboxCount >= 2) {
          addGroup(root, 'aria', ariaRadioCount >= 2 ? 'radio' : 'checkbox');
        }
      });

      collectElementsAcrossRoots(document, 'input[type="radio"], input[type="checkbox"]').forEach(input => {
        if (!isUsableChoiceInput(input)) {
          return;
        }

        const nativeType = normalize(input.type);
        const root = nearestChoiceGroupRoot(input);
        if (root) {
          addGroup(root, 'native', nativeType);
        }
      });

      return fields;
    }

    return { collectChoiceGroupFields, choiceInputsIn, isUsableChoiceInput, choiceInputLabel };
  }

  global.__choiceGroupDiscovery = { createCollector };
})(window);
