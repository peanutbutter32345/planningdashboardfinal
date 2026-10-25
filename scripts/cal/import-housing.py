"""Import complete 2024/2025 APR rows, with a labelled 2023 fallback where both are absent.
Keeps annual milestones separate from a live project pipeline and never assigns city centers to records.
"""
import sys
FRESH="--fresh" in sys.argv

import json,urllib.request,urllib.parse,concurrent.futures,pathlib,hashlib,datetime,re,time
from shapely.geometry import shape,Point
from shapely.prepared import prep
from shapely.strtree import STRtree
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'public/cal/data';CACHE=pathlib.Path('/tmp/cal-civic-cache');(OUT/'housing').mkdir(exist_ok=True)
geo=json.loads((OUT/'geography.json').read_text());places=geo['places'];counties=geo['counties']
IDS={'A':'c78b769d-cc02-4050-91ef-79ded665b5a8','A2':'fe505d9b-8c36-42ba-ba30-08bc4f34e022'}
BASE='https://data.ca.gov/api/3/action/'
def get(url):
 for n in range(3):
  try:
   with urllib.request.urlopen(url,timeout=100) as r:d=json.load(r)
   if not d.get('success'):raise RuntimeError(str(d)[:200])
   return d['result']
  except Exception:
   if n==2:raise
   time.sleep(n+1)
norm=lambda s:re.sub('[^A-Z0-9]','',str(s).upper())
aliases={'San Buenaventura (Ventura)':'SAN BUENAVENTURA','El Paso de Robles (Paso Robles)':'PASO ROBLES','Carmel-by-the-Sea':'CARMEL'}
def fetch_table(args):
 county,table=args;scope=','.join(sorted(p['name'] for p in places if p['kind']=='city' and p['county']==county))
 cache=CACHE/('hcd-'+norm(county)+'-'+table+'-'+hashlib.sha256(scope.encode()).hexdigest()[:10]+'.json')
 if cache.exists() and not FRESH:return county,table,json.loads(cache.read_text())
 names=[aliases.get(p['name'],p['name'].upper()) for p in places if p['kind']=='city' and p['county']==county]+[county.upper()+' COUNTY']
 names.extend(['VENTURA'] if county=='Ventura' else ['EL PASO DE ROBLES'] if county=='San Luis Obispo' else [])
 sql='SELECT * FROM "'+IDS[table]+'" WHERE "YEAR" IN (2024,2025) AND "CNTY_NAME" = '+repr(county)+' AND "JURIS_NAME" IN ('+','.join("'"+s.replace("'","''")+"'" for s in names)+') ORDER BY "YEAR" DESC,"_id" LIMIT 100000'
 url=BASE+'datastore_search_sql?'+urllib.parse.urlencode({'sql':sql});r=get(url);rows=r['records']
 if len(rows)>=100000:raise RuntimeError('HCD result truncated '+county)
 cache.write_text(json.dumps(rows));print(county,table,len(rows),flush=True);return county,table,rows
allrows={}
with concurrent.futures.ThreadPoolExecutor(4) as ex:
 for county,table,rows in ex.map(fetch_table,[(c['county'],t) for c in counties for t in IDS]):allrows[(county,table)]=rows
regions={f['properties']['district']:shape(f['geometry']).buffer(0) for f in json.loads((OUT/'districts-119.geojson').read_text())['features']}
future={f['properties']['district']:shape(f['geometry']).buffer(0) for f in json.loads((OUT/'districts-120.geojson').read_text())['features']}
regions={k:prep(v) for k,v in regions.items()};future={k:prep(v) for k,v in future.items()}
place_shapes={f['properties']['id']:shape(f['geometry']).buffer(0) for f in json.loads((OUT/'places.geojson').read_text())['features']}
city_buffers={key:prep(g.buffer(.008)) for key,g in place_shapes.items()}
county_buffers={'c'+f['properties']['GEOID']:prep(shape(f['geometry']).buffer(.008)) for f in json.loads((CACHE/'State_County-MapServer-1.json').read_text())['features']}
def num(x):
 try:
  n=float(x);return n if n>=0 else None
 except:return None
def number(x):return num(x) or 0
def date(x):return x if isinstance(x,str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}',x) and x<=datetime.date.today().isoformat() else None
def record(r,table,jur):
 if table=='A':
  if r.get('APPLICATION_STATUS') not in ['Approved','Pending']:return None
  status='Application '+r['APPLICATION_STATUS'].lower();units=num(r.get('TOT_APPROVED_UNITS' if r['APPLICATION_STATUS']=='Approved' else 'TOT_PROPOSED_UNITS'));dt=date(r.get('APP_SUBMIT_DT'));stage='review' if r['APPLICATION_STATUS']=='Pending' else 'approved'
 else:
  if number(r.get('NO_OTHER_FORMS_OF_READINESS')):status='Occupancy / readiness reported';units=num(r['NO_OTHER_FORMS_OF_READINESS']);dt=date(r.get('CO_ISSUE_DT1'));stage='completed'
  elif number(r.get('NO_BUILDING_PERMITS')):status='Building permit issued';units=num(r['NO_BUILDING_PERMITS']);dt=date(r.get('BP_ISSUE_DT1'));stage='permitted'
  elif number(r.get('NO_ENTITLEMENTS')):status='Entitlement issued';units=num(r['NO_ENTITLEMENTS']);dt=date(r.get('ENT_APPROVE_DT1'));stage='approved'
  else:return None
 if not units:return None
 address=str(r.get('STREET_ADDRESS') or r.get('PROJECT_NAME') or r.get('APN') or '').strip()
 if not address or address.lower() in ['none','nan','n/a']:return None
 lat=num(r.get('LATITUDE'))
 try:lng=float(r.get('LONGITUDE'))
 except:lng=None
 valid=lat is not None and lng is not None and 32<lat<42.1 and -125<lng<-113.9 and number(r.get('SCORE'))>=90
 if valid and jur['kind']=='city':valid=city_buffers[jur['id']].covers(Point(lng,lat))
 if valid and jur['kind']=='county':valid=county_buffers[jur['id']].covers(Point(lng,lat))
 if not valid:lat=lng=None
 point=Point(lng,lat) if valid else None
 identity='|'.join(str(r.get(k) or '') for k in ['JURIS_NAME','YEAR','APN','STREET_ADDRESS','UNIT_CAT','NO_BUILDING_PERMITS','NO_ENTITLEMENTS','NO_OTHER_FORMS_OF_READINESS','APPLICATION_STATUS','TOT_PROPOSED_UNITS'])
 source=BASE+'datastore_search?'+urllib.parse.urlencode({'resource_id':IDS[table],'filters':json.dumps({k:r[k] for k in ['JURIS_NAME','CNTY_NAME','YEAR','APN','STREET_ADDRESS'] if r.get(k) is not None}),'limit':50})
 return {'id':'cal-hcd-'+hashlib.sha256((table+identity).encode()).hexdigest()[:22],'name':str(r.get('PROJECT_NAME') or address),'address':address,'jurisdiction':jur['id'],'county':jur['county'],'units':units,'status':status,'stage':stage,'date':dt,'year':int(r['YEAR']),'table':table,'source':source,'sourceId':r['_id'],'apn':str(r.get('APN') or ''),'lat':lat,'lng':lng,'districts':[k for k,g in regions.items() if point and g.covers(point)],'futureDistricts':[k for k,g in future.items() if point and g.covers(point)]}
summary={};datasets={}
for jur in [p for p in places if p['kind']=='city']+counties:
 expected=norm(aliases.get(jur['name'],jur['name']))
 def matches(r):return norm(r['JURIS_NAME'])==expected or (jur['name']=='El Paso de Robles (Paso Robles)' and norm(r['JURIS_NAME'])=='ELPASODEROBLES') or (jur['name']=='San Buenaventura (Ventura)' and norm(r['JURIS_NAME'])=='VENTURA')
 rows={t:[r for r in allrows[(jur['county'],t)] if matches(r)] for t in IDS}
 # Some jurisdictions have not published either recent reporting year. Keep an older
 # published report explicitly dated instead of representing missing reports as zero activity.
 if not any(rows.values()):
  for table in IDS:
   cache=CACHE/('hcd-fallback-2023-'+jur['id']+'-'+table+'.json')
   if cache.exists() and not FRESH:rows[table]=json.loads(cache.read_text())
   else:
    filters={'CNTY_NAME':jur['county'],'JURIS_NAME':aliases.get(jur['name'],jur['name'].upper()),'YEAR':2023}
    result=get(BASE+'datastore_search?'+urllib.parse.urlencode({'resource_id':IDS[table],'filters':json.dumps(filters),'limit':100000}))
    if result['total']>len(result['records']):raise RuntimeError('Truncated fallback report '+jur['name'])
    rows[table]=result['records'];cache.write_text(json.dumps(rows[table]))
  print(jur['name'],'2023 fallback rows',sum(map(len,rows.values())),flush=True)
 years=[int(r['YEAR']) for rs in rows.values() for r in rs];year=max(years) if years else None
 recent={t:[r for r in rs if int(r['YEAR'])==year] for t,rs in rows.items()}
 records=[];seen=set()
 for t in ['A2','A']:
  for r in recent[t]:
   p=record(r,t,jur)
   if p and p['id'] not in seen:seen.add(p['id']);records.append(p)
 records.sort(key=lambda p:(-p['units'],p['id']))
 totals={k:sum(number(r.get(col)) for r in recent['A2']) for k,col in [('permitted','NO_BUILDING_PERMITS'),('completed','NO_OTHER_FORMS_OF_READINESS'),('entitled','NO_ENTITLEMENTS')]}
 stats={'year':year,'records':len(records),'sourceRows':len(recent['A'])+len(recent['A2']),'mapped':sum(r['lat'] is not None for r in records),**totals,'source':'https://www.hcd.ca.gov/housing-open-data-tools/apr-dashboard','geography':'Reporting jurisdiction, which may extend outside the selected congressional districts.'}
 summary[jur['id']]=stats;datasets[jur['id']]=records
 (OUT/'housing'/(jur['id']+'.json')).write_text(json.dumps({'metadata':stats,'records':records},separators=(',',':')))
# Community views include only county-reported records whose verified point falls in that CDP.
county_points={c['id']:[r for r in datasets[c['id']] if r['lat'] is not None] for c in counties}
trees={key:STRtree([Point(r['lng'],r['lat']) for r in rows]) for key,rows in county_points.items()}
for p in [p for p in places if p['kind']=='community']:
 county=next(c for c in counties if c['county']==p['county']);g=place_shapes[p['id']]
 records=[county_points[county['id']][int(i)] for i in trees[county['id']].query(g,predicate='covers')]
 stats={'year':summary[county['id']]['year'],'records':len(records),'mapped':len(records),'permitted':None,'completed':None,'entitled':None,'source':summary[county['id']]['source'],'geography':'Located county-reported records only. CDP annual totals are not published in this source.'}
 summary[p['id']]=stats;(OUT/'housing'/(p['id']+'.json')).write_text(json.dumps({'metadata':stats,'records':records},separators=(',',':')))
(OUT/'housing-summary.json').write_text(json.dumps({'retrieved':datetime.datetime.now(datetime.timezone.utc).isoformat(),'years':[2023,2024,2025],'note':'Full usable rows from 2024/2025 reports, using a dated 2023 report only where both newer years are absent. Table A applications and Table A2 milestones can describe the same project and must not be added together as unique homes. A permit is not evidence of a construction start. Unverified coordinates stay off the map.','jurisdictions':summary},indent=2))
print('Housing',sum(s['records'] for k,s in summary.items() if k in datasets),'rows;',sum(s['mapped'] for k,s in summary.items() if k in datasets),'mapped',flush=True)
