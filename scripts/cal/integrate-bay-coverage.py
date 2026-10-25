"""Adapt sourced district records to BayDashboard's existing city contracts.

No separate app or styling. Browser boot gets metadata and a small preview;
the existing city renderer loads the complete selected locality on demand.
"""
import json
import re
import html
from record_display import filing_display
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'public/cal/data'
OUT = ROOT / 'public/data/coverage'
OUT.mkdir(exist_ok=True)
def read(name):
    return json.loads((SOURCE / name).read_text())
def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')
profiles = read('profiles.json')
stats = read('statistics.json')['places']
news = read('news.json')['articles']
land = read('land-use.json')['places']
boards = read('boards.json')['bodies']
photos = read('photos.json')['photos']
env = read('environmental.json')
existing = json.loads((ROOT / 'public/data/municipalities.json').read_text())['cities']
existing_names = {(p['label'].lower(), p['county']) for p in existing}
existing_keys = {p['key'] for p in existing}
boundaries = json.loads((SOURCE / 'places.geojson').read_text())
features = {f['properties']['id']:f for f in boundaries['features']}
manifest = {'reviewed':'2026-10-25', 'districts':read('geography.json')['metadata']['districts'], 'cities':{}, 'photos':{}, 'meetings':{}, 'activity':{}}
all_records = {}
extra_boundaries = {'source':'US Census TIGERweb locality boundaries, simplified for display','cities':{}}

for p in profiles['profiles']:
    if p['kind'] == 'county' or (p['name'].lower(),p['county']) in existing_names:
        continue
    key = re.sub('[^a-z0-9]', '', p['name'].lower())
    if key in existing_keys or key in manifest['cities']:
        key += re.sub('[^a-z0-9]', '', p['county'].lower())
    resources = []
    seen = set()
    for r in p['resources'] + land.get(p['id'],{}).get('resources',[]):
        if r['url'] in seen: continue
        seen.add(r['url'])
        resources.append({'cat':r['category'], 'title':r['title'], 'url':r['url'],
            'note':r.get('note') or ('Official '+r.get('scope','local')+' source. Check the agency for current records.')})
    for t in profiles['transportation']:
        if t.get('county') == p['county'] and t.get('url') not in seen:
            resources.append({'cat':'Transportation','title':t.get('title',t.get('name','Transportation projects')), 'url':t['url'], 'note':t.get('note','Regional agency projects. Coverage can extend beyond this locality.')})
            seen.add(t['url'])
    h = read('housing/'+p['id']+'.json')
    rows = []
    for r in h['records']:
        stage = {'permitted':'approved','completed':'completed'}.get(r['stage'],r['stage'])
        if stage not in ['proposed','review','approved','construction','completed']: stage='review'
        desc = f"{r['status']}. {r['year']} housing report submitted to California HCD. This is a reported milestone, not a current construction inspection. Multiple milestones may describe the same address."
        rows.append({'id':r['id'], 'addr':r['address'] or r['name'], 'lat':r.get('lat'), 'lng':r.get('lng'), 'cat':'dev', 'type':'Residential',
            'desc':desc, 'units':r.get('units'), 'bmr':None, 'applicant':'See official record', 'filed':None, 'stage':stage,
            'lastDate':r.get('date'), 'lastNote':r['status']+' · check the source for later activity.', 'fileNo':r.get('apn',''),
            'flag':'A building permit does not establish that construction has started.' if r['stage']=='permitted' else None,
            'sourceUrl':r['source'], 'sourceType':'hcd-apr', 'sourceLabel':'HCD APR Table '+r['table'], 'reportYear':r['year'], 'apn':r.get('apn'),
            'districts':r.get('districts',[]), 'futureDistricts':r.get('futureDistricts',[]), 'locationSource':'HCD geocode screened against locality boundary' if r.get('lat') is not None else 'No verified location'})
    for eid in env['places'].get(p['id'],[]):
        r = env['records'][eid]
        display = filing_display(r)
        rows.append({'id':key+'-'+eid, 'addr':display['title'], 'originalTitle':display['originalTitle'], 'filingLabel':display['label'], 'documentType':display['documentType'], 'lat':None, 'lng':None, 'cat':'infra' if r['transportation'] else 'dev',
            'type':'Transportation' if r['transportation'] else 'Environmental review', 'desc':r['description'], 'units':None,'bmr':None,
            'applicant':r['agency'], 'filed':r['date'], 'stage':'filed', 'lastDate':r['date'],
            'lastNote':display['summary'], 'fileNo':r['sch'],
            'flag':'Environmental filing, not a construction status or a separate count of homes.', 'sourceUrl':r['source'],
            'sourceType':'ceqanet', 'sourceLabel':'California CEQAnet', 'locationSource':'No verified project coordinates'})
    rows.sort(key=lambda r:(r.get('lastDate') or ''), reverse=True)
    # Existing project templates accept HTML-ready strings. Imported documents are data.
    for row in rows:
        row['floodCoverage']=p['county'] in ['Santa Clara','San Mateo','San Francisco','Alameda','Contra Costa','Marin','Napa','Solano','Sonoma']
        for field in ['addr','type','desc','applicant','lastNote','fileNo','flag','originalTitle','filingLabel']:
            if isinstance(row.get(field),str): row[field]=html.escape(row[field],quote=True)
    write(OUT/(key+'.json'), {'records':rows})
    all_records[key] = rows
    s = stats[p['id']]
    st = { 'population':s.get('population'), 'medianIncome':s.get('income'), 'medianGrossRent':s.get('rent'),
        'renterSharePct':s.get('renterShare'), 'censusHomeValue':s.get('homeValue'), 'meanCommuteMin':s.get('commuteMinutes'),
        'transitSharePct':s.get('transitShare'), 'housingUnits':s.get('housingUnits'), 'medianYearBuilt':None,
        'homeValue':None, 'rent':None, 'homeValueSeries':[], 'rentSeries':[], 'asOf':s.get('period','ACS unavailable'), 'source':s.get('source'), 'margins':s.get('margins',{})}
    bodies = [{'name':b['name'],'when':'Check the official agenda and current membership', 'body':p.get('meetingScope',p['name'])+' public body. Open the official page for its responsibilities and ways to participate.', 'link':b['url'],'cat':'Civic'} for b in boards.get(p['id'],[])]
    deciders = [b for b in bodies if re.search(r'^(?:Mayor & |Mayor and )?(?:City Council|Town Council|Planning(?: (?:and|&) (?:Design|Environment|Housing))? Commission|Board of Supervisors)$',b['name'],re.I)]
    join = [b for b in bodies if b not in deciders]
    if not join: join=[{'name':'Boards, commissions and participation','when':'Check official vacancies','body':'Use the responsible government’s directory to review current boards and application instructions.','link':p['boardUrl'],'cat':'Civic'}]
    if not deciders: deciders=[{'name':p.get('meetingScope',p['name'])+' public meetings','when':'Check official agendas','body':'Current hearing notices, public comment instructions and meeting records.','link':p['meetingUrl']}]
    articles=[{'city':key,'topic':'developments','title':n['title'],'source':n['publisher'],'date':n['date'],'url':n['url'],'snippet':'','image':''} for n in news.get(p['id'],[])]
    for eid in env['places'].get(p['id'],[])[:4]:
        r=env['records'][eid]
        display=filing_display(r)
        excerpt=r['description'][:450]
        stop=max(excerpt.rfind('. '),excerpt.rfind('.\n'))
        excerpt=excerpt[:stop+1] if stop>24 else ''
        articles.append({'city':key,'topic':'transportation' if r['transportation'] else 'developments','title':display['title'],'source':'California CEQAnet · official filing','date':r['date'],'url':r['source'],'snippet':excerpt,'image':''})
    if not articles:
        articles=[{'city':key,'topic':'developments','title':p['name']+' official notices and planning records','source':'Official source directory','date':'','url':p['meetingUrl'],'snippet':'No locality-specific article imported. Follow the official source for current notices.','image':''}]
    b=p['bounds']
    c={'label':p['name'],'county':p['county'],'kind':p['kind'],'center':p['center'],'zoom':12,'bbox':{'minLng':b[0],'minLat':b[1],'maxLng':b[2],'maxLat':b[3]},
        'fips':p['geoid'][2:],'planning':next((r['url'] for r in resources if re.search('Planning|Projects',r['cat'])),p['website']),
        'meetings':p['meetingUrl'],'data':[{**r,'desc':r['desc'][:600]} for r in rows[:8]],'news':articles,'resources':resources,'stats':st,'deciders':deciders,'join':join,
        'note':'Public housing milestones and environmental filings, with official planning, meeting and board sources. Records cover the named locality, including portions outside a district. Environmental filings are not construction statuses.',
        'coverageId':p['id'],'districts':p['districts'],'futureDistricts':p['futureDistricts'],'recordCount':len(rows),'recordsUrl':'/data/coverage/'+key+'.json',
        'zoningLayers':land.get(p['id'],{}).get('layers',[])}
    manifest['cities'][key]=c
    feature=features.get(p['id'])
    if feature:
        geom=feature['geometry']
        polygons=geom['coordinates'] if geom['type']=='MultiPolygon' else [geom['coordinates']]
        rings=[[[lat,lng] for lng,lat in poly[0]] for poly in polygons]
        extra_boundaries['cities'][key]={'label':p['name'],'county':p['county'],'bbox':c['bbox'],'rings':rings,'ring':max(rings,key=len),'geojson':feature}
    manifest['activity'][key]={**h['metadata'],'reportYear':h['metadata'].get('year')}
    manifest['meetings'][key]={'label':p['name'],'county':p['county'],'links':[{'title':'Official agendas and participation','url':p['meetingUrl']},{'title':'Boards and commissions','url':p['boardUrl']}],'reviewed':'2026-10-25'}
    if p.get('client'): manifest['meetings'][key]['client']=p['client']
    photo=photos.get(p['id'])
    if not photo:
        neighbor=next((x for x in profiles['profiles'] if x['county']==p['county'] and x['id'] in photos),None)
        if neighbor: photo={**photos[neighbor['id']], 'caption':photos[neighbor['id']]['caption']+' · regional context'}
    if not photo:
        photo={**photos['p0660704'],'caption':photos['p0660704']['caption']+' · regional context'}
    if photo: manifest['photos'][key]={'url':photo['url'],'cap':photo['caption'],'by':photo['by'],'lic':photo['license'],'source':photo['source']}

write(OUT/'project-index.json',{r['id']:key for key,rows in all_records.items() for r in rows})
write(OUT/'manifest.json',manifest)
write(OUT/'boundaries.json',extra_boundaries)
(OUT/'manifest.js').write_text('/* Sourced coverage expansion; existing BayDashboard renderers and styling. */\nwindow.COVERAGE_EXPANSION='+json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+';\n')
print(f"{len(manifest['cities'])} additional places, {sum(len(r) for r in all_records.values())} records")
