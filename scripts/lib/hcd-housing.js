// HCD APR records describe reported milestones, not a live construction status.
export const RESOURCE_IDS={A:'c78b769d-cc02-4050-91ef-79ded665b5a8',A2:'fe505d9b-8c36-42ba-ba30-08bc4f34e022'};
export const normalizeName=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const clean=s=>String(s||'').replace(/[<>]/g,'').replace(/"/g,'”').replace(/\s+/g,' ').trim();
const number=s=>s!==null&&s!==''&&Number.isFinite(Number(s))&&Number(s)>=0?Number(s):null;
const date=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&s>='2000-01-01'&&s<='2026-09-19'?s:null;
const validText=s=>{const t=clean(s);return /^(?:-|0|n\/?a|none|null)$/i.test(t)?'':t;};
const restricted=(r,prefix)=>{const values=['ACUTELY_LOW','EXTREMELY_LOW','VLOW','LOW','MOD'].map(k=>number(r[prefix+k+'_INCOME_DR']));return values.every(v=>v===null)?null:values.reduce((sum,v)=>sum+(v||0),0);};
export function recordIdentity(r){return normalizeName(r.STREET_ADDRESS)||normalizeName(r.APN)||normalizeName(r.JURS_TRACKING_ID);}
export function normalizeRecord(r,table,city){
 let stage,units,lastDate,prefix='',reportedStatus;
 if(table==='A'){
  if(!['Pending','Approved'].includes(r.APPLICATION_STATUS))return null;
  stage=r.APPLICATION_STATUS==='Approved'?'approved':'review';
  units=number(r.APPLICATION_STATUS==='Approved'?r.TOT_APPROVED_UNITS:r.TOT_PROPOSED_UNITS);
  lastDate=stage==='approved'?null:date(r.APP_SUBMIT_DT);reportedStatus=r.APPLICATION_STATUS==='Approved'?'Application approved in annual report':'Application pending in annual report';
 }else{
  if(number(r.NO_OTHER_FORMS_OF_READINESS)>0){stage='completed';units=number(r.NO_OTHER_FORMS_OF_READINESS);lastDate=date(r.CO_ISSUE_DT1);prefix='CO_';reportedStatus='Occupancy / readiness reported';}
  else if(number(r.NO_BUILDING_PERMITS)>0){stage='approved';units=number(r.NO_BUILDING_PERMITS);lastDate=date(r.BP_ISSUE_DT1);prefix='BP_';reportedStatus='Building permit issued';}
  else if(number(r.NO_ENTITLEMENTS)>0){stage='approved';units=number(r.NO_ENTITLEMENTS);lastDate=date(r.ENT_APPROVE_DT1);reportedStatus='Entitlement issued';}
  else return null;
 }
 if(!(units>0)||!recordIdentity(r))return null;
 const address=validText(r.STREET_ADDRESS),name=validText(r.PROJECT_NAME),apn=validText(r.APN);
 if(!address&&!name&&!apn)return null;
 // HCD includes geocodes outside the reporting city. Require a high match score and nearby location.
 let lat=number(r.LATITUDE),lng=r.LONGITUDE!==null&&r.LONGITUDE!==''?Number(r.LONGITUDE):null;
 const center=city.key==='sanfrancisco'?{lat:37.7749,lng:-122.4194}:city.center;
 const km=lat!==null&&Number.isFinite(lng)?Math.hypot((lat-center.lat)*111,(lng-center.lng)*88):Infinity;
 const maxKm=['sanjose','livermore','fairfield','santarosa'].includes(city.key)?30:18;
 if(!(number(r.SCORE)>=90&&km<=maxKm&&lat>=36.8&&lat<=39&&lng>=-123.3&&lng<=-121.3)){lat=null;lng=null;}
 const sourceUrl='https://data.ca.gov/api/3/action/datastore_search?'+new URLSearchParams({resource_id:RESOURCE_IDS[table],filters:JSON.stringify({_id:r._id}),limit:'1'});
 const kind=validText(r.UNIT_CAT)||'Housing',affordable=restricted(r,prefix);
 const milestone=reportedStatus.toLowerCase();
 const annualNote='Annual '+r.YEAR+' city submission to California HCD; not a live status. Units refer to the reported milestone and may represent one phase. Permitting does not establish that construction started.';
 return {id:'hcd-'+city.key+'-'+table.toLowerCase()+'-'+r._id,addr:address||name||'Parcel '+apn,lat,lng,cat:'dev',type:'Residential',stage,reportedStatus,units,bmr:affordable===null?null:Math.min(units,affordable),applicant:'',fileNo:validText(r.JURS_TRACKING_ID)||'APN '+apn,filed:table==='A'?date(r.APP_SUBMIT_DT):null,lastDate,
  desc:(name&&name!==address?name+'. ':'')+kind+' · '+units.toLocaleString('en-US')+' reported homes. '+annualNote,
  lastNote:reportedStatus+(lastDate?' · '+lastDate:' · '+r.YEAR+' annual report')+'. Check the city for subsequent activity.',
  sourceUrl,sourceType:'hcd-apr',sourceLabel:'HCD APR Table '+table,reportYear:Number(r.YEAR),sourceRecordId:r._id,apn,locationSource:lat===null?'Unverified location':'HCD ArcGIS geocode · approximate',geocodeScore:number(r.SCORE),flag:lastDate?null:'The annual report does not provide an exact milestone date.'};
}
