(function () {
  const genericRulesPath = '/src/JobAutofill.App/Platforms/Android/Scripts/metadata/generic-field-control-rules.json';
  const scriptPaths = [
    '/src/JobAutofill.App/Platforms/Android/Scripts/shared/shared-runtime.js',
    '/src/JobAutofill.App/Platforms/Android/Scripts/shared/text-utils.js',
    '/src/JobAutofill.App/Platforms/Android/Scripts/shared/dom-traversal.js',
    '/src/JobAutofill.App/Platforms/Android/Scripts/shared/selector-resolver.js',
    '/src/JobAutofill.App/Platforms/Android/Scripts/metadata/metadata-resolver.js',
    '/src/JobAutofill.App/Platforms/Android/Scripts/generic-engine/label-discovery.js',
    '/src/JobAutofill.App/Platforms/Android/Scripts/generic-engine/control-classification.js',
    '/src/JobAutofill.App/Platforms/Android/Scripts/generic-engine/choice-selection.js',
    '/src/JobAutofill.App/Platforms/Android/Scripts/generic-engine/choice-group-discovery.js',
    '/src/JobAutofill.App/Platforms/Android/Scripts/generic-engine/sensitive-fields.js',
    '/src/JobAutofill.App/Platforms/Android/Scripts/generic-engine/capability-probe.js',
    '/src/JobAutofill.App/Platforms/Android/Scripts/generic-engine/option-handling.js',
    '/src/JobAutofill.App/Platforms/Android/Scripts/generic-engine/option-source-handlers.js',
    '/src/JobAutofill.App/Platforms/Android/Scripts/generic-engine/action-classification.js',
    '/src/JobAutofill.App/Platforms/Android/Scripts/generic-engine/page-classification.js',
    '/src/JobAutofill.App/Platforms/Android/Scripts/generic-engine/diagnostics.js',
    '/src/JobAutofill.App/Platforms/Android/Scripts/scanner/scanner-engine.js',
    '/src/JobAutofill.App/Platforms/Android/Scripts/scanner/scanner.js',
    '/src/JobAutofill.App/Platforms/Android/Scripts/filler/fill.js'
  ];

  const state = {
    manifest: null,
    scripts: null
  };

  const resultsBody = document.getElementById('results');
  document.getElementById('run').addEventListener('click', runAll);

  async function loadText(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load ${path}: ${response.status}`);
    }

    return response.text();
  }

  async function loadJson(path) {
    return JSON.parse(await loadText(path));
  }

  async function ensureAssets() {
    state.manifest ||= await loadJson('manifest.json');
    state.scripts ||= await Promise.all(scriptPaths.map(loadText));
    state.genericRules ||= await loadJson(genericRulesPath);
  }

  function injectScript(frameWindow, source) {
    const script = frameWindow.document.createElement('script');
    script.textContent = source;
    frameWindow.document.documentElement.appendChild(script);
    script.remove();
  }

  async function loadFrame(html) {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    iframe.srcdoc = html;

    await new Promise(resolve => {
      iframe.addEventListener('load', resolve, { once: true });
    });

    iframe.contentWindow.__fieldControlRules = state.genericRules;

    for (const script of state.scripts) {
      injectScript(iframe.contentWindow, script);
    }

    return iframe;
  }

  function fieldMatches(field, expected) {
    if (expected.labelIncludes && !String(field.label || '').toLowerCase().includes(expected.labelIncludes.toLowerCase())) {
      return false;
    }

    if (expected.controlType && field.controlType !== expected.controlType) {
      return false;
    }

    if (expected.controlFamily && field.controlFamily !== expected.controlFamily) {
      return false;
    }

    if (expected.selectorIncludes && !String(field.selector || '').includes(expected.selectorIncludes)) {
      return false;
    }

    if (expected.minOptions !== undefined && (!Array.isArray(field.options) || field.options.length < expected.minOptions)) {
      return false;
    }

    if (expected.requiresCapturedOption !== undefined && Boolean(field.requiresCapturedOption) !== expected.requiresCapturedOption) {
      return false;
    }

    if (expected.required !== undefined && String(field.required || '').toLowerCase() !== String(expected.required).toLowerCase()) {
      return false;
    }

    if (expected.optional !== undefined && String(field.optional || '').toLowerCase() !== String(expected.optional).toLowerCase()) {
      return false;
    }

    return true;
  }

  function assertExpected(fields, expected) {
    const failures = [];
    const expectedFields = expected.fields || [];

    if (expected.minFieldCount !== undefined && fields.length < expected.minFieldCount) {
      failures.push(`Expected at least ${expected.minFieldCount} fields, found ${fields.length}.`);
    }

    for (const expectedField of expectedFields) {
      if (!fields.some(field => fieldMatches(field, expectedField))) {
        failures.push(`Missing field expectation: ${JSON.stringify(expectedField)}`);
      }
    }

    return failures;
  }

  function actionButtonMatches(button, expected) {
    if (expected.labelIncludes && !String(button.label || '').toLowerCase().includes(expected.labelIncludes.toLowerCase())) {
      return false;
    }

    if (expected.actionKind && button.actionKind !== expected.actionKind) {
      return false;
    }

    if (expected.role && button.role !== expected.role) {
      return false;
    }

    if (expected.nativeType && button.nativeType !== expected.nativeType) {
      return false;
    }

    if (expected.ariaHasPopup && button.ariaHasPopup !== expected.ariaHasPopup) {
      return false;
    }

    return true;
  }

  function assertExpectedActionButtons(frameWindow, expected) {
    const failures = [];
    const buttons = frameWindow.__scanDebug && Array.isArray(frameWindow.__scanDebug.actionButtons)
      ? frameWindow.__scanDebug.actionButtons
      : [];

    if (expected.minActionButtonCount !== undefined && buttons.length < expected.minActionButtonCount) {
      failures.push(`Expected at least ${expected.minActionButtonCount} action buttons, found ${buttons.length}.`);
    }

    for (const expectedButton of expected.actionButtons || []) {
      if (!buttons.some(button => actionButtonMatches(button, expectedButton))) {
        failures.push(`Missing action button expectation: ${JSON.stringify(expectedButton)}`);
      }
    }

    return failures;
  }

  async function runFillAssertions(frameWindow, fields, expected) {
    const failures = [];
    const fillAssertions = expected.fill || [];

    for (const assertion of fillAssertions) {
      const field = fields.find(candidate => fieldMatches(candidate, assertion.field));
      if (!field) {
        failures.push(`Fill target not found: ${JSON.stringify(assertion.field)}`);
        continue;
      }

      let result;
      if (assertion.optionLabelIncludes) {
        const option = field.options.find(candidate =>
          String(candidate.label || candidate.value || '').toLowerCase().includes(assertion.optionLabelIncludes.toLowerCase()));
        if (!option) {
          failures.push(`Fill option not found for ${field.label}: ${assertion.optionLabelIncludes}`);
          continue;
        }

        result = await frameWindow.__fillFieldOption(field.selector, option, field.fillStrategy);
      } else {
        result = await frameWindow.__fillField(field.selector, assertion.value, field.fillStrategy);
      }

      if (Boolean(result && result.ok) !== assertion.ok) {
        failures.push(`Fill assertion failed for ${field.label}: ${JSON.stringify(result)}`);
      }

      if (assertion.elementValueIsNot !== undefined) {
        const element = frameWindow.document.querySelector(assertion.elementSelector || field.selector);
        if (element && String(element.value || element.textContent || '').trim() === assertion.elementValueIsNot) {
          failures.push(`Unexpected filled value for ${field.label}: ${assertion.elementValueIsNot}`);
        }
      }
    }

    return failures;
  }

  async function runFixture(entry) {
    const html = await loadText(entry.fixture);
    const expected = await loadJson(entry.expected);
    const iframe = await loadFrame(html);

    try {
      const fields = await iframe.contentWindow.__scanFields();
      await extractMissingOptions(iframe.contentWindow, fields);
      let failures = assertExpected(fields, expected);
      failures = failures.concat(assertExpectedActionButtons(iframe.contentWindow, expected));
      failures = failures.concat(await runFillAssertions(iframe.contentWindow, fields, expected));

      return {
        ok: failures.length === 0,
        failures,
        fieldCount: fields.length,
        fields: fields.map(field => ({
          label: field.label,
          controlType: field.controlType,
          selector: field.selector,
          options: Array.isArray(field.options) ? field.options.length : 0
        })),
        capability: iframe.contentWindow.__scanCapability || null
      };
    } finally {
      iframe.remove();
    }
  }

  async function extractMissingOptions(frameWindow, fields) {
    if (typeof frameWindow.__extractOptionsForField !== 'function') {
      return;
    }

    for (const field of fields) {
      if (!field.requiresCapturedOption || Array.isArray(field.options) && field.options.length > 0) {
        continue;
      }

      const result = await frameWindow.__extractOptionsForField(field.selector);
      if (result && Array.isArray(result.options) && result.options.length > 0) {
        field.options = result.options;
        field.optionsTruncated = Boolean(result.optionsTruncated);
        field.optionsScanReason = result.message || field.optionsScanReason;
      }
    }
  }

  function appendResult(name, result) {
    const row = document.createElement('tr');
    const status = result.ok ? 'PASS' : 'FAIL';
    row.innerHTML = `
      <td>${name}</td>
      <td class="${result.ok ? 'pass' : 'fail'}">${status}</td>
      <td><pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre></td>
    `;
    resultsBody.appendChild(row);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function runAll() {
    resultsBody.textContent = '';
    await ensureAssets();

    for (const entry of state.manifest) {
      try {
        appendResult(entry.name, await runFixture(entry));
      } catch (error) {
        appendResult(entry.name, {
          ok: false,
          failures: [error && error.stack ? error.stack : String(error)]
        });
      }
    }
  }
})();
