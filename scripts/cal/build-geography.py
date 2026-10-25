"""Refresh Census district/place geography. Requires Python and Shapely."""
import sys
FRESH="--fresh" in sys.argv

import hashlib
import json,urllib.request,urllib.parse,concurrent.futures,pathlib,datetime
from shapely.geometry import shape,mapping
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'public/cal/data';OUT.mkdir(parents=True,exist_ok=True)
CACHE=pathlib.Path('/tmp/cal-civic-cache');CACHE.mkdir(exist_ok=True)
DISTRICTS=['19','20','21','24','26','27']
EXTRA_CITIES={'San Diego'}
BASE='https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/'
def query(path,where):
 params={'where':where,'outFields':'*','returnGeometry':'true','outSR':'4326','geometryPrecision':'5','maxAllowableOffset':'.0001','f':'geojson'}
 url=BASE+path+'/query?'+urllib.parse.urlencode(params);cache=CACHE/(path.replace('/','-')+('-'+hashlib.sha256(where.encode()).hexdigest()[:10] if 'Legislative' in path else '')+'.json')
 if cache.exists() and not FRESH:return json.loads(cache.read_text())
 with urllib.request.urlopen(url,timeout=120) as r:d=json.load(r)
 if d.get('error') or d.get('exceededTransferLimit') or not d.get('features'):raise RuntimeError(str(d)[:500])
 cache.write_text(json.dumps(d));return d
work=[('Legislative/MapServer/4',"STATE='06' AND CD119 IN ('19','20','21','24','26','27')"),('Legislative/MapServer/0',"STATE='06' AND CD120 IN ('19','20','21','24','26','27')"),('Places_CouSub_ConCity_SubMCD/MapServer/4',"STATE='06'"),('Places_CouSub_ConCity_SubMCD/MapServer/5',"STATE='06'"),('State_County/MapServer/1',"STATE='06'")]
with concurrent.futures.ThreadPoolExecutor(5) as ex:data=list(ex.map(lambda a:query(*a),work))
current,future,inc,cdp,counties=data
regions={f['properties']['CD119']:shape(f['geometry']).buffer(0) for f in current['features']}
future_regions={f['properties']['CD120']:shape(f['geometry']).buffer(0) for f in future['features']}
for key,g in regions.items():print('neighbors of',key,[k for k,h in regions.items() if k!=key and g.distance(h)<.002],flush=True)
county_shapes=[(f['properties']['BASENAME'],shape(f['geometry']).buffer(0)) for f in counties['features']]
places=[];features=[]
for kind,features_in in [('city',inc['features']),('community',cdp['features'])]:
 for f in features_in:
  p=f['properties'];g=shape(f['geometry']).buffer(0)
  if not g.area:continue
  memberships=[k for k,h in regions.items() if g.intersection(h).area/g.area>.0001]
  future_memberships=[k for k,h in future_regions.items() if g.intersection(h).area/g.area>.0001]
  if not memberships and not future_memberships and p['BASENAME'] not in EXTRA_CITIES:continue
  county_parts=sorted([(name,g.intersection(h).area) for name,h in county_shapes if g.intersects(h) and g.intersection(h).area/g.area>.0001],key=lambda x:-x[1])
  label=p['BASENAME'];geoid=p['GEOID'];key='p'+geoid;point=g.representative_point()
  places.append({'id':key,'geoid':geoid,'name':label,'kind':kind,'county':county_parts[0][0],'counties':[n for n,a in county_parts], 'districts':memberships,'futureDistricts':future_memberships,'split':any(g.intersection(regions[k]).area/g.area<.995 for k in memberships),'center':{'lat':round(point.y,5),'lng':round(point.x,5)},'bounds':list(g.bounds)})
  features.append({'type':'Feature','properties':{'id':key,'name':label},'geometry':mapping(g.simplify(.0008,preserve_topology=True))})
county_profiles=[]
for f in counties['features']:
 g=shape(f['geometry']).buffer(0);p=f['properties']
 memberships=[k for k,h in regions.items() if g.intersection(h).area/g.area>.0001 or any(x['county']==p['BASENAME'] and k in x['districts'] for x in places)]
 future_memberships=[k for k,h in future_regions.items() if g.intersection(h).area/g.area>.0001 or any(x['county']==p['BASENAME'] and k in x['futureDistricts'] for x in places)]
 if not memberships and not future_memberships and not any(x['county']==p['BASENAME'] for x in places):continue
 point=g.representative_point();name=p['BASENAME']
 county_profiles.append({'id':'c'+p['GEOID'],'geoid':p['GEOID'],'name':name+' County','kind':'county','county':name,'counties':[name],'districts':memberships,'futureDistricts':future_memberships,'split':True,'center':{'lat':round(point.y,5),'lng':round(point.x,5)},'bounds':list(g.bounds)})
places.sort(key=lambda p:(p['county'],p['name']))
def boundaries(d,key):
 return {'type':'FeatureCollection','features':[{'type':'Feature','properties':{'district':f['properties'][key]},'geometry':mapping(shape(f['geometry']).buffer(0).simplify(.0008,preserve_topology=True))} for f in d['features']]}
meta={'retrieved':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':BASE+'Legislative/MapServer','placesSource':BASE+'Places_CouSub_ConCity_SubMCD/MapServer','districts':DISTRICTS,'extraCities':sorted(EXTRA_CITIES),'currentCongress':119,'currentThrough':'2027-01-02','futureCongress':120,'futureFrom':'2027-01-03','method':'Census incorporated places and census-designated places with a positive-area intersection with a selected district. Split-place membership does not establish the district of an individual address. Explicitly requested cities are included in full even outside those districts. County remainders are covered through county profiles. Boundaries are simplified for display.'}
(OUT/'geography.json').write_text(json.dumps({'metadata':meta,'places':places,'counties':county_profiles},indent=2)+'\n')
(OUT/'districts-119.geojson').write_text(json.dumps(boundaries(current,'CD119')))
(OUT/'districts-120.geojson').write_text(json.dumps(boundaries(future,'CD120')))
(OUT/'places.geojson').write_text(json.dumps({'type':'FeatureCollection','features':features}))
print('Total places',len(places),'cities',sum(p['kind']=='city' for p in places),'counties',sorted(set(p['county'] for p in places)),flush=True)
print('Cities:',[(p['name'],p['county'],p['districts']) for p in places if p['kind']=='city'],flush=True)
