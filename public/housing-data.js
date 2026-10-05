/* Shared merge keeps older researched records authoritative at matching addresses. */
(function(root){
 // Two records for one address, written two ways. The old key read the address with a regex that
 // wanted "<number> <word>", so a numeric ordinal defeated it: "1248 5th Avenue" fell through to
 // the raw text while "1248 Fifth Ave" produced a key, and the pair never matched. The same
 // happened across a suffix ("1030 3rd Street" against "1030 3rd St"), and a leading range took
 // the number after the hyphen, so "1855-81 Rollins Road" keyed on 81.
 //
 // Everything is normalised into one string instead: ordinals spelled either way, directionals,
 // street-type suffixes, and a range reduced to the parcel it starts at. Unit and building
 // designators are deliberately kept. HCD writes one row per permitted dwelling, so "992 HELEN AV
 // Unit: 1" is an accessory unit rather than the house, and "4188 Alpine Rd Bldg B" and "Bldg C"
 // are two buildings of three homes each. Folding those together would merge real records.
 const ORDINAL={first:'1st',second:'2nd',third:'3rd',fourth:'4th',fifth:'5th',sixth:'6th',
  seventh:'7th',eighth:'8th',ninth:'9th',tenth:'10th',eleventh:'11th',twelfth:'12th',
  thirteenth:'13th',fourteenth:'14th',fifteenth:'15th',sixteenth:'16th',seventeenth:'17th',
  eighteenth:'18th',nineteenth:'19th',twentieth:'20th'};
 const SUFFIX={street:'st',st:'st',avenue:'av',ave:'av',av:'av',road:'rd',rd:'rd',drive:'dr',dr:'dr',
  boulevard:'blvd',blvd:'blvd',court:'ct',ct:'ct',lane:'ln',ln:'ln',way:'wy',wy:'wy',place:'pl',pl:'pl',
  terrace:'ter',ter:'ter',circle:'cir',cir:'cir',parkway:'pkwy',pkwy:'pkwy',trail:'tr',tr:'tr',
  highway:'hwy',hwy:'hwy',square:'sq',sq:'sq',plaza:'plz',plz:'plz'};
 const DIRECTION={n:'north',s:'south',e:'east',w:'west',ne:'northeast',nw:'northwest',
  se:'southeast',sw:'southwest',north:'north',south:'south',east:'east',west:'west'};
 const SUFFIX_VALUES=Object.keys(SUFFIX).map(k=>SUFFIX[k]);
 function addressKey(value){
  let text=String(value||'').toLowerCase().replace(/,.*$/,' ');
  text=text.replace(/^(\s*\d+)\s*[-\u2013]\s*\d+/,'$1');
  text=text.replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  const words=text.split(' ').filter(Boolean).map(w=>ORDINAL[w]||DIRECTION[w]||SUFFIX[w]||w);
  // A trailing street-type word adds nothing once the rest matches, and is the single most
  // common difference between two spellings of one address.
  while(words.length>1&&SUFFIX_VALUES.indexOf(words[words.length-1])>=0)words.pop();
  return words.join(' ');
 }
 function merge(cities,snapshot){
  if(!snapshot?.cities)return;
  for(const [key,records] of Object.entries(snapshot.cities)){
   const city=cities[key];if(!city)continue;
   const existing=[...city.data,...(key==='sanjose'?(cities.westsanjose?.data||[]):[])];
   const seen=new Set(existing.map(p=>addressKey(p.addr)));
   const additions=records.filter(p=>{const id=addressKey(p.addr);if(seen.has(id))return false;seen.add(id);return true;});
   city.data.push(...additions);
   city.feed.push(...additions.filter(p=>p.lastDate).map(p=>({date:p.lastDate,id:p.id,title:p.addr,body:p.lastNote,stage:p.stage})));
   if(city.coverage==='directory')city.note='City resources and a sourced housing sample from HCD annual progress reports. These are reported milestones, not a complete current project inventory. Check official city records for later changes.';
   city.coverage='sample';city.housingActivity=snapshot.activity[key];
  }
 }
 // Totalling homes across records means counting each address once. Eleven addresses in the
 // curated data carry two records apiece, the same project filed at two stages: "1855-81 Rollins
 // Road" approved and "1855-1881 Rollins Rd" under construction, both reporting 420 homes. Both
 // are real filings and both belong in a register, but adding them says 840 homes were built
 // where 420 were. Where an address has more than one record, the largest count stands, which is
 // the conservative reading when two filings disagree.
 function sumUnits(records,field){
  const name=field||'units';
  const largest=new Map();
  for(const record of (records||[])){
   const value=Number(record&&record[name]);
   if(!isFinite(value)||value<=0)continue;
   // The server tags records with `city`; the All Cities aggregate uses `_sourceCity`; a single
   // city's own array carries neither and needs no namespace, because it is already one city.
   const id=(record.city||record._sourceCity||'')+'|'+addressKey(record.addr);
   if(!largest.has(id)||value>largest.get(id))largest.set(id,value);
  }
  let total=0;
  largest.forEach(function(v){total+=v;});
  return total;
 }
 root.DashboardHousing={merge,addressKey,sumUnits};
})(globalThis);
