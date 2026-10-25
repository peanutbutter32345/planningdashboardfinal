import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {parseSanLuisObispoCalendar} from '../san-luis-obispo-calendar.js';
const fixture=readFileSync(new URL('./fixtures/san-luis-obispo-calendar.html',import.meta.url),'utf8');
test('SLO reads published local meeting dates and excludes cancellation attachments',()=>{
 const meetings=parseSanLuisObispoCalendar(fixture,'2026-10-25','2026-12-09');
 assert.deepEqual(meetings.map(m=>m.body),['Tree Committee','Cultural Heritage Committee']);
 assert.ok(meetings.every(m=>m.date==='2026-10-26'&&m.time==='5:30 PM'));
 assert.ok(meetings.every(m=>m.agendaUrl.startsWith('https://pub-slocity.escribemeetings.com/Meeting.aspx?')));
 assert.deepEqual(parseSanLuisObispoCalendar(fixture,'2026-10-27','2026-12-09'),[]);
});
test('SLO rejects blocked pages and does not fabricate meetings or agenda links',()=>{
 assert.throws(()=>parseSanLuisObispoCalendar('Access denied','2026-01-01','2026-12-31'),/unavailable/);
 const empty='<div class="upcoming-meetings">There are no upcoming meetings.</div><div class="past-meetings-region">';
 assert.deepEqual(parseSanLuisObispoCalendar(empty,'2026-01-01','2026-12-31'),[]);
 const external=fixture.replaceAll("href='/Meeting.aspx?","href='https://example.com/Meeting.aspx?");
 assert.deepEqual(parseSanLuisObispoCalendar(external,'2026-01-01','2026-12-31'),[]);
});
test('SLO includes city zoning, public participation, named boards, all project topics and boundaries',()=>{
 const m=JSON.parse(readFileSync(new URL('../public/data/coverage/manifest.json',import.meta.url)));
 const c=m.cities.sanluisobispo;
 assert.ok(c.planning.endsWith('/planning-zoning'));
 assert.equal(c.zoningLayers[0].field,'specificZone');
 assert.match(c.zoningLayers[0].url,/mapsa\.slocity\.org.*MapServer\/5$/);
 for(const name of ['City Council','Planning Commission','Active Transportation Committee','Tree Committee'])assert.ok([...c.deciders,...c.join].some(b=>b.name===name),name);
 assert.ok(c.resources.some(r=>r.url.endsWith('/application-handbook')));
 assert.ok(c.resources.some(r=>r.url.endsWith('/agendas-and-minutes')));
 assert.equal(m.meetings.sanluisobispo.calendarFeed,'san-luis-obispo');
 for(const topic of ['housing','transportation','developments'])assert.ok(c.news.some(n=>n.topic===topic),topic);
 const bounds=JSON.parse(readFileSync(new URL('../public/data/coverage/boundaries.json',import.meta.url)));
 for(const key of ['santabarbara','sanluisobispo'])assert.ok(bounds.cities[key].rings.length&&bounds.cities[key].geojson.geometry);
});
test('news categories exclude highway wildfire incidents and include transportation pathways',()=>{
 const result=execFileSync('python3',['-c',`import sys;sys.path.insert(0,'scripts/cal');from topics import *
assert not civic_news('Fire Teams Battling 33-Acre Fire Along Highway 101 Northeast of San Luis Obispo','Local News')
assert not civic_news('Wildfire along Highway 101 prompts evacuations in San Luis Obispo','Local News')
assert civic_news('San Luis Obispo funds wildfire evacuation road improvements','Local News')
assert article_topic('San Luis Obispo approves Bob Jones Pathway extension')=='transportation'
assert article_topic('Santa Barbara updates vacation rental rules')=='housing'
print('ok')`],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
 assert.equal(result.trim(),'ok');
});
test('hero calendar uses the selected city independently of the Get Involved filters',async()=>{
 const vm=await import('node:vm');
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const fn=html.slice(html.indexOf('function giMonthEvents('),html.indexOf('const GI_MONTHS ='));
 const ctx=vm.createContext({giAllBoards:()=>[],giMatchesPlace:()=>false,giOnlyStarred:true,isStarred:()=>false,activeCounty:'',window:{MEETING_DIRECTORY:{}},CITIES:{sanluisobispo:{label:'San Luis Obispo'}},giHearings:{hearings:[{city:'sanluisobispo',body:'Tree Committee',date:'2026-10-26',time:'5:30 PM',agendaUrl:'https://pub-slocity.escribemeetings.com/'}]}});
 vm.runInContext(fn,ctx);
 assert.equal(ctx.giMonthEvents(2026,9,'sanluisobispo').length,1);
 assert.equal(ctx.giMonthEvents(2026,9).length,0);
});
