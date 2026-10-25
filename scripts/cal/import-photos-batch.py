"""Batch metadata requests to Wikimedia and honor rate limits while filling city portraits."""
import json,urllib.request,urllib.parse,urllib.error,pathlib,time,re,datetime
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'public/cal';geo=json.loads((OUT/'data/geography.json').read_text());HEADERS={'User-Agent':'CalCivicDashboard/1.0 public geography project'};photos=json.loads((OUT/'data/photos.json').read_text())['photos'];failures={}
def get(url):
 for attempt in range(3):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=30) as r:return r.read(),r.headers.get('content-type','')
  except urllib.error.HTTPError as e:
   if e.code!=429 or attempt==2:raise
   wait=min(180,max(30,int(e.headers.get('Retry-After','60'))));print('Rate limit: waiting',wait,'seconds',flush=True);time.sleep(wait)
def api(host,params):
 time.sleep(5);return json.loads(get('https://'+host+'/w/api.php?'+urllib.parse.urlencode({**params,'format':'json'}))[0])
clean=lambda s:re.sub('<[^>]+>','',s or '').replace('&amp;','&')
missing=[p for p in geo['places'] if p['kind']=='city' and p['id'] not in photos]
for offset in range(0,len(missing),40):
 batch=missing[offset:offset+40];name=lambda p:{'El Paso de Robles (Paso Robles)':'Paso Robles','San Buenaventura (Ventura)':'Ventura'}.get(p['name'],p['name'])
 titles={name(p)+', California':p for p in batch}
 try:
  wiki=api('en.wikipedia.org',{'action':'query','redirects':1,'titles':'|'.join(titles),'prop':'pageimages','piprop':'name'})
  redirects={r['from']:r['to'] for r in wiki['query'].get('redirects',[])};files={}
  for title,p in titles.items():
   target=redirects.get(title,title);page=next((x for x in wiki['query']['pages'].values() if x['title']==target),None)
   if page and page.get('pageimage'):files['File:'+page['pageimage']]=p
  commons=api('commons.wikimedia.org',{'action':'query','titles':'|'.join(files),'prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':800})
  for page in commons['query']['pages'].values():
   p=next((v for k,v in files.items() if k.replace('_',' ')==page['title'].replace('_',' ')),None);info=page.get('imageinfo',[None])[0]
   if not p or not info:continue
   meta=info.get('extmetadata',{});lic=clean(meta.get('LicenseShortName',{}).get('value',''))
   if not re.search('CC|public domain|PD|GFDL',lic,re.I):continue
   try:
    time.sleep(1);url=info.get('thumburl') or info['url'];raw,ctype=get(url)
    if not ctype.startswith('image/') or len(raw)>2500000:continue
    ext='png' if 'png' in ctype else 'webp' if 'webp' in ctype else 'jpg';local='/cal/img/'+p['id']+'.'+ext;(ROOT/('public'+local)).write_bytes(raw)
    photos[p['id']]={'url':local,'caption':name(p)+', California','by':clean(meta.get('Artist',{}).get('value','Wikimedia Commons contributors')),'license':lic,'source':info['descriptionurl'],'original':url};print(p['name'],'photo saved',flush=True)
   except Exception as e:failures[p['id']]=str(e)
 except Exception as e:print('Batch failed',e,flush=True)
 (OUT/'data/photos.json').write_text(json.dumps({'retrieved':datetime.datetime.now(datetime.timezone.utc).isoformat(),'photos':photos,'failures':failures},indent=2))
print('Photos',len(photos),flush=True)
