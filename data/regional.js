// The browser and server share the same sourced regional profiles.
import {readFileSync} from 'node:fs';
export const REGIONAL_DATA=JSON.parse(readFileSync(new URL('../public/data/regions.json',import.meta.url),'utf8'));
export const REGIONAL_CITIES=REGIONAL_DATA.cities;
