"""Build local-government resource profiles from curated official homepages and their links."""
import sys
FRESH="--fresh" in sys.argv

import json,urllib.request,urllib.parse,pathlib,concurrent.futures,datetime,re,hashlib,html
from html.parser import HTMLParser
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'public/cal/data';CACHE=pathlib.Path('/tmp/cal-civic-cache');sources=json.loads((ROOT/'scripts/cal/sources.json').read_text());geo=json.loads((OUT/'geography.json').read_text())
class Links(HTMLParser):
 def __init__(self):super().__init__();self.links=[];self.base=None;self.href=None;self.text=[]
 def handle_starttag(self,t,attrs):
  if t=='base' and not self.base:self.base=dict(attrs).get('href')
  if t=='a':self.href=dict(attrs).get('href');self.text=[]
 def handle_data(self,d):
  if self.href:self.text.append(d)
 def handle_endtag(self,t):
  if t=='a' and self.href:self.links.append((self.href,' '.join(self.text).strip()));self.href=None
checks={}
def crawl(url):
 cache=CACHE/('html-'+hashlib.sha256(url.encode()).hexdigest()[:18]+'.json')
 if cache.exists() and not FRESH:d=json.loads(cache.read_text());checks[url]=d['status'];return d['links']
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; CalCivicDashboard public resource index)'})
  with urllib.request.urlopen(req,timeout=18) as r:
   final=r.url;body=r.read(1800000).decode('utf-8',errors='replace');status=r.status
  parser=Links();parser.feed(body);links=[]
  for href,title in parser.links:
   link=urllib.parse.urljoin(urllib.parse.urljoin(final,parser.base or ''),href)
   if not link.startswith('https://') or not title or len(title)>150 or len(title)<3 or re.search('javascript:|mailto:|tel:',href):continue
   links.append({'title':re.sub(r'\s+',' ',html.unescape(title)),'url':link.split('#')[0]})
  links=list({(x['title'],x['url']):x for x in links}.values());checks[url]=status
 except Exception as e:links=[];checks[url]=str(e)[:100]
 cache.write_text(json.dumps({'status':checks[url],'links':links}));return links
patterns={'planning':r'planning (?:division|department|building)|planning &|planning and|community development','projects':r'current projects|major projects|development (?:projects|activity)|project (?:list|map)|capital improvement','meetings':r'agendas? (?:and|&|,|minutes|center)|meetings? (?:and|&|portal|agenda)|council meetings|agenda center|agenda','boards':r'boards? (?:and|&)|commissions|planning commission|committees','news':r'city news|county news|news center|newsroom|press releases|news flash','housing':r'housing element|affordable housing|housing programs'}
def discover(url,overrides):
 links=crawl(url);chosen={}
 for kind,pattern in patterns.items():
  options=[x for x in links if re.search(pattern,x['title'],re.I) and (kind!='boards' or not re.search(r'calendar|/event/|cancelled|canceled',x['url']+' '+x['title'],re.I))]
  if options:chosen[kind]=min(options,key=lambda x:len(x['title']))['url']
 chosen.update({k:v for k,v in overrides.items() if k in patterns})
 # Inspect a published planning link for more specific project and housing resources.
 if chosen.get('planning') and chosen['planning']!=url:
  second=crawl(chosen['planning'])
  for kind in ['projects','housing','boards']:
   opts=[x for x in second if re.search(patterns[kind],x['title'],re.I)]
   if opts and kind not in chosen:chosen[kind]=min(opts,key=lambda x:len(x['title']))['url']
 return chosen
jobs=[('county:'+name,c['website'],c) for name,c in sources['counties'].items()]+[('city:'+name,url,sources['overrides'].get(name,{})) for name,url in sources['cityWebsites'].items()]
found={}
with concurrent.futures.ThreadPoolExecutor(6) as ex:
 for (key,url,override),value in zip(jobs,ex.map(lambda job:discover(job[1],job[2]),jobs)):
  found[key]=value;print(key,len(value),'resource categories',flush=True)
profiles=[]
labels={'planning':'Planning and development','projects':'Project records and activity','meetings':'Meeting agendas and recordings','boards':'Boards and commissions','housing':'Housing policy and programs','news':'Official news and notices'}
for p in geo['places']+geo['counties']:
 city=p['kind']=='city';name=p['name'];county=p['county'];owner=name if city else county+' County';website=sources['cityWebsites'][name] if city else sources['counties'][county]['website']
 direct=found[('city:'+name) if city else ('county:'+county)];resources=[{'category':'Government','title':owner+' official website','url':website,'scope':'city' if city else 'county'}]
 for kind,title in labels.items():
  if kind in direct:resources.append({'category':kind.title(),'title':owner+': '+title,'url':direct[kind],'scope':'city' if city else 'county'})
 # A community's land use and public meetings are handled by county government.
 county_resources=found['county:'+county]
 for kind in ['planning','meetings','boards']:
  if kind not in direct and county_resources.get(kind):resources.append({'category':kind.title(),'title':county+' County: '+labels[kind],'url':county_resources[kind],'scope':'county'})
 resources.extend([
 {'category':'Transportation','title':county+' County regional transit and transportation','url':sources['counties'][county]['transit'],'scope':'regional'},
 {'category':'Housing','title':'California HCD housing reports and data','url':'https://www.hcd.ca.gov/housing-open-data-tools/apr-dashboard','scope':'state'},
 {'category':'Environmental review','title':'CEQAnet environmental documents','url':'https://ceqanet.lci.ca.gov/','scope':'state'},
 {'category':'Flood','title':'FEMA flood map service center','url':'https://msc.fema.gov/portal/home','scope':'federal'},
 {'category':'Statistics','title':name+' Census data','url':'https://data.census.gov/profile?g='+('050XX00US' if p['kind']=='county' else '160XX00US')+p['geoid'],'scope':p['kind']},
 {'category':'Representation','title':'Confirm your representative by address','url':'https://www.house.gov/representatives/find-your-representative','scope':'federal'}])
 profiles.append({**p,'website':website,'resources':resources,'meetingUrl':direct.get('meetings') or county_resources.get('meetings') or website,'boardUrl':direct.get('boards') or (direct.get('meetings') if city else county_resources.get('boards')) or website,'meetingScope':owner if direct.get('meetings') else county+' County','client':sources['overrides'].get(name,{}).get('client') if city else None})
transport=sources['transportation'][:]
for item in sources['transportation']:
 if item.get('kind')=='directory':
  for l in crawl(item['url']):
   if '/district-' in l['url'] and re.search(r'project|improvement|replacement|rehabilitation|interchange|widening',l['title'],re.I) and len(l['title'])>15 and l['url']!=item['url']:
    transport.append({'name':l['title'],'url':l['url'],'county':None,'region':item['name'],'kind':'project'})
transport=list({x['url']:x for x in transport}.values())
(OUT/'profiles.json').write_text(json.dumps({'retrieved':datetime.datetime.now(datetime.timezone.utc).isoformat(),'profiles':profiles,'transportation':transport,'linkChecks':checks,'note':'Direct local links are discovered on official homepages or planning pages. County links are labelled when they serve unincorporated communities or replace an unavailable city-specific directory. A linked directory is not a scheduled event or a complete inventory.'},indent=2))
print('Profiles',len(profiles),'transportation links',len(transport),flush=True)
