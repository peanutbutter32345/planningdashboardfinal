(async()=>{
  const input=document.getElementById('coverageSearch'),rows=document.getElementById('coverageRows'),status=document.getElementById('coverageStatus');let cities=[];
  function draw(){const match=cities.filter(c=>c.label.toLowerCase().includes(input.value.toLowerCase()));rows.replaceChildren();for(const city of match){const row=document.createElement('tr');const label=document.createElement('td'),link=document.createElement('a');link.href='/?city='+encodeURIComponent(city.id);link.textContent=city.label;label.append(link);row.append(label);for(const value of [city.coverage,city.records,city.checkedRecords]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}rows.append(row);}status.textContent=match.length+' communities shown.';}
  input.addEventListener('input',draw);
  try{const response=await fetch('/api/coverage-quality');if(!response.ok)throw Error();cities=(await response.json()).cities;draw();}catch{status.textContent='Coverage counts could not load. Try again later.';}
})();
