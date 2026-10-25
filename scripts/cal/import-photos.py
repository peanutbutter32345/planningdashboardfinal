"""Download Wikimedia city photographs with source and license metadata."""
import time,json,urllib.request,urllib.parse,pathlib,concurrent.futures,re,datetime,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'public/cal';geo=json.loads((OUT/'data/geography.json').read_text());CACHE=pathlib.Path('/tmp/cal-civic-cache');HEADERS={'User-Agent':'CalCivicDashboard/1.0 (public civic geography and photo credits)'}
def request(url):
 time.sleep(2)
 with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=25) as r:return r.read(),r.headers.get('content-type','')
def api(host,params):
 url='https://'+host+'/w/api.php?'+urllib.parse.urlencode({**params,'format':'json'});cache=CACHE/('wiki-'+hashlib.sha256(url.encode()).hexdigest()[:18]+'.json')
 if cache.exists():return json.loads(cache.read_text())
 data=json.loads(request(url)[0]);cache.write_text(json.dumps(data));return data
clean=lambda s:re.sub('<[^>]+>','',s or '').replace('&amp;','&')
previous={}
try:previous=json.loads((OUT/'data/photos.json').read_text()).get('photos',{})
except:pass
def one(p):
 if p['id'] in previous:return p['id'],previous[p['id']],None
 name={'El Paso de Robles (Paso Robles)':'Paso Robles','San Buenaventura (Ventura)':'Ventura'}.get(p['name'],p['name'])
 try:
  title=name+', California';data=api('en.wikipedia.org',{'action':'query','redirects':1,'titles':title,'prop':'pageimages','piprop':'thumbnail|name','pithumbsize':1000});page=next(iter(data['query']['pages'].values()))
  if not page.get('pageimage'):raise ValueError('No photograph listed')
  filename=page['pageimage'];commons=api('commons.wikimedia.org',{'action':'query','titles':'File:'+filename,'prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':1000});info=next(iter(commons['query']['pages'].values())).get('imageinfo',[None])[0]
  if not info:raise ValueError('No Commons license record')
  meta=info.get('extmetadata',{});lic=clean(meta.get('LicenseShortName',{}).get('value',''));url=info.get('thumburl') or info['url']
  if not re.search(r'CC|public domain|PD|GFDL',lic,re.I):raise ValueError('License requires review: '+lic)
  raw,ctype=request(url)
  if not ctype.startswith('image/') or len(raw)>2500000:raise ValueError('Invalid image')
  ext='png' if 'png' in ctype else 'webp' if 'webp' in ctype else 'jpg';local='/cal/img/'+p['id']+'.'+ext;(ROOT/('public'+local)).write_bytes(raw)
  photo={'url':local,'caption':name+', California','by':clean(meta.get('Artist',{}).get('value','Wikimedia Commons contributors')),'license':lic,'source':info.get('descriptionurl'),'original':url};print(name,'photo saved',flush=True);return p['id'],photo,None
 except Exception as e:print(name,'photo unavailable',str(e)[:60],flush=True);return p['id'],None,str(e)
photos=previous;failures={}
with concurrent.futures.ThreadPoolExecutor(1) as ex:
 for key,photo,error in ex.map(one,[p for p in geo['places'] if p['kind']=='city']):
  if photo:photos[key]=photo
  if error:failures[key]=error
(OUT/'data/photos.json').write_text(json.dumps({'retrieved':datetime.datetime.now(datetime.timezone.utc).isoformat(),'photos':photos,'failures':failures},indent=2));print('Photos',len(photos),flush=True)
