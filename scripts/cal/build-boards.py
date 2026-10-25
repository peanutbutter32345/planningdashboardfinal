"""Index named public bodies linked by each official directory; never infer vacancies."""
import json,pathlib,urllib.request,urllib.parse,re,datetime,concurrent.futures
from html.parser import HTMLParser
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'public/cal/data';profiles=json.loads((OUT/'profiles.json').read_text())['profiles']
EXCLUDED=set(json.loads((ROOT/'scripts/cal/unavailable-links.json').read_text())['urls'])
class Links(HTMLParser):
 def __init__(self):super().__init__();self.base=None;self.href=None;self.text=[];self.items=[]
 def handle_starttag(self,t,a):
  if t=='base' and self.base is None:self.base=dict(a).get('href')
  if t=='a':self.href=dict(a).get('href');self.text=[]
 def handle_data(self,d):
  if self.href:self.text.append(d)
 def handle_endtag(self,t):
  if t=='a' and self.href:self.items.append((self.href,' '.join(self.text)));self.href=None
source_overrides=json.loads((ROOT/'scripts/cal/sources.json').read_text())['overrides']
cache={}
def one(p):
 url=p['boardUrl']
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (CalCivicDashboard public board directory)'})
  with urllib.request.urlopen(req,timeout=16) as r:text=r.read(1600000).decode('utf-8',errors='replace');final=r.url
  parser=Links();parser.feed(text);bodies=[]
  for href,title in parser.items:
   title=re.sub(r'\s+',' ',title).strip();u=urllib.parse.urljoin(urllib.parse.urljoin(final,parser.base or final),href)
   if re.search(r'/events?/',urllib.parse.urlparse(u).path,re.I):continue
   if u in EXCLUDED:continue
   if not u.startswith('https://') or len(title)>100 or not re.search(r'(?:commission|committee|council|board|authority)$',title,re.I):continue
   if re.search(r'cancelled|canceled|apply|application|agenda|minutes|meeting|report|newsletter|calendar|join|boards? (?:and|&) commissions?|view all|contact|email',title,re.I):continue
   bodies.append({'name':title,'url':u.split('#')[0],'directory':p['name']})
  return p['id'],list({b['name'].lower():b for b in bodies}.values())[:35]
 except:return p['id'],[]
jurisdictions=[p for p in profiles if p['kind']!='community'];byurl={}
for p in jurisdictions:byurl.setdefault(p['boardUrl'],p)
with concurrent.futures.ThreadPoolExecutor(6) as ex:
 for key,items in ex.map(one,byurl.values()):cache[key]=items
land=json.loads((OUT/'land-use.json').read_text())['places'] if (OUT/'land-use.json').exists() else {}
result={}
for p in profiles:
 owner=byurl.get(p['boardUrl']);items=cache.get(owner['id'],[]) if owner else []
 if p['kind']=='community':
  county=next(c for c in profiles if c['kind']=='county' and c['county']==p['county']);owner=byurl.get(county['boardUrl']);items=cache.get(owner['id'],[]) if owner else []
 items=list(items)
 override=source_overrides.get(p['name'],{}) if p['kind']=='city' else {}
 if override.get('boardName') and override.get('boards') not in EXCLUDED:
  items.insert(0,{'name':override['boardName'],'url':override['boards'],'directory':p['name']})
 for r in land.get(p['id'],{}).get('resources',[]):
  if r['url'] not in EXCLUDED and not re.search(r'/events?/',urllib.parse.urlparse(r['url']).path,re.I) and re.search(r'(?:commission|committee|council|board|authority)$',r['title'],re.I) and not re.search(r'cancelled|canceled|apply|application|agenda|minutes|meeting|report|calendar|boards? (?:and|&)',r['title'],re.I):items.append({'name':r['title'],'url':r['url'],'directory':land[p['id']]['authority']})
 result[p['id']]=list({b['name'].lower():b for b in items}.values())
(OUT/'boards.json').write_text(json.dumps({'retrieved':datetime.datetime.now(datetime.timezone.utc).isoformat(),'bodies':result,'note':'Named bodies linked by official government directories. A listing is not evidence of a current vacancy or a scheduled meeting. Open the official body page for membership, applications and current meeting information.'},indent=2));print('Named-body profiles',sum(bool(v) for v in result.values()),'of',len(result),flush=True)
