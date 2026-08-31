(function (global) {
  'use strict';
  const diagnostics = global.__scanDiagnostics;
  if (typeof diagnostics?.recordError !== 'function') {
    throw new Error('scanner.js requires scan diagnostics.');
  }

  function resolveMetadata() {
    return global.__metadataResolver.resolve({
      url: global.location && global.location.href,
      document: global.document
    });
  }

  function engine() {
    if (!global.__scannerEngine) throw new Error('Scanner engine is not loaded.');
    return global.__scannerEngine;
  }

  function withResolvedMetadata(action) {
    const resolved = resolveMetadata();
    applyResolvedMetadata(resolved);
    return action(engine(), resolved);
  }

  function classifyPage() {
    return withResolvedMetadata((e, resolved) => {
      const result = e.classifyPage();
      if (result && typeof result === 'object') {
        result.metadata = { packageId: resolved.packageId };
      }
      return result;
    });
  }

  async function scanFields() {
    return withResolvedMetadata(async (e, resolved) => {
      try {
        const fields = await e.findFields();
        global.__scanMetadata = { packageId: resolved.packageId, hostname: resolved.hostname };
        return fields;
      } catch (error) {
        diagnostics.recordError(error, 'scan', 'n/a');
        return [];
      }
    });
  }

  function applyResolvedMetadata(resolved) {
    if (resolved && resolved.package && resolved.package.rules) {
      global.__fieldControlRules = resolved.package.rules;
    }
    return resolved;
  }

  async function extractOptionsForField(selector) {
    return withResolvedMetadata(e => e.extractOptionsForField(selector));
  }

  function closeOpenOptionPopups() {
    return engine().closeOpenOptionPopups(null);
  }

  global.__scanner = { resolveMetadata, classifyPage, scanFields, extractOptionsForField, closeOpenOptionPopups };
  global.__classifyPage = classifyPage;
  global.__scanFields = scanFields;
  global.__extractOptionsForField = extractOptionsForField;
  global.__closeOpenOptionPopups = closeOpenOptionPopups;
})(window);
