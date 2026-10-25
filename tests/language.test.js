import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {LANGUAGES, STORAGE_KEY, translateText, translatedValue, validateCatalog, validLanguage} from '../public/language.js';
const catalog=JSON.parse(readFileSync(new URL('../public/locales/interface.json',import.meta.url)));
const source=readFileSync(new URL('../public/language.js',import.meta.url),'utf8');

test('six non-English languages have complete native-script interface entries',()=>{
  assert.deepEqual(LANGUAGES.map(([code])=>code),['en','es','zh-Hans','tl','vi','ar','hi']);
  assert.equal(validateCatalog(catalog),catalog);
  for(const [code] of LANGUAGES.slice(1)){
    for(const key of ['Overview','Housing','Transportation','Statistics','Get to know your community.']){
      assert.notEqual(translateText(key,code,catalog),key,`${code}: ${key}`);
    }
  }
  assert.throws(()=>validateCatalog({Overview:['uno']}));
  assert.throws(()=>validateCatalog({}));
  assert.equal(validLanguage('invalid'),'en');
});
test('switching languages restores the original, preserves whitespace and accepts new app text',()=>{
  let state=translatedValue('  Housing\n',null,'es',catalog);
  assert.equal(state.rendered,'  Vivienda\n');
  state=translatedValue(state.rendered,state,'hi',catalog);
  assert.equal(state.rendered,'  आवास\n');
  state=translatedValue(state.rendered,state,'en',catalog);
  assert.equal(state.rendered,'  Housing\n');
  state=translatedValue('Transportation',state,'ar',catalog);
  assert.equal(state.original,'Transportation');
  assert.equal(state.rendered,'النقل');
  assert.equal(translateText('123 Main Street; case 2026-001','es',catalog),'123 Main Street; case 2026-001');
  assert.equal(translateText('Saumit1234','hi',catalog),'Saumit1234');
  assert.equal(translateText('Selected: San Luis Obispo','es',catalog),'Selección: San Luis Obispo');
  assert.equal(translateText('Selected: $&','es',catalog),'Selección: $&');
  assert.equal(translateText('30,231 loaded records indexed','hi',catalog),'30,231 लोड किए गए रिकॉर्ड सूचीबद्ध हैं');
});
function harness(fetcher,{blocked=false}={}){
  const controls=[{value:'en',addEventListener(){}},{value:'en',addEventListener(){}}];
  const notes=[{hidden:true}],statuses=[{textContent:''}],saved=new Map();
  const body={isConnected:true,nodeType:1,closest:()=>null,hasAttribute:()=>false};
  const document={body,documentElement:{dir:'ltr',dataset:{}},querySelectorAll:selector=>selector==='[data-language-select]'?controls:selector==='[data-language-note]'?notes:statuses,createTreeWalker:()=>({nextNode:()=>null}),dispatchEvent(){}};
  const storage={getItem:key=>saved.get(key),setItem:(key,value)=>{if(blocked)throw Error('Blocked');saved.set(key,value);}};
  const context=vm.createContext({AbortSignal,MutationObserver:class{observe(){}disconnect(){}},requestAnimationFrame:fn=>fn(),CustomEvent:class{constructor(name,options){Object.assign(this,options);}},console});
  vm.runInContext(source.replaceAll('export ',''),context);
  return {api:context.initLanguage(document,storage,fetcher),controls,notes,statuses,saved,document};
}
const ok=async()=>({ok:true,json:async()=>catalog});
test('a selection syncs both controls, persists and resets RTL when returning to English',async()=>{
  const h=harness(ok);
  await h.api.select('ar');
  assert.equal(h.document.documentElement.dir,'rtl');
  assert.deepEqual(h.controls.map(c=>c.value),['ar','ar']);
  assert.equal(h.saved.get(STORAGE_KEY),'ar');
  assert.equal(h.notes[0].hidden,false);
  await h.api.select('en');
  assert.equal(h.document.documentElement.dir,'ltr');
  assert.equal(h.notes[0].hidden,true);
});
test('late language requests cannot overwrite a newer English selection',async()=>{
  let release;
  const h=harness(()=>new Promise(resolve=>{release=resolve;}));
  const pending=h.api.select('es');
  await h.api.select('en');
  release({ok:true,json:async()=>catalog});await pending;
  assert.equal(h.api.language,'en');
  assert.equal(h.saved.get(STORAGE_KEY),'en');
  assert.deepEqual(h.controls.map(c=>c.value),['en','en']);
});
test('failed translation files retain English and can be retried; storage is optional',async()=>{
  let calls=0;
  const h=harness(async(url,options)=>{assert.equal(url,'/locales/interface.json');assert.ok(options.signal);return ++calls===1?{ok:false}:ok();},{blocked:true});
  await h.api.select('hi');
  assert.equal(h.api.language,'en');
  assert.match(h.statuses[0].textContent,/could not load/);
  await h.api.select('hi');
  assert.equal(h.api.language,'hi');
  assert.equal(calls,2);
  await h.api.select('vi');
  assert.equal(calls,2,'catalog is cached for subsequent language selections');
});
test('selectors do not replace inputs or translate third-party maps, records or account identity',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.equal((html.match(/data-language-select /g)||[]).length,2);
  assert.match(source,/translate="no"/);
  assert.match(source,/\.nav-identity/);
  assert.match(source,/option:not\(\[value\]\)/);
  assert.doesNotMatch(source,/\.innerHTML\s*=/);
  const css=readFileSync(new URL('../public/language.css',import.meta.url),'utf8');
  assert.match(css,/\.leaflet-container.*direction:ltr/s);
});
