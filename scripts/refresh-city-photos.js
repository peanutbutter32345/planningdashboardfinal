import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('public/index.html','utf8');
const original=vm.runInNewContext(html.slice(html.indexOf('const CITY_PHOTOS ='),html.indexOf('Object.assign(CITY_PHOTOS,'))+';CITY_PHOTOS');
const regions=JSON.parse(readFileSync('public/data/regions.json','utf8'));
const headers={'User-Agent':'SouthBayDashboard/1.0 (https://southbaydashboard.com; city imagery with attribution)'};
const clean=s=>String(s||'').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&');
mkdirSync('public/img/cities',{recursive:true});
let photos={};try{photos=JSON.parse(readFileSync('public/data/city-photos.json'));}catch{}
async function get(url){const r=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(r.status+' '+url);return r;}
const keys=[...Object.keys(original),...Object.keys(regions.cities)];
for(const key of keys){
 if(photos[key]&&existsSync('public'+photos[key].url))continue;
 try{
  let p=original[key];
  if(!p){
   const label=regions.cities[key].label;const title=label==='San Francisco'?label:label+', California';
   const j=await(await get('https://en.wikipedia.org/w/api.php?action=query&titles='+encodeURIComponent(title)+'&prop=pageimages&piprop=thumbnail%7Cname&pithumbsize=1000&format=json')).json();
   const page=Object.values(j.query.pages)[0];if(!page.thumbnail)throw Error('No city photo');
   const cj=await(await get('https://commons.wikimedia.org/w/api.php?action=query&titles='+encodeURIComponent('File:'+page.pageimage)+'&prop=imageinfo&iiprop=url%7Cextmetadata&format=json')).json();
   const info=Object.values(cj.query.pages)[0].imageinfo?.[0];const meta=info?.extmetadata||{};
   p={url:page.thumbnail.source,cap:label+' · city view',by:clean(meta.Artist?.value)||'Wikimedia Commons contributors',lic:clean(meta.LicenseShortName?.value)||'See source license',source:info?.descriptionurl||'https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(page.pageimage)};
  }
  const r=await get(p.url);const type=r.headers.get('content-type');if(!type?.startsWith('image/'))throw Error('Not an image');
  const ext=type.includes('png')?'png':type.includes('webp')?'webp':'jpg';
  const local='/img/cities/'+key+'.'+ext;writeFileSync('public'+local,Buffer.from(await r.arrayBuffer()));
  photos[key]={...p,originalUrl:p.url,url:local};console.log(key,'saved');
 }catch(e){console.log(key,e.message.slice(0,160));}
 writeFileSync('public/data/city-photos.json',JSON.stringify(photos,null,2)+'\n');
}
writeFileSync('public/data/city-photos.js','// Photo credits and locally served city images.\nwindow.LOCAL_CITY_PHOTOS = '+JSON.stringify(photos)+';\n');
