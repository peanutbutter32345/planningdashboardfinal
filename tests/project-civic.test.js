import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/project-civic.js';
import '../public/project-evidence.js';
import {PROJECTS} from '../data/projects.js';
const civic=globalThis.ProjectCivic;
const now=new Date('2026-11-27T20:00:00Z');
const source='https://city.example/notice';
test('an SB number or an ADU label cannot establish ministerial eligibility',()=>{
  for(const record of [{id:'unknown',fileNo:'SB 35',type:'ADU'},{id:'unknown',flag:'SB 423 ministerial'},{id:'unknown',approvalProcess:{kind:'ministerial',sourceUrl:'javascript:alert(1)'}}])assert.equal(civic.profile(record).kind,'unknown');
  const p=civic.profile({id:'known',approvalProcess:{kind:'ministerial',sourceUrl:source}});assert.equal(p.kind,'ministerial');
});
test('deadline calculations preserve time zones and do not assume midnight for date-only notices',()=>{
  const base={kind:'comment',sourceUrl:source,submitUrl:source};
  assert.match(civic.deadline({...base,at:'2026-12-03T11:00:00-08:00'},now).text,/6 days/);
  assert.match(civic.deadline({...base,at:'2026-11-28'},now).text,/1 day; confirm/);
  assert.equal(civic.deadline({...base,at:'2026-11-27'},now).state,'today');
  assert.equal(civic.deadline({...base,at:'2025-03-04T11:00:00-08:00'},now).state,'closed');
  assert.equal(civic.deadline({...base,at:'2026-12-03T11:00:00'},now),null);
  assert.equal(civic.deadline({...base,at:'2026-12-03',submitUrl:undefined},now),null);
});
test('meeting matching requires an actual project ID, not a similarly named street',()=>{
  const record={id:'one',addr:'50 Main Street'};
  const feed={hearings:[{date:'2026-12-02',matters:[{title:'50 Main Street',projects:[]}]},{date:'2026-12-01',matters:[{projects:[{id:'one'}]}]},{date:'2026-11-20',matters:[{projects:[{id:'one'}]}]}]};
  assert.equal(civic.matchedHearings(record,feed,now).length,1);
  assert.equal(civic.matchedHearings(record,feed,now)[0].date,'2026-12-01');
});
test('Lodge facts, dated decisions and closed historical comments use their actual sources',()=>{
  const record=PROJECTS.find(p=>p.id==='lg-50-los-gatos'),p=civic.profile(record);
  assert.equal(record.units,155);assert.equal(record.applicant,'SummerHill Homes');assert.match(record.desc,/Los Gatos High School/);
  assert.deepEqual(p.milestones.map(m=>m.date),['2025-02-12','2025-03-04']);
  assert.equal(p.kind,'limited');assert.match(p.explanation,/little room to say no/);
  assert.ok(p.facts.some(f=>f.sourceUrl.includes('41142')));
  assert.ok(p.facts.some(f=>f.label==='Meeting video'));
  assert.equal(civic.deadline(p.deadlines[0],now).state,'closed');
  assert.equal(p.milestones.some(m=>m.step==='permit'),false,'approval must not invent a building permit');
});
test('the whole Town tracker is imported with separate expired applications and no guessed pins',()=>{
  const ids=Object.keys(globalThis.PROJECT_EVIDENCE).filter(id=>id.startsWith('lg-'));
  assert.equal(ids.length,26);assert.equal(new Set(ids).size,26);
  const rows=ids.map(id=>PROJECTS.find(p=>p.id===id));assert.ok(rows.every(Boolean));
  assert.ok(rows.some(p=>p.stage==='inactive'));
  assert.ok(rows.some(p=>p.addr==='178 Twin Oaks Dr'&&p.lat===null&&p.lng===null));
});
test('Scofield keeps both dated histories and the current undated city table',()=>{
  const p=civic.profile(PROJECTS.find(p=>p.id==='cu-scofield'));
  assert.equal(p.conflicts.length,2);assert.equal(p.conflicts[0].date,'2025-01-09');assert.equal(p.conflicts[1].date,null);
  assert.match(p.conflicts[1].status,/In Review/);assert.match(p.conflicts[0].sourceUrl,/20783-scofield/);
});
test('coverage and check dates do not claim completeness or recency from a record count',()=>{
  assert.equal(civic.coverage({data:Array(1000).fill({})}).kind,'partial');
  assert.equal(civic.coverage({data:[]}).kind,'directory');
  assert.equal(civic.coverage({coverageComplete:true,data:[]}).kind,'directory');
  assert.equal(civic.profile({id:'unverified',lastDate:'2026-11-27'}).checkedAt,null);
  assert.equal(civic.coverage({coverageComplete:true,coverageSource:source}).kind,'complete');
});
test('source text and URLs are escaped; unsafe protocols never become links',()=>{
  const html=civic.details({id:'unsafe',addr:'<img>',sourceUrl:'javascript:alert(1)',participation:{sourceUrl:source,methods:'<script>bad</script>'}},{label:'Test',data:[]});
  assert.doesNotMatch(html,/<script>|href="javascript:/);assert.match(html,/&lt;script&gt;/);
  assert.match(civic.label({addr:'Lodge',units:155,type:'Residential'},'Approved'),/Lodge, 155 homes, Approved/);
});

test('public-review countdowns use verified public dates and preserve unknown cutoff times',()=>{
  const rows=PROJECTS.filter(p=>globalThis.PROJECT_EVIDENCE[p.id]?.deadlines?.some(d=>d.at==='2026-11-30'));
  assert.ok(rows.length>0);
  const p=civic.profile(rows[0]);const d=civic.deadline(p.deadlines.find(d=>d.at==='2026-11-30'),now);
  assert.match(d.text,/3 days; confirm the cutoff time/);
  assert.match(d.item.sourceUrl,/ceqanet/);
  assert.equal(civic.deadline({at:'2026-02-30',sourceUrl:source,submitUrl:source},now),null);
});
