// Use the dashboard's own calculations over complete records, even before a city is loaded.
import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
import '../../public/housing-data.js';
const root=new URL('../../public/data/coverage/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',root)));
const html=readFileSync(new URL('../../public/index.html',import.meta.url),'utf8');
const start=html.indexOf('function cityFacts(key){'),end=html.indexOf('\n}\n',start)+2;
const CITIES=Object.fromEntries(Object.entries(manifest.cities).map(([key,c])=>[key,{...c,coverageFacts:null,data:JSON.parse(readFileSync(new URL(key+'.json',root))).records}]));
const calculate=vm.runInNewContext(html.slice(start,end)+';cityFacts',{CITIES,DashboardHousing:globalThis.DashboardHousing,median:a=>a.length?[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)]:null});
for(const key of Object.keys(manifest.cities))manifest.cities[key].coverageFacts=calculate(key);
writeFileSync(new URL('manifest.json',root),JSON.stringify(manifest)+'\n');
writeFileSync(new URL('manifest.js',root),'/* Sourced coverage expansion; existing BayDashboard renderers and styling. */\nwindow.COVERAGE_EXPANSION='+JSON.stringify(manifest)+';\n');
