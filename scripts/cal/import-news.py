"""Cache local RSS headlines with publisher links, without copying article bodies."""
import sys
FRESH="--fresh" in sys.argv

import json,urllib.request,urllib.parse,pathlib,concurrent.futures,datetime,email.utils,xml.etree.ElementTree as ET,re,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'public/cal/data';CACHE=pathlib.Path('/tmp/cal-civic-cache');geo=json.loads((OUT/'geography.json').read_text());cutoff=datetime.datetime.now(datetime.timezone.utc);results={}
def one(p):
 name={'El Paso de Robles (Paso Robles)':'Paso Robles','San Buenaventura (Ventura)':'Ventura'}.get(p['name'],p['name'])
 q='"'+name+'" "'+p['county']+'" California (housing OR planning OR development OR transit OR council OR commission) when:180d'
 url='https://news.google.com/rss/search?'+urllib.parse.urlencode({'q':q,'hl':'en-US','gl':'US','ceid':'US:en'});cache=CACHE/('news-'+p['id']+'.xml')
 try:
  if cache.exists() and not FRESH:raw=cache.read_bytes()
  else:
   with urllib.request.urlopen(url,timeout=20) as r:raw=r.read()
   cache.write_bytes(raw)
  root=ET.fromstring(raw);items=[]
  for item in root.findall('.//item'):
   title=item.findtext('title') or '';publisher=item.findtext('source') or '';link=item.findtext('link') or '';published=email.utils.parsedate_to_datetime(item.findtext('pubDate'))
   if not publisher or not link.startswith('https://') or published>=cutoff or (cutoff-published).days>185:continue
   if not re.search(r'(?<!\w)'+re.escape(name)+r'(?!\w)',title,re.I):continue
   if not re.search(r'hous|homes|planning|council|transit|rail|bus|road|develop|zoning|apartment|commission|construction|budget|project|permit|water',title,re.I):continue
   if re.search(r'obituar|legacy.com|real estate agent|business wire|prnewswire',title+' '+publisher,re.I):continue
   if title.endswith(' - '+publisher):title=title[:-len(publisher)-3]
   items.append({'title':title,'publisher':publisher,'url':link,'date':published.date().isoformat(),'place':p['id'],'county':p['county'],'kind':'reporting','feed':url})
  items=sorted({x['url']:x for x in items}.values(),key=lambda x:x['date'],reverse=True)[:8]
  print(p['name'],len(items),'headlines',flush=True);return p['id'],items,None
 except Exception as e:return p['id'],[],str(e)
failures={}
with concurrent.futures.ThreadPoolExecutor(6) as ex:
 for key,items,error in ex.map(one,geo['places']+geo['counties']):
  results[key]=items
  if error:failures[key]=error
(OUT/'news.json').write_text(json.dumps({'retrieved':datetime.datetime.now(datetime.timezone.utc).isoformat(),'articles':results,'failures':failures,'note':'Publisher headlines from public RSS search feeds. Coverage varies by locality. County headlines may be shown separately when a community has no matching local report. Links open the publisher through Google News.'},indent=2))
print('News',sum(map(len,results.values())),'headlines;',len(failures),'feed failures',flush=True)
