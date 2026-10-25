"""Discover land-use and public-record links from each responsible agency's published pages.

No neighboring city substitutes. Communities inherit the county land-use authority.
Only verified polygon services reached through official pages become map overlays.
Use --fresh to revisit cached pages. Re-run after build-resources.py.
"""
import json,pathlib,urllib.request,urllib.parse,re,datetime,concurrent.futures,hashlib,sys
from html.parser import HTMLParser
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'public/cal/data';CACHE=pathlib.Path('/tmp/cal-civic-cache');FRESH='--fresh' in sys.argv
profiles=json.loads((OUT/'profiles.json').read_text())['profiles']
EXCLUDED=set(json.loads((ROOT/'scripts/cal/unavailable-links.json').read_text())['urls'])
SEEDS=json.loads((ROOT/'scripts/cal/land-use-seeds.json').read_text())
patterns={
 'Zoning':r'\bzoning\b|zone map|land.?use (?:map|view)',
 'General plan':r'general plan|comprehensive plan|specific plans?',
 'Municipal code':r'municipal code|code of ordinances|\bordinances\b|zoning (?:code|ordinance)|development code|city code|county code|ordinance code',
 'Projects':r'current projects|development (?:projects|activity)|major projects|project (?:list|map|tracker)|planning projects',
 'Capital projects':r'capital improvement|capital projects|public works projects|construction projects|street projects|\bCIP\b|engineering projects',
 'Housing':r'housing element|affordable housing|housing programs',
 'Boards':r'boards? (?:and|&)|commissions|planning commission|committees|^city council$|board of supervisors',
 'Meetings':r'agenda|meeting (?:calendar|schedule)|public hearing|watch.*meeting',
 'News':r'newsroom|city news|county news|press release|news flash|news center',
 'Contact':r'contact (?:us|planning)|staff directory|department directory|^contact$',
 'GIS':r'\bgis\b|interactive map|mapping (?:system|portal)|parcel (?:map|viewer)'
}
class Links(HTMLParser):
 def __init__(self):super().__init__();self.base=None;self.items=[];self.href=None;self.text=[]
 def handle_starttag(self,t,a):
  if t=='base' and self.base is None:self.base=dict(a).get('href')
  if t=='a':self.href=dict(a).get('href');self.text=[]
 def handle_data(self,d):
  if self.href:self.text.append(d)
 def handle_endtag(self,t):
  if t=='a' and self.href:self.items.append((self.href,re.sub(r'\s+',' ',' '.join(self.text)).strip()));self.href=None

def get(url,js=False):
 key=CACHE/('land-v2-'+hashlib.sha256(url.encode()).hexdigest()[:24]+'.json')
 if key.exists() and not FRESH:
  cached=json.loads(key.read_text())
  if cached.get('status')==200 and not cached.get('data',{}).get('error'):return cached
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (public civic records index)'}),timeout=12) as r:
   raw=r.read(2500000).decode('utf-8',errors='replace');final=r.url
  if js:d={'data':json.loads(raw),'status':200}
  else:
   p=Links();p.feed(raw);links=[]
   for h,t in p.items:
    u=urllib.parse.urljoin(urllib.parse.urljoin(final,p.base or final),h).split('#')[0]
    if u not in EXCLUDED and u.startswith('https://') and 2<len(t)<170:links.append({'title':t,'url':u})
   d={'links':list({(l['url'],l['title']):l for l in links}.values()),'status':200}
 except Exception as e:d={'status':str(e)[:120],'links':[]}
 key.write_text(json.dumps(d));return d

def layer(url):
 meta=get(url+'?f=json',True).get('data',{})
 title=meta.get('name','')
 if meta.get('geometryType')!='esriGeometryPolygon' or not re.search(r'zon|land.?use',title,re.I) or re.search(r'fire|flood|inspection|evac|school|noise|hazard|seismic|airport|safety|historic|history|1989|draft|text|excluding|management area',title,re.I):return None
 fields=meta.get('fields',[]);field=next((f['name'] for f in fields if re.search(r'^(zone|zone_name|zoning|zonecode|zone_code|zoneclass|zoningcode|zoning_code|zonedist|zone_district|zoning_district|landuse|land_use|lu_code|luc|zn_cd1|zone_desig|zonecd|zoning_cd|ZoneAbbreviation|ZoneCodeLabel|ZONING_SYMBOL|Zone2030|specificZone)$',f['name'],re.I)),None)
 if not field:return None
 q=urllib.parse.urlencode({'where':'1=1','outFields':field,'returnGeometry':'false','resultRecordCount':3,'f':'json'})
 sample=get(url+'/query?'+q,True).get('data',{})
 if not sample.get('features'):return None
 return {'url':url,'field':field,'name':title,'description':re.sub('<[^>]+>',' ',meta.get('description',''))[:700],'copyright':meta.get('copyrightText',''),'checked':datetime.datetime.now(datetime.timezone.utc).isoformat()}

def one(p):
 extras=SEEDS.get(p['name'],[])
 seeds=[r['url'] for r in extras]+[p['website']]+[r['url'] for r in p['resources'] if r['category'] in ['Planning','Projects','Boards'] and r['scope'] in ['city','county']][:4]
 # A county planning link reached through a city footer is not city zoning authority.
 county_domains={urllib.parse.urlparse(c['website']).hostname.removeprefix('www.') for c in profiles if c['kind']=='county'}
 county_domains.update(['slocounty.ca.gov','countyofsb.org','venturacounty.gov'])
 def responsible(url):
  host=urllib.parse.urlparse(url).hostname or ''
  return p['kind']!='city' or not any(host==d or host.endswith('.'+d) for d in county_domains)
 links=[];checks={}
 for u in dict.fromkeys(u for u in seeds if responsible(u)):
  d=get(u);checks[u]=d['status'];links+=d.get('links',[])
 follow=[l['url'] for l in links if re.search(r'zoning|general plan|municipal code|\bgis\b|current projects|planning commission|public works|engineering|boards|commissions|community development',l['title'],re.I) and not re.search(r'\.pdf|\.doc|\.jpg',l['url'],re.I)]
 for u in list(dict.fromkeys(u for u in follow if responsible(u)))[:9]:
  d=get(u);checks[u]=d['status'];links+=d.get('links',[])
 result=[{**r,'scope':'city' if p['kind']=='city' else 'county','authority':p['name']} for r in extras]
 for category,pattern in patterns.items():
  matches=[l for l in links if responsible(l['url']) and re.search(pattern,l['title'],re.I) and not re.search(r'login|sign in|subscribe|facebook|twitter'+(r'|county' if p['kind']=='city' else ''),l['title'],re.I)]
  for l in list({l['url']:l for l in sorted(matches,key=lambda x:len(x['title']))}.values())[:8]:result.append({**l,'category':category,'scope':'city' if p['kind']=='city' else 'county','authority':p['name']})
 # Traverse only map apps/services actually linked by the agency, not search-result guesses.
 candidates=set();items=set()
 for l in links+extras:
  u=l['url']
  for m in re.finditer(r'https://[^\s?"<>]+/(?:FeatureServer|MapServer)(?:/\d+)?',u,re.I):candidates.add(m.group())
  if 'arcgis' in u or 'experience' in u:
   for m in re.finditer(r'(?:id|appid|webmap)=([a-f0-9]{32})|/items/([a-f0-9]{32})|/experience/([a-f0-9]{32})',u,re.I):items.add(next(g for g in m.groups() if g))
 pending=list(sorted(items));visited=set()
 def walk(v):
  if isinstance(v,dict):
   for k,x in v.items():
    if isinstance(x,str) and k.lower() in ['itemid','webmap','webmapid','mapid'] and re.fullmatch('[a-f0-9]{32}',x):pending.append(x)
    if k=='url' and isinstance(x,str) and re.search(r'/(?:FeatureServer|MapServer)',x):candidates.add(x.split('?')[0])
    else:walk(x)
  elif isinstance(v,list):
   for x in v:walk(x)
 owners=set()
 while pending and len(visited)<12:
  item=pending.pop(0)
  if item in visited:continue
  visited.add(item)
  info=get('https://www.arcgis.com/sharing/rest/content/items/'+item+'?f=json',True).get('data',{})
  # Only city-labelled apps establish a city GIS account, not linked county portals.
  label=' '.join(str(info.get(k) or '') for k in ['title','description','snippet'])
  cityname=p['name'].split(' (')[0]
  if cityname.lower() in label.lower() and (p['kind']!='city' or not re.search(r'county.*zoning',info.get('title',''),re.I)) and info.get('owner'):owners.add(info['owner'])
  for suffix in ['', '/data']:
   walk(get('https://www.arcgis.com/sharing/rest/content/items/'+item+suffix+'?f=json',True).get('data',{}))
 overlays=[]
 domain=urllib.parse.urlparse(p['website']).hostname.removeprefix('www.')
 explicit={r['url'] for r in extras if r['category']=='GIS'}
 for u in sorted(candidates,key=lambda u:(u not in explicit,not bool(re.search('zon|landuse|land_use|pln_web',u,re.I)),u))[:16]:
  host=urllib.parse.urlparse(u).hostname or ''
  if p['kind']=='city' and not(host==domain or host.endswith('.'+domain) or any(u==v or u.startswith(v+'/') for v in explicit)):
   service=re.sub(r'/\d+$','',u);meta=get(service+'?f=json',True).get('data',{});item=meta.get('serviceItemId');owner=get('https://www.arcgis.com/sharing/rest/content/items/'+item+'?f=json',True).get('data',{}).get('owner') if item else None
   if not owner or owner not in owners:continue
  if re.search(r'/\d+$',u):
   entry=layer(u)
   if entry:overlays.append(entry)
  else:
   meta=get(u+'?f=json',True).get('data',{})
   for l in meta.get('layers',[]):
    if re.search(r'zon|land.?use',l.get('name',''),re.I):
     entry=layer(u+'/'+str(l['id']))
     if entry:overlays.append(entry)
 overlays.sort(key=lambda l:(not bool(re.fullmatch(r'zoning|.*_zoning|Zone Designation|Zoning Graphic|Land Use Outlines',l['name'],re.I)),len(l['name'])))
 return p['id'],{'authority':p['name'],'resources':list({(r['url'],r['category']):r for r in result}.values()),'layers':list({l['url'].lower():l for l in overlays}.values()),'checks':checks}

previous=json.loads((OUT/'land-use.json').read_text()).get('places',{}) if (OUT/'land-use.json').exists() else {}
data={p['id']:previous[p['id']] for p in profiles if p['id'] in previous}
refresh_names=set(next((a.split('=',1)[1].split('|') for a in sys.argv if a.startswith('--places=')),[]))
jurisdictions=[p for p in profiles if p['kind']!='community' and (FRESH or p['id'] not in previous or p['name'] in refresh_names)]
with concurrent.futures.ThreadPoolExecutor(6) as ex:
 for key,value in ex.map(one,jurisdictions):data[key]=value;print(key,value['authority'],len(value['resources']),'links',len(value['layers']),'polygon layers',flush=True)
for p in profiles:
 if p['kind']=='community':
  county=next(c for c in profiles if c['kind']=='county' and c['county']==p['county']);data[p['id']]=data[county['id']]
# WordPress download refresh tokens expire; keep the stable document selector.
for entry in data.values():
 entry['layers']=list({l['url'].lower():l for l in entry.get('layers',[])}.values())
 entry['resources']=[r for r in entry['resources'] if r['url'] not in EXCLUDED]
 for r in entry['resources']:
  r['url']=r['url'].replace('https://www.municode.com/library/ca/kingsburg/','https://library.municode.com/ca/kingsburg/').replace('https://www.municode.com/library/ca/parlier/','https://library.municode.com/ca/parlier/')
  u=urllib.parse.urlsplit(r['url'])
  if u.hostname=='reedley.ca.gov' and u.path.startswith('/download/'):
   r['url']=urllib.parse.urlunsplit(u._replace(query=urllib.parse.urlencode([(k,v) for k,v in urllib.parse.parse_qsl(u.query) if k!='refresh'])))
(OUT/'land-use.json').write_text(json.dumps({'retrieved':datetime.datetime.now(datetime.timezone.utc).isoformat(),'places':data,'note':'Links discovered on the responsible agency’s own pages. A directory link does not mean every record has been imported. Communities use county land-use authority. Polygon layers are only included after a successful official metadata and attribute query. Map display is informational; confirm zoning and overlays with the local planning department.'},indent=2))
print('Total',sum(len(v['resources']) for v in data.values()),'links;',sum(bool(v['layers']) for v in data.values()),'profiles with verified polygon services',flush=True)
