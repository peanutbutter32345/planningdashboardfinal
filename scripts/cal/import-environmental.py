"""Import the complete downloadable CEQAnet result set for each covered county over 12 months.

Locality matches use the published Cities field or an exact local lead-agency name,
never contact addresses. County-wide records are kept separate. CSV exports include
source descriptions, public-review dates, parcel identifiers and original URLs.
"""
import json,pathlib,urllib.request,urllib.parse,csv,io,datetime,concurrent.futures,hashlib,re,sys
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'public/cal/data';CACHE=pathlib.Path('/tmp/cal-civic-cache');profiles=json.loads((OUT/'profiles.json').read_text())['profiles'];today=datetime.date.today();start=today.replace(year=today.year-1);FRESH='--fresh' in sys.argv
counties=sorted({p['county'] for p in profiles});failures={}
def one(county):
 params={'County':county,'StartRange':start.isoformat(),'EndRange':today.isoformat(),'OutputFormat':'CSV'};url='https://ceqanet.lci.ca.gov/Search?'+urllib.parse.urlencode(params);cache=CACHE/('ceqa-'+county+'-'+today.isoformat()+'.csv')
 try:
  if cache.exists() and not FRESH:raw=cache.read_bytes()
  else:
   with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (public civic record index)'}),timeout=45) as r:raw=r.read(45000000)
   cache.write_bytes(raw)
  try:text=raw.decode('utf-8-sig')
  except UnicodeDecodeError:text=raw.decode('cp1252')
  reader=csv.DictReader(io.StringIO(text));assert 'Document Portal URL' in (reader.fieldnames or []),'No CSV result returned (the source may impose a 10,000-result limit).'
  records=[]
  def date(s):
   try:return datetime.datetime.strptime(s,'%m/%d/%Y').date().isoformat()
   except:return None
  for r in reader:
   url=r['Document Portal URL'].strip()
   if not url.startswith('https://ceqanet.lci.ca.gov/') or not r['Document Title'].strip():continue
   received=date(r['Received'])
   if not received or not start.isoformat()<=received<=today.isoformat():continue
   clean=lambda k:re.sub(r'\s+',' ',r.get(k,'').replace('\\r\\n',' ')).strip()
   records.append({'id':'ceqa-'+hashlib.sha256(url.encode()).hexdigest()[:18],'sch':clean('SCH Number'),'name':clean('Document Title'),'projectTitle':clean('Project Title'),'type':clean('Document Type'),'date':received,'agency':clean('Lead Agency Title') or clean('Lead Agency Name'),'agencyName':clean('Lead Agency Name'),'cities':[c.strip() for c in clean('Cities').split(',') if c.strip()],'counties':[c.strip() for c in clean('Counties').split(',') if c.strip()],'description':clean('Document Description')[:16000],'parcels':clean('Location Parcel Number'),'crossStreets':clean('Location Cross Streets'),'reviewStart':date(r.get('NOC Public Review Start Date','')) or date(r.get('NOC State Review Start Date','')),'reviewEnd':date(r.get('NOC Public Review End Date','')) or date(r.get('NOC State Review End Date','')),'action':clean('NOC Local Action'),'developmentType':clean('NOC Development Type'),'source':url,'transportation':bool(re.search(r'transportation|caltrans|transit',clean('Lead Agency Title'),re.I) or re.search(r'\bbridge|bicycle|roadway|sidewalk|transit|rail|bus stop|interchange|highway|pavement|street improvement',clean('Document Title'),re.I))})
  return county,records,{'url':'https://ceqanet.lci.ca.gov/Search?'+urllib.parse.urlencode(params),'status':'imported','records':len(records),'checked':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 except Exception as e:return county,[],{'status':'unavailable','error':str(e)[:250],'url':url}
allrows={};source={}
with concurrent.futures.ThreadPoolExecutor(4) as ex:
 for county,rows,meta in ex.map(one,counties):
  print(county,len(rows),meta['status'],flush=True);source[county]=meta
  for r in rows:allrows[r['id']]=r
aliases={'San Buenaventura (Ventura)':['Ventura','San Buenaventura'],'El Paso de Robles (Paso Robles)':['Paso Robles','El Paso de Robles'],'Carmel-by-the-Sea':['Carmel']}
def norm(s):return re.sub(r'[^a-z0-9]','',s.lower())
places={}
for p in profiles:
 names={norm(p['name']),*[norm(a) for a in aliases.get(p['name'],[])]}
 local=[]
 for r in allrows.values():
  if p['county'] not in r['counties']:continue
  if p['kind']=='county':local.append(r);continue
  citymatch=any(norm(c) in names for c in r['cities'])
  agency=norm(r['agencyName']);lead=p['kind']=='city' and any(agency in [n,n+'cityof','cityof'+n] for n in names)
  if citymatch or lead:local.append(r)
 places[p['id']]=sorted(local,key=lambda r:(r['date'],r['source']),reverse=True)
(OUT/'environmental.json').write_text(json.dumps({'retrieved':datetime.datetime.now(datetime.timezone.utc).isoformat(),'from':start.isoformat(),'through':today.isoformat(),'sources':source,'records':allrows,'places':{k:[r['id'] for r in v] for k,v in places.items()},'note':'CEQAnet environmental filings received during the displayed 12-month period. Multiple filings may concern one project. A notice is not a live construction status. Locality assignment uses the published Cities field or exact city lead-agency name. County-wide reporting is labelled separately. Source review periods may have ended; check amendments on the original record.'},ensure_ascii=False))
print('Unique documents',len(allrows),'local profiles with records',sum(bool(v) for v in places.values()),flush=True)
