"""Archive a dated, sourced Cal edition without inventing historical coverage."""
import json,pathlib,datetime
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'public/cal/data';read=lambda p:json.loads((OUT/p).read_text());profiles=read('profiles.json');statistics=read('statistics.json');housing=read('housing-summary.json');news=read('news.json');photos=read('photos.json')['photos'];issued=news['retrieved'][:10];key='cal-'+issued;folder=OUT/'editions';folder.mkdir(exist_ok=True)
counties=[]
for p in profiles['profiles']:
 if p['kind']!='county':continue
 city=next((x for x in profiles['profiles'] if x['county']==p['county'] and x['id'] in photos),None)
 articles=sorted({n['url']:n for rows in news['articles'].values() for n in rows if n['county']==p['county']}.values(),key=lambda x:x['date'],reverse=True)[:3]
 counties.append({'id':p['id'],'name':p['name'],'districts':p['districts'],'futureDistricts':p['futureDistricts'],'housing':housing['jurisdictions'][p['id']],'statistics':statistics['places'][p['id']],'photo':photos.get(city['id']) if city else None,'news':articles,'meetingUrl':p['meetingUrl'],'resources':p['resources']})
counties.sort(key=lambda c:({'Santa Barbara County':0,'San Luis Obispo County':1,'Ventura County':2}.get(c['name'],3),c['name']))
path=folder/(key+'.json')
if not path.exists():path.write_text(json.dumps({'id':key,'issued':issued,'title':'The Cal Civic Letter','subtitle':'The local record, from the coast to the valley.','sourceDates':{'housing':housing['retrieved'],'statistics':statistics['retrieved'],'news':news['retrieved']},'note':'This edition combines dated reporting links with Census estimates and the latest available annual housing submissions. County-reported permits describe the county reporting jurisdiction, not the sum of all incorporated cities. It is not a retrospective claim about everything that happened during this month.','counties':counties},indent=2)+'\n')
manifest=[]
for p in folder.glob('cal-*.json'):
 d=json.loads(p.read_text());manifest.append({'id':d['id'],'issued':d['issued'],'title':d['title'],'url':'/cal/data/editions/'+p.name})
(OUT/'editions.json').write_text(json.dumps({'editions':sorted(manifest,key=lambda x:x['issued'],reverse=True)},indent=2)+'\n');print('Newsletter editions:',len(manifest))
