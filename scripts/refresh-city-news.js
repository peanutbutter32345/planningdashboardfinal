// Public RSS headlines link through to the publisher; article text is not copied.
import {readFileSync,writeFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync('public/data/municipalities.json'));
const decode=s=>String(s||'').replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/,'$1').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const tag=(s,name)=>decode(s.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>'))?.[1]);
const previous=(()=>{try{return JSON.parse(readFileSync('public/data/city-news.json'));}catch{return [];}})();
const articles=previous.filter(n=>n.kind!=='reporting');
const failures=[];
async function one(city){
 const url='https://news.google.com/rss/search?'+new URLSearchParams({q:'"'+city.label+'" "'+city.county+'" California (housing OR development OR planning OR transit OR "city council") when:180d',hl:'en-US',gl:'US',ceid:'US:en'});
 try{
  const response=await fetch(url,{signal:AbortSignal.timeout(18000)});if(!response.ok)throw Error('HTTP '+response.status);const xml=await response.text();
  let count=0;
  const matches=[...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].sort((a,b)=>Date.parse(tag(b[1],'pubDate'))-Date.parse(tag(a[1],'pubDate')));
  const placePattern=new RegExp('(^|[^a-z])'+city.label.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^a-z]|$)','i');
  for(const match of matches){
   const item=match[1],publisher=tag(item,'source'),raw=tag(item,'title');let title=raw.endsWith(' - '+publisher)?raw.slice(0,-publisher.length-3):raw;
   const published=new Date(tag(item,'pubDate')),link=tag(item,'link');
   if(!placePattern.test(title)||!/housing|homes|development|planning|zoning|council|apartment|transit|rail|bus\b|affordable|construction|commission|road|bridge|budget|permit|infrastructure|redevelop|land use|station/i.test(title)||/obituar|legacy|newswire|business wire|real estate agent/i.test(title+' '+publisher)||!publisher||!Number.isFinite(+published)||+published>Date.now()||!link.startsWith('https://news.google.com/'))continue;
   if(title.split(/\s+/).length>25)title=title.split(/\s+/).slice(0,24).join(' ')+'…';
   const topic=/hous|apartmen|affordable|\badu\b|rent|homes/i.test(title)?'housing':/transit|rail|bus|bike|transport|street|traffic/i.test(title)?'transportation':/develop|building|construct|zoning/i.test(title)?'developments':'civic';
   articles.push({city:city.key,topic,title,snippet:'Reporting from '+publisher+'. Open the original story through Google News for the full reporting and publication context.',source:publisher,date:published.toISOString().slice(0,10),url:link,kind:'reporting',feed:url,reviewed:new Date().toISOString().slice(0,10)});
   if(++count===6)break;
  }
  console.log(city.label,count);
 }catch(e){failures.push(city.key);articles.push(...previous.filter(n=>n.city===city.key&&n.kind==='reporting'));console.log(city.label,'retained previous headlines:',e.message);}
}
for(let i=0;i<catalog.cities.length;i+=4)await Promise.all(catalog.cities.slice(i,i+4).map(one));
const unique=[...new Map(articles.map(a=>[a.city+':'+a.url,a])).values()];
writeFileSync('public/data/city-news.json',JSON.stringify(unique,null,2)+'\n');
writeFileSync('public/data/city-news.js','// Public publisher headlines and official city announcements.\nwindow.CITY_NEWS = '+JSON.stringify(unique)+';\n');
console.log(unique.length+' headlines in '+new Set(unique.map(n=>n.city)).size+' cities; '+failures.length+' feed failures.');
