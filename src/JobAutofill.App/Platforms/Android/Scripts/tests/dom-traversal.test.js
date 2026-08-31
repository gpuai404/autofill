const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function load() {
  const context = { console, Set, Array, Node: { ELEMENT_NODE: 1 }, document: { body: null }, __domShared: { shadowRootFor: e => e && e._shadowRoot || null }, window: null };
  context.window = context; vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'shared', 'dom-traversal.js'), 'utf8'), context);
  return context.__genericDomTraversal;
}
function rootWith(map) { return { querySelectorAll: selector => map[selector] || [] }; }
test('ordinary traversal', () => { const t=load(), a={tagName:'INPUT'}; assert.deepEqual(t.collectElementsAcrossRoots(rootWith({input:[a],'*':[a]}),'input'),[a]); });
test('shadow-root traversal', () => { const t=load(), input={tagName:'INPUT'}, host={tagName:'DIV',_shadowRoot:rootWith({input:[input],'*':[input]})}; assert.deepEqual(t.collectElementsAcrossRoots(rootWith({input:[],'*':[host]}),'input'),[input]); });
test('accessible iframe traversal', () => { const t=load(), input={tagName:'INPUT'}, doc=rootWith({input:[input],'*':[input]}); doc.documentElement={}; const frame={tagName:'IFRAME',contentDocument:doc}; assert.deepEqual(t.collectElementsAcrossRoots(rootWith({input:[],'*':[frame]}),'input'),[input]); });
test('composed parent crosses shadow boundary', () => { const t=load(), host={nodeType:1}, root={host}, child={parentElement:null,getRootNode:()=>root}; assert.equal(t.composedParentElement(child),host); });
test('composed closest walks composed chain', () => { const t=load(), host={nodeType:1,closest:s=>s==='.field'?host:null}, root={host}, child={parentElement:null,getRootNode:()=>root,closest:()=>null}; assert.equal(t.composedClosest(child,'.field'),host); });
