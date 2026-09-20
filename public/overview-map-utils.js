// Shared, provider-independent rules for the Overview project map.
(function(root){
  const validPoint = p => Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
  function groupLocations(projects){
    const groups = new Map();
    for(const p of projects.filter(validPoint)){
      const key = p.lat.toFixed(6) + ',' + p.lng.toFixed(6);
      if(!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    return [...groups.values()];
  }
  function coverage(projects){
    const located = projects.filter(validPoint);
    return {total:projects.length,mapped:located.length,unlocated:projects.length-located.length,locations:groupLocations(located).length};
  }
  root.OverviewMapUtils = {validPoint,groupLocations,coverage};
})(typeof window === 'undefined' ? globalThis : window);
