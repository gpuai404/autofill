const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
function load(file, extra={}) { const c={console,URL,window:null,location:{href:'https://example.test/form'},document:{title:'Test',readyState:'complete'},...extra}; c.window=c; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c); return c; }

test('Phase 5: control classification is executable metadata policy',()=>{
  const c=load('generic-engine/control-classification.js',{__textUtils:{normalize:value=>String(value||'').replace(/\s+/g,' ').trim().toLowerCase()},__fieldControlRules:{controlTypes:[{controlType:'email',family:'text',reason:'email',any:[{nativeType:'email'}]}],fallback:{controlType:'text',family:'text',reason:'fallback'}}});
  const result=c.__controlClassification.controlInfoFor({getAttribute:n=>n==='type'?'email':null},'Email',(e,l)=>({nativeType:'email',tagName:'input',labelText:l}));
  assert.equal(result.controlType,'email');
});

test('Phase 6: choice selection preserves radio and multi-answer semantics',()=>{
  const c=load('generic-engine/choice-selection.js',{__textUtils:{humanize:value=>String(value||'').replace(/^#+/,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim()}});
  assert.equal(c.__choiceSelection.inferChoiceSelectionMode('radio','Gender',[{label:'Male',value:'male'}],[{name:'x'}]).selectionMode,'single');
  const result=c.__choiceSelection.inferChoiceSelectionMode('checkbox','Select all that apply',[{label:'A',value:'a'},{label:'B',value:'b'}],[{name:'x'},{name:'y'}]);
  assert.equal(result.selectionMode,'multiple');
});

test('Phase 7: option extraction consumes configured source order',async()=>{
  const c=load('generic-engine/option-handling.js',{__fieldControlRules:{optionSources:{select:[{source:'nativeSelect',reason:'native'}]}}});
  const handlers={nativeSelect:async()=>[{value:'a',label:'A'}]};
  const result=await c.__optionHandling.extractOptions({},'select',{},handlers);
  assert.equal(result.options[0].value,'a');
  assert.deepEqual(Array.from(result.attemptedSources),['nativeSelect']);
});

test('Phase 8: page classification remains a separate engine boundary',()=>{
  const c=load('generic-engine/page-classification.js',{__capabilityProbe:{probeCapabilities:()=>({evidence:{standardFieldCount:1}})},document:{title:'Test',readyState:'complete',body:{innerText:''},querySelectorAll:s=>s.includes('iframe')?[]:s.includes('form')?[]:[],}});
  const result=c.__pageClassification.classifyPage();
  assert.equal(result.classification,'standard-form');
});

test('Phase 9: diagnostics records errors without changing the scan contract',()=>{
  const c=load('generic-engine/diagnostics.js'); const entry=c.__scanDiagnostics.recordError(new Error('boom'),'test','1');
  assert.equal(entry.source,'test'); assert.equal(c.__scanDebug.errors.length,1);
});
