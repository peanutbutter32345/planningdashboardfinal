// Pure spatial screening and scenario economics. All economic parameters are assumptions.
export function pointInRing(point,ring){
 const [x,y]=point;let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [xi,yi]=ring[i],[xj,yj]=ring[j];
  const cross=(x-xi)*(yj-yi)-(y-yi)*(xj-xi);
  if(Math.abs(cross)<1e-12&&x>=Math.min(xi,xj)&&x<=Math.max(xi,xj)&&y>=Math.min(yi,yj)&&y<=Math.max(yi,yj))return true;
  if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
 }return inside;
}
export function pointInGeometry(point,geometry){
 if(!geometry)return false;
 const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];
 return polygons.some(rings=>rings.length&&pointInRing(point,rings[0])&&!rings.slice(1).some(ring=>pointInRing(point,ring)));
}
export function hazardIndex(collection){
 return collection.features.filter(f=>f.geometry).map(f=>{
  const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const rings of polygons)for(const ring of rings)for(const [x,y] of ring){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  return {feature:f,bounds:[minX,minY,maxX,maxY]};
 });
}
export function screenFlood(project,index){
 if(!Number.isFinite(project.lat)||!Number.isFinite(project.lng)||!index)return {level:'unknown',label:'Not screened'};
 let moderate=null;
 for(const {feature,bounds:[minX,minY,maxX,maxY]} of index){
  if(project.lng<minX||project.lng>maxX||project.lat<minY||project.lat>maxY)continue;
  if(!pointInGeometry([project.lng,project.lat],feature.geometry))continue;
  const p=feature.properties;
  if(p.SFHA_TF==='T')return {level:'high',label:'FEMA special flood hazard area',zone:p.FLD_ZONE};
  moderate={level:'moderate',label:'FEMA 0.2% annual-chance zone',zone:p.FLD_ZONE};
 }
 return moderate||{level:'unmatched',label:'No mapped hazard match (not no risk)'};
}
export function priceScenario({homeValue,stock,deltaUnits,year,trend=2,elasticity=1,floodDiscount=0,exposed=false}){
 if(!Number.isFinite(homeValue)||homeValue<=0||!Number.isFinite(stock)||stock<=0||!Number.isFinite(deltaUnits))return null;
 const elapsed=Math.max(0,year-2026);
 const reference=homeValue*(1+trend/100)**elapsed;
 // Sensitivity to modeled gross delivery relative to a dated housing-stock denominator.
 const supplyFactor=Math.exp(Math.max(-.3,Math.min(.3,-elasticity*deltaUnits/stock)));
 const scenario=reference*supplyFactor;
 const exposedExample=scenario*(1-(exposed?floodDiscount:0)/100);
 return {observed:homeValue,reference,scenario,exposedExample,delta:scenario-reference,percent:(supplyFactor-1)*100};
}
export function annualElectricityGWh(homes,kwhPerHome){return Math.max(0,homes)*Math.max(0,kwhPerHome)/1e6;}
export const FUEL_NAMES={NG:'Natural gas',BAT:'Battery storage',SUN:'Solar',OBG:'Other biogas',LFG:'Landfill gas',OIL:'Petroleum',OGW:'Other gas / waste'};
