// The requested Lighthouse/axe audit runs against local preview only, in a fresh private context.
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import puppeteer from 'puppeteer-core';
import {startFlow} from 'lighthouse';
const require=createRequire(import.meta.url);
const base=process.argv.find(a=>a.startsWith('--base='))?.slice(7)||'http://127.0.0.1:4027';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('Run this audit against a local preview, not production accounts.');
const output=process.argv.find(a=>a.startsWith('--output='))?.slice(9)||'/tmp/civic-accessibility';
const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--no-sandbox']});
const context=await browser.createBrowserContext();
const page=await context.newPage();
await page.setViewport({width:1280,height:900});
const flow=await startFlow(page,{name:'Civic project accessibility',config:{extends:'lighthouse:default',settings:{onlyCategories:['accessibility']}}});
const axe=[];
async function audit(name){
  await flow.snapshot({name});
  if(!await page.evaluate(()=>Boolean(window.axe)))await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const result=await page.evaluate(async()=>await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice']}}));
  axe.push({name,url:page.url(),version:result.testEngine.version,violations:result.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:result.incomplete.map(v=>({id:v.id,nodes:v.nodes.length}))});
}
try{
  await page.goto(base,{waitUntil:'networkidle2'});
  await audit('First visit setup');
  await page.click('#onboardExplore');
  await page.select('#railCitySelect','losgatos');
  await page.type('#search','Los Gatos Lodge');
  await page.waitForFunction(()=>document.querySelector('#projectResultsAnnouncement')?.textContent.includes('1 mapped projects match'));
  await page.$eval('#explore',e=>e.scrollIntoView());
  await page.waitForSelector('#map .project-pin');
  await audit('Lodge map and mirrored list');
  await page.focus('#mapProjectList button');await page.keyboard.press('Enter');
  await page.waitForSelector('#projectParticipation');
  await audit('Lodge project participation');
  await page.keyboard.press('Escape');
  await page.select('#railCitySelect','cupertino');
  await page.$eval('#search',e=>{e.value='';});await page.type('#search','20739 Scofield');
  await page.waitForSelector('#registerGrid [data-more="cu-scofield"]');
  await page.click('#registerGrid [data-more="cu-scofield"]');
  await audit('Scofield source disagreement');
  await page.keyboard.press('Escape');
  await page.setViewport({width:390,height:844});
  await page.select('#railCitySelect','losgatos');
  await page.$eval('#search',e=>{e.value='';});await page.type('#search','Los Gatos Lodge');
  await page.waitForSelector('#registerGrid [data-more="lg-50-los-gatos"]');
  await page.click('#registerGrid [data-more="lg-50-los-gatos"]');
  await audit('Mobile participation, 390px');
  await fs.writeFile(output+'-lighthouse.html',await flow.generateReport());
  const result=await flow.createFlowResult();await fs.writeFile(output+'-lighthouse.json',JSON.stringify(result,null,2));
  await fs.writeFile(output+'-axe.json',JSON.stringify(axe,null,2));
  console.log(JSON.stringify({lighthouse:result.steps.map(s=>({name:s.name,score:s.lhr.categories.accessibility.score,failed:Object.values(s.lhr.audits).filter(a=>a.score===0).map(a=>a.id)})),axe:axe.map(a=>({name:a.name,violations:a.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length}))}))},null,2));
}finally{await context.close();await browser.close();}
