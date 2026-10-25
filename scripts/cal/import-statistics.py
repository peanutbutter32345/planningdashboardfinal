"""Import ACS 2024 five-year estimates directly from Census table summary files.
No API key is needed. Raw tables stream from census.gov, with only covered geographies cached.
"""
import sys
FRESH="--fresh" in sys.argv

import json,urllib.request,pathlib,concurrent.futures,datetime,csv,io
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=ROOT/'public/cal/data';CACHE=pathlib.Path('/tmp/cal-civic-cache')
g=json.loads((OUT/'geography.json').read_text());places=g['places']+g['counties'];tables=['B01003','B19013','B25064','B25003','B25077','B08301','B08013','B25001']
ids={('0500000US' if p['kind']=='county' else '1600000US')+p['geoid']:p for p in places}
BASE='https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/'
def get(table):
 url=BASE+'acsdt5y2024-'+table.lower()+'.dat';cache=CACHE/('summary-v2-'+table+'.json')
 if cache.exists() and not FRESH:return table,json.loads(cache.read_text())
 with urllib.request.urlopen(url,timeout=120) as response:
  reader=csv.DictReader(io.TextIOWrapper(response,encoding='utf-8-sig'),delimiter='|');rows={r['GEO_ID']:r for r in reader if r['GEO_ID'] in ids}
 cache.write_text(json.dumps(rows));print(table,len(rows),'geographies',flush=True);return table,rows
with concurrent.futures.ThreadPoolExecutor(4) as ex:data=dict(ex.map(get,tables))
output={}
for gid,p in ids.items():
 def v(t,k,measure='E'):
  x=data[t].get(gid,{}).get(t+'_'+measure+k)
  try:return float(x) if float(x)>=0 else None
  except:return None
 def pct(n,total):return round(100*n/total,1) if n is not None and total and total>0 else None
 total=v('B08301','001');home=v('B08301','021');commute=(total-home) if total is not None and home is not None else None
 output[p['id']]={'available':gid in data['B01003'],'population':v('B01003','001'),'income':v('B19013','001'),'rent':v('B25064','001'),'homeValue':v('B25077','001'),'housingUnits':v('B25001','001'),'renterShare':pct(v('B25003','003'),v('B25003','001')),'transitShare':pct(v('B08301','010'),total),'commuteMinutes':round(v('B08013','001')/commute,1) if v('B08013','001') is not None and commute and commute>0 else None,'source':'https://data.census.gov/profile?g='+('050XX00US' if p['kind']=='county' else '160XX00US')+p['geoid'],'period':'2020–2024 ACS five-year estimates','geography':p['name'],'tables':{t:BASE+'acsdt5y2024-'+t.lower()+'.dat' for t in tables},'margins':{k:v(t,'001','M') for k,t in [('population','B01003'),('income','B19013'),('rent','B25064'),('homeValue','B25077'),('housingUnits','B25001')]}}
(OUT/'statistics.json').write_text(json.dumps({'retrieved':datetime.datetime.now(datetime.timezone.utc).isoformat(),'note':'US Census Bureau ACS 2024 five-year estimates, directly from table-based summary files. Estimates cover the whole named place or county, including portions outside selected districts. Medians cannot be added or treated as current market prices. Margins of error are retained.','places':output},indent=2))
print('Statistics:',len(output),'profiles;',sum(s['available'] for s in output.values()),'with estimates',flush=True)
