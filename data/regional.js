// The browser and server share the same sourced regional profiles.
import {readFileSync} from 'node:fs';
export const REGIONAL_DATA=JSON.parse(readFileSync(new URL('../public/data/regions.json',import.meta.url),'utf8'));
const expansion=JSON.parse(readFileSync(new URL('../public/data/coverage/manifest.json',import.meta.url),'utf8'));
for(const [key,city] of Object.entries(expansion.cities)){
 if(!REGIONAL_DATA.cities[key])REGIONAL_DATA.cities[key]={...city,data:JSON.parse(readFileSync(new URL('../public/data/coverage/'+key+'.json',import.meta.url),'utf8')).records};
}
export const REGIONAL_CITIES=REGIONAL_DATA.cities;
