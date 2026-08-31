(function (global) {
  'use strict';

  function hostnameFromUrl(url) {
    try { return new URL(url, global.location && global.location.href).hostname.toLowerCase(); }
    catch (_) { return ''; }
  }

  function matchesRule(hostname, rule) {
    if (!rule || rule.type === 'default') return true;
    if (rule.hostname) return hostname === String(rule.hostname).toLowerCase();
    if (rule.hostSuffix) return hostname.endsWith(String(rule.hostSuffix).toLowerCase());
    if (rule.hostContains) return hostname.includes(String(rule.hostContains).toLowerCase());
    return false;
  }

  function score(pkg, hostname) {
    if (!pkg || !Array.isArray(pkg.matches)) return -1;
    if (!pkg.matches.length) return pkg.id === 'generic' ? 0 : -1;
    let best = -1;
    pkg.matches.forEach(rule => {
      if (!matchesRule(hostname, rule)) return;
      const value = rule.type === 'default' ? 0 : (rule.hostname ? 100 : rule.hostSuffix ? 50 : 25);
      best = Math.max(best, value);
    });
    return best < 0 ? -1 : best + Number(pkg.priority || 0);
  }

  function toPackage(item) {
    return {
      id: item.id,
      priority: item.priority || 0,
      matches: Array.isArray(item.matches) ? item.matches : [],
      rules: item.rules || {}
    };
  }

  function genericPackage() {
    return toPackage({ id: 'generic', priority: 0, matches: [], rules: global.__fieldControlRules || {} });
  }

  function runtimePackages() {
    const payload = global.__siteMetadataPayload;
    if (!payload) return [];

    const inputs = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.packages)
        ? payload.packages
        : [payload];

    return inputs.filter(Boolean).map(toPackage);
  }

  function resolve(context) {
    const ctx = context || {};
    const hostname = hostnameFromUrl(ctx.url || (global.location && global.location.href) || '');
    const packages = Array.isArray(ctx.packages)
      ? ctx.packages
      : [genericPackage()].concat(runtimePackages());
    let winner = null;
    let winnerScore = -Infinity;
    packages.forEach(pkg => {
      const current = score(pkg, hostname);
      if (current > winnerScore) { winner = pkg; winnerScore = current; }
    });
    return {
      package: winner,
      packageId: winner ? winner.id : null,
      hostname,
      score: winnerScore,
      context: ctx
    };
  }

  global.__metadataResolver = { resolve };
})(window);
