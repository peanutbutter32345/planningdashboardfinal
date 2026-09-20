"""Zillow public city indexes, aligned to the dashboard's July 2026 baseline.
Use --cached-dir /tmp to reuse the downloaded California-only API snapshots.
"""
import csv,io,json,re,sys,urllib.request
from pathlib import Path
catalog=json.loads(Path('public/data/municipalities.json').read_text())['cities']
urls={'value':'https://files.zillowstatic.com/research/public_csvs/zhvi/City_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv','rent':'https://files.zillowstatic.com/research/public_csvs/zori/City_zori_uc_sfrcondomfr_sm_month.csv'}
cache=Path(sys.argv[sys.argv.index('--cached-dir')+1]) if '--cached-dir' in sys.argv else None
rows={}
for kind,url in urls.items():
 if cache:rows[kind]=json.loads((cache/('bay-zillow-'+kind+'.json')).read_text())['rows']
 else:
  with urllib.request.urlopen(url,timeout=90) as stream:rows[kind]=[r for r in csv.DictReader(io.TextIOWrapper(stream,encoding='utf-8-sig')) if r['State']=='CA']
normalize=lambda s:re.sub('[^a-z0-9]','',s.lower().replace('saint ','st '))
month='2026-07-31';cities={}
for city in catalog:
 stats={}
 for kind,field in [('value','homeValue'),('rent','rent')]:
  match=[r for r in rows[kind] if normalize(r['RegionName'])==normalize(city['label']) and r['CountyName']==city['county']+' County']
  if len(match)>1:raise ValueError('Ambiguous market geography '+city['label'])
  row=match[0] if match else {};v=row.get(month)
  stats[field]=round(float(v)) if v else None
  stats[field+'Series']=[{'year':str(y),'value':round(float(row[str(y)+'-07-31']))} for y in range(2021,2027) if row.get(str(y)+'-07-31')]
 stats['marketAsOf']='July 2026';stats['marketSource']='https://www.zillow.com/research/data/'
 cities[city['key']]=stats
cities['westsanjose']={**cities['sanjose'],'marketGeography':'San Jose citywide proxy'}
output={'metadata':{'source':'https://www.zillow.com/research/data/','files':urls,'month':month,'note':'Exact city and county matches only. Missing indexes remain unavailable; West San Jose uses San Jose citywide indexes.'},'cities':cities}
Path('public/data/market-data.json').write_text(json.dumps(output,indent=2)+'\n')
Path('public/data/market-data.js').write_text('window.MARKET_DATA = '+json.dumps(output)+';\n')
print('Market indexes:',sum(v['homeValue'] is not None for v in cities.values()),'home values;',sum(v['rent'] is not None for v in cities.values()),'rents (includes West San Jose proxy)')
