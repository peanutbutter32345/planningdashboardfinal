// Rebuild the public locality-by-locality evidence report from the actual API logic.
import express from 'express';
import {writeFileSync} from 'node:fs';
import {registerCalDashboard} from '../../cal-dashboard.js';
const app=express();registerCalDashboard(app);const server=app.listen(0);await new Promise(resolve=>server.once('listening',resolve));
try{
 const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/cal/coverage');if(!response.ok)throw Error('Coverage API failed');const data=await response.json();
 const summary={profiles:data.places.length,cities:data.places.filter(p=>p.kind==='city').length,features:{}};
 for(const feature of data.places[0].features){const counts={imported:0,live:0,directory:0,lookup:0,unavailable:0};for(const p of data.places)counts[p.features.find(f=>f.key===feature.key).status]++;summary.features[feature.key]={label:feature.label,...counts};}
 const report={generated:new Date().toISOString(),reference:data.reference,summary,places:data.places};
 writeFileSync(new URL('../../public/cal/data/coverage-audit.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 const missingCore=data.places.filter(p=>p.kind==='city'&&p.features.some(f=>['housing','environmentalRecords'].includes(f.key)&&f.status!=='imported'));
 console.log(JSON.stringify(summary,null,2));if(missingCore.length)throw Error('Missing core city records: '+missingCore.map(p=>p.name).join(', '));
}finally{await new Promise(resolve=>server.close(resolve));}
