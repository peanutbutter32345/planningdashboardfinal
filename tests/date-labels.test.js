import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const start=html.indexOf('function daysUntil('),end=html.indexOf('function prettyDate(',start);
const {daysUntil,whenLabel}=vm.runInNewContext(html.slice(start,end)+';({daysUntil,whenLabel})');
test('meeting day labels use California dates without a noon rounding offset',()=>{
 const now=new Date('2026-09-20T06:00:00Z');
 assert.equal(whenLabel(daysUntil('2026-09-19',now)),'today');
 assert.equal(whenLabel(daysUntil('2026-09-20',now)),'tomorrow');
 assert.equal(whenLabel(daysUntil('2026-09-18',now)),'past');
 assert.equal(daysUntil('2026-11-02',new Date('2026-11-01T08:30:00Z')),1);
});
