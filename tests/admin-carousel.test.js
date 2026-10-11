import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

// Minimal DOM fixture for timer, session, and form behavior, without a browser.
async function fixture(reducedMotion=false){
  let document;
  class Node{
    constructor(tag='div',text=''){this.tag=tag;this.textContent=text;this.children=[];this.dataset={};this.events={};this.attrs={};this.classList={add(){},remove(){}};}
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(...nodes){this.children=nodes;this.textContent='';}
    setAttribute(key,value){this.attrs[key]=value;}
    addEventListener(key,fn){this.events[key]=fn;}
    contains(node){return this===node||this.children.some(child=>child.contains?.(node));}
    matches(){return Boolean(this.hovered);}
    getClientRects(){return this.invisible?[]:[{}];}
    focus(){document.activeElement=this;}
    remove(){}
    querySelector(selector){return walk(this).find(n=>selector==='[data-rotation]'?n.dataset.rotation:n.dataset.direction===selector.match(/="(.*?)"/)?.[1]);}
  }
  function walk(node){return node.children.flatMap(child=>[child,...walk(child)]);}
  const nodes=Object.fromEntries(['frontAdmin','frontAdvisorsBody','frontFeaturedBody'].map(id=>[id,new Node()]));
  document={hidden:false,activeElement:null,createElement:tag=>new Node(tag),createTextNode:text=>new Node('#text',text),getElementById:id=>nodes[id],querySelector:()=>new Node()};
  const timers=new Map();let nextTimer=0;
  const context=vm.createContext({document,URL,authToken:'owner-token',window:{matchMedia:()=>({matches:reducedMotion}),confirm:()=>true},
    setInterval(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearInterval:id=>timers.delete(id),
    apiCall:async path=>({entries:Array.from({length:4},(_,i)=>({id:String(i),name:(path.endsWith('advisors')?'Advisor ':'Feature ')+i,position:i}))})});
  vm.runInContext(readFileSync(new URL('../public/admin-content.js',import.meta.url),'utf8'),context);
  await new Promise(resolve=>setImmediate(resolve));
  const names=()=>walk(nodes.frontAdvisorsBody).filter(n=>n.tag==='#text').map(n=>n.textContent);
  return {nodes,document,context,timers,names,walk,tick(){[...timers.values()].forEach(timer=>timer.fn());}};
}
test('advisors rotate two at a time every four seconds and leave features alone',async()=>{
  const f=await fixture();assert.deepEqual(f.names(),['Advisor 0','Advisor 1']);
  assert.equal(f.timers.size,1);assert.equal([...f.timers.values()][0].ms,4000);
  const featureChildren=f.nodes.frontFeaturedBody.children;
  f.tick();assert.deepEqual(f.names(),['Advisor 2','Advisor 3']);
  assert.equal(f.nodes.frontFeaturedBody.children,featureChildren);
  f.tick();assert.deepEqual(f.names(),['Advisor 0','Advisor 1']);assert.equal(f.timers.size,1);
});
test('hover, keyboard focus and hidden content suspend rotation; editing and logout clear it',async()=>{
  const f=await fixture(),body=f.nodes.frontAdvisorsBody;
  body.hovered=true;f.tick();assert.deepEqual(f.names(),['Advisor 0','Advisor 1']);body.hovered=false;
  f.document.activeElement=body.children[0];f.tick();assert.deepEqual(f.names(),['Advisor 0','Advisor 1']);f.document.activeElement=null;
  f.document.hidden=true;f.tick();assert.deepEqual(f.names(),['Advisor 0','Advisor 1']);f.document.hidden=false;
  body.invisible=true;f.tick();assert.deepEqual(f.names(),['Advisor 0','Advisor 1']);body.invisible=false;
  f.walk(body).find(n=>n.textContent==='Edit').events.click();assert.equal(f.timers.size,0);
  const form=body.children[0];form.events.input();f.tick();assert.equal(body.children[0],form);
  f.walk(body).find(n=>n.textContent==='Cancel').events.click();assert.equal(f.timers.size,1);
  vm.runInContext("authToken=null;SiteAdmin.refreshAccess();",f.context);
  assert.equal(f.timers.size,0);assert.equal(f.nodes.frontAdmin.hidden,true);assert.equal(body.children.length,0);
});
test('rotation offers pause and respects reduced-motion preference',async()=>{
  const f=await fixture();f.nodes.frontAdvisorsBody.querySelector('[data-rotation]').events.click();
  assert.equal(f.timers.size,0);assert.equal(f.nodes.frontAdvisorsBody.querySelector('[data-rotation]').textContent,'Play');
  const reduced=await fixture(true);assert.equal(reduced.timers.size,0);
});
