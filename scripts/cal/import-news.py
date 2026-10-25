"""Cache local RSS headlines with publisher links, without copying article bodies."""
from topics import article_topic, local_headline, civic_news
import sys
FRESH="--fresh" in sys.argv

import json,urllib.request,urllib.parse,pathlib,concurrent.futures,datetime,email.utils,xml.etree.ElementTree as ET,re,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'public/cal/data';CACHE=pathlib.Path('/tmp/cal-civic-cache');geo=json.loads((OUT/'geography.json').read_text());cutoff=datetime.datetime.now(datetime.timezone.utc);results={}
def one(p):
 name={'El Paso de Robles (Paso Robles)':'Paso Robles','San Buenaventura (Ventura)':'Ventura'}.get(p['name'],p['name'])
 try:
  feeds=[]
  for topic,terms in [('civic','housing OR planning OR development OR council OR commission'),('transport','transit OR transportation OR bus OR rail OR bicycle OR highway OR pedestrian')]:
   q='"'+name+'" "'+p['county']+'" California ('+terms+') when:180d'
   url='https://news.google.com/rss/search?'+urllib.parse.urlencode({'q':q,'hl':'en-US','gl':'US','ceid':'US:en'});cache=CACHE/('news-'+topic+'-'+p['id']+'.xml')
   if cache.exists() and not FRESH:raw=cache.read_bytes()
   else:
    with urllib.request.urlopen(url,timeout=20) as r:raw=r.read()
    cache.write_bytes(raw)
   feeds.extend((item,url) for item in ET.fromstring(raw).findall('.//item'))
  items=[]
  for item,url in feeds:
   title=item.findtext('title') or '';publisher=item.findtext('source') or '';link=item.findtext('link') or '';published=email.utils.parsedate_to_datetime(item.findtext('pubDate'))
   if not publisher or not link.startswith('https://') or published>=cutoff or (cutoff-published).days>185:continue
   title=local_headline(title,publisher,name,p['kind'])
   if not title:continue
   if not civic_news(title,publisher):continue
   items.append({'title':title,'publisher':publisher,'url':link,'date':published.date().isoformat(),'place':p['id'],'county':p['county'],'kind':'reporting','feed':url})
  items=sorted({x['url']:x for x in items}.values(),key=lambda x:x['date'],reverse=True)
  items=sorted([x for topic in ['housing','transportation','developments'] for x in [i for i in items if article_topic(i['title'])==topic][:4]],key=lambda x:x['date'],reverse=True)
  print(p['name'],len(items),'headlines',flush=True);return p['id'],items,None
 except Exception as e:return p['id'],[],str(e)
district=next((a.split('=',1)[1] for a in sys.argv if a.startswith('--district=')),None)
selected=geo['places']+geo['counties']
failures={}
if district:
 selected=[p for p in geo['places'] if district in p['districts'] or district in p['futureDistricts']]
 counties={p['county'] for p in selected}
 selected += [p for p in geo['counties'] if p['county'] in counties]
 previous=json.loads((OUT/'news.json').read_text());results=previous['articles'];failures=previous.get('failures',{})
with concurrent.futures.ThreadPoolExecutor(6) as ex:
 for key,items,error in ex.map(one,selected):
  if error:failures[key]=error
  else:results[key]=items;failures.pop(key,None)
(OUT/'news.json').write_text(json.dumps({'retrieved':datetime.datetime.now(datetime.timezone.utc).isoformat(),'articles':results,'failures':failures,'note':'Publisher headlines from public RSS search feeds. Coverage varies by locality. County headlines may be shown separately when a community has no matching local report. Links open the publisher through Google News.'},indent=2))
print('News',sum(map(len,results.values())),'headlines;',len(failures),'feed failures',flush=True)
