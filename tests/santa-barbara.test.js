import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseSantaBarbaraCalendar} from '../santa-barbara-calendar.js';
const fixture=readFileSync(new URL('./fixtures/santa-barbara-calendar.html',import.meta.url),'utf8');
test('Santa Barbara calendar preserves local times across DST, removes cancelled and duplicate meetings',()=>{
 const rows=parseSantaBarbaraCalendar(fixture,'2026-10-25','2026-11-05');
 assert.equal(rows.length,3);
 assert.ok(rows.every(m=>m.source==='official-calendar'&&!m.agendaPublished&&!m.matters.length));
 assert.equal(rows.find(m=>m.body==='City Council').time,'2:00 PM');
 assert.equal(rows.find(m=>m.body==='Single Family Design Board').time,'3:00 PM');
 assert.equal(rows.filter(m=>m.body==='Santa Barbara Youth Council').length,1);
 assert.equal(parseSantaBarbaraCalendar(fixture,'2026-11-04','2026-11-05').length,0);
});
test('unexpected calendar markup fails visibly instead of reporting no meetings',()=>{
 assert.throws(()=>parseSantaBarbaraCalendar('<html>Service unavailable</html>','2026-10-25','2026-11-05'),/format changed/);
 const unsafe=fixture.replaceAll('https://calendar.santabarbaraca.gov/','https://example.com/');
 assert.deepEqual(parseSantaBarbaraCalendar(unsafe,'2026-10-25','2026-11-05'),[]);
});
test('Santa Barbara sources link to actual board directory, applications and both agenda pages',()=>{
 const m=JSON.parse(readFileSync(new URL('../public/data/coverage/manifest.json',import.meta.url)));
 const c=m.cities.santabarbara;
 assert.equal(c.deciders.filter(b=>/City Council/.test(b.name)).length,1);
 assert.ok(c.join.length>20);
 assert.ok(c.resources.some(r=>r.url.endsWith('/applications-vacancies')));
 assert.equal(m.meetings.santabarbara.calendarFeed,'santa-barbara');
 for(const end of ['/planning-commission','/city-council-meetings','/public-meeting-calendar'])assert.ok(m.meetings.santabarbara.links.some(l=>l.url.endsWith(end)));
 for(const city of Object.values(m.cities))assert.ok(city.resources.every(r=>!r.title.startsWith('Go to ')));
});
test('switching cities while a summary loads prevents the previous city result from rendering',async()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const fn=html.slice(html.indexOf('async function runMeetingSummary(){'),html.indexOf("document.getElementById('msSummarize').addEventListener"));
 const elements=new Map();
 const el=id=>{if(!elements.has(id))elements.set(id,{value:'santabarbara',style:{},textContent:'',disabled:false});return elements.get(id);};
 let finish,rendered=0;
 const ctx=vm.createContext({document:{getElementById:el},CITIES:{santabarbara:{label:'Santa Barbara'}},msRequest:0,msController:null,msLastResult:null,AbortController,startMsLoading(){},stopMsLoading(){},resetMsResultLayout(){rendered++;},renderMsFallback(){rendered++;},renderMsCategories(){},renderMsMeetings(){},fetch:()=>new Promise(r=>finish=r),console});
 vm.runInContext(fn,ctx);
 const pending=ctx.runMeetingSummary();
 ctx.msRequest++;el('msCitySelect').value='goleta';el('msSummarize').disabled=false;
 finish({ok:true,json:async()=>({supported:true,summary:'Santa Barbara result',meetings:[]})});
 await pending;
 assert.equal(rendered,0);assert.equal(ctx.msLastResult,null);assert.equal(el('msSummarize').disabled,false);
});
