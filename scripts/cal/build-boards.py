"""Index named public bodies linked by each official directory; never infer vacancies."""
import json,pathlib,urllib.request,urllib.parse,re,datetime,concurrent.futures
from html.parser import HTMLParser
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'public/cal/data';profiles=json.loads((OUT/'profiles.json').read_text())['profiles']
class Links(HTMLParser):
 def __init__(self):super().__init__();self.href=None;self.text=[];self.items=[]
 def handle_starttag(self,t,a):
  if t=='a':self.href=dict(a).get('href');self.text=[]
 def handle_data(self,d):
  if self.href:self.text.append(d)
 def handle_endtag(self,t):
  if t=='a' and self.href:self.items.append((self.href,' '.join(self.text)));self.href=None
cache={}
def one(p):
 url=p['boardUrl']
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (CalCivicDashboard public board directory)'})
  with urllib.request.urlopen(req,timeout=16) as r:text=r.read(1600000).decode('utf-8',errors='replace');final=r.url
  parser=Links();parser.feed(text);bodies=[]
  for href,title in parser.items:
   title=re.sub(r'\s+',' ',title).strip();u=urllib.parse.urljoin(final,href)
   if not u.startswith('https://') or len(title)>100 or not re.search(r'(?:commission|committee|council|board|authority)$',title,re.I):continue
   if re.search(r'apply|application|agenda|minutes|meeting|report|newsletter|calendar|join|boards? (?:and|&) commissions?|view all|contact|email',title,re.I):continue
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
 for r in land.get(p['id'],{}).get('resources',[]):
  if re.search(r'(?:commission|committee|council|board|authority)$',r['title'],re.I) and not re.search(r'apply|application|agenda|minutes|meeting|report|calendar|boards? (?:and|&)',r['title'],re.I):items.append({'name':r['title'],'url':r['url'],'directory':land[p['id']]['authority']})
 result[p['id']]=list({b['name'].lower():b for b in items}.values())
(OUT/'boards.json').write_text(json.dumps({'retrieved':datetime.datetime.now(datetime.timezone.utc).isoformat(),'bodies':result,'note':'Named bodies linked by official government directories. A listing is not evidence of a current vacancy or a scheduled meeting. Open the official body page for membership, applications and current meeting information.'},indent=2));print('Named-body profiles',sum(bool(v) for v in result.values()),'of',len(result),flush=True)
