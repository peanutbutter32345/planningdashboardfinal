/* The 3D view shared by the Future Map, the overview map and Your Area.
 *
 * Everything it uses is free and keyless, so nothing here adds a bill or an account:
 *   - MapLibre GL JS (BSD-3) from the CDN this site already loads Leaflet from;
 *   - OpenFreeMap's Liberty vector tiles, which carry the real building footprints and heights
 *     OpenStreetMap holds, already styled as a `building-3d` extrusion layer;
 *   - the public AWS terrarium elevation tiles for the hills the Peninsula is built on.
 *
 * None of it is fetched until a reader presses a 3D button, so a reader who never opens 3D pays
 * nothing for it.
 *
 * Callers hand over plain points, not their own record shapes:
 *   {id, lat, lng, label, sub, value, tone, color?, height?, radius?, detail?}
 * `value` drives the height of the column, `tone` (0-1) its colour along the ramp below, and
 * `color` overrides that ramp where a caller already has its own colour code for a point.
 */
const CDN = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/5.6.1/';
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
// Height grows with the square root of `value`, not in proportion to it: San Jose holds several
// thousand-home plans, and at any honest linear scale every one of them pinned to the ceiling
// while the 40-home infills vanished. Square root keeps the order intact - a taller column is
// always more - and keeps the whole range on screen at once. Each map's note says so.
const HEIGHT_SCALE = 6;
const MIN_HEIGHT = 8;
const MAX_HEIGHT = 420;
const SOURCE = 'fx-points-3d';
const RAMP = ['interpolate', ['linear'], ['get', 'tone'],
 0, '#C8CDBC', 0.35, '#A3AC90', 0.65, '#67794A', 1, '#3E4F24'];

let loader = null;
function loadLibrary(){
 if(window.maplibregl) return Promise.resolve(window.maplibregl);
 if(loader) return loader;
 loader = new Promise((resolve, reject) => {
  if(!document.getElementById('maplibre-css')){
   const css = document.createElement('link');
   css.id = 'maplibre-css'; css.rel = 'stylesheet'; css.href = CDN + 'maplibre-gl.css';
   document.head.appendChild(css);
  }
  const script = document.createElement('script');
  script.src = CDN + 'maplibre-gl.js';
  script.onload = () => window.maplibregl ? resolve(window.maplibregl) : reject(Error('the 3D map library did not initialise'));
  script.onerror = () => { loader = null; reject(Error('the 3D map library could not be downloaded')); };
  document.head.appendChild(script);
 });
 return loader;
}

function webglAvailable(){
 try{
  const canvas = document.createElement('canvas');
  return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
 }catch{ return false; }
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const placed = points => points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));

// A column is a short polygon ring around the point itself. Metres are converted to degrees at
// this latitude so a column is round on the ground rather than stretched north-south.
function ring(lat, lng, metres, sides = 14){
 const dLat = metres / 111320;
 const dLng = metres / (111320 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
 const points = [];
 for(let i = 0; i <= sides; i++){
  const angle = (i / sides) * Math.PI * 2;
  points.push([lng + Math.cos(angle) * dLng, lat + Math.sin(angle) * dLat]);
 }
 return [points];
}

function columns(points){
 return {
  type: 'FeatureCollection',
  features: points.map(p => {
   const value = Math.max(0, Number(p.value) || 0);
   const height = p.height ?? Math.min(MAX_HEIGHT, MIN_HEIGHT + Math.sqrt(value) * HEIGHT_SCALE);
   const radius = p.radius ?? Math.max(16, Math.min(70, 14 + Math.sqrt(Math.max(value, 1)) * 1.7));
   const properties = {
    id: String(p.id ?? ''), label: p.label || '', sub: p.sub || '', detail: p.detail || '',
    tone: Math.max(0, Math.min(1, Number(p.tone) || 0)), height,
   };
   if(p.color) properties.color = p.color;
   return { type: 'Feature', id: properties.id, properties,
    geometry: { type: 'Polygon', coordinates: ring(p.lat, p.lng, radius) } };
  }),
 };
}

// Where the points actually are. Fitting every record in a big city lands the camera at about
// zoom 11, where columns are hairlines - so 3D opens over the heaviest cluster instead, and
// Fit area is still there for the whole picture.
function busiest(points){
 let best = null, bestWeight = -1;
 for(const anchor of points){
  let weight = 0;
  for(const other of points){
   const dx = (other.lng - anchor.lng) * 88, dy = (other.lat - anchor.lat) * 111;   // km, near 37N
   if(dx * dx + dy * dy <= 4) weight += Math.max(1, Number(other.value) || 0);      // within 2 km
  }
  if(weight > bestWeight){ bestWeight = weight; best = anchor; }
 }
 return best;
}

function boundsOf(points, maplibregl){
 if(!points.length) return null;
 const box = new maplibregl.LngLatBounds();
 points.forEach(p => box.extend([p.lng, p.lat]));
 return box;
}

export const ThreeD = {
 /* container: the element the canvas goes in.
    fullscreenTarget: the element the fullscreen button should blow up (the whole map card,
    usually, so the year slider and legend come with it). */
 async mount(container, { onSelect = () => {}, fullscreenTarget = null, center = [-122.19, 37.43], zoom = 12.4 } = {}){
  if(!webglAvailable()) throw Error('this browser has WebGL turned off');
  const maplibregl = await loadLibrary();
  const map = new maplibregl.Map({
   container, style: STYLE_URL, center, zoom,
   pitch: 62, bearing: -18, maxPitch: 80,
   attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
  map.addControl(new maplibregl.FullscreenControl(
   fullscreenTarget ? { container: fullscreenTarget } : {}), 'top-right');
  const popup = new maplibregl.Popup({ closeButton: true, maxWidth: '260px' });

  // Wait for the style to parse, not for the first frame: a browser that has the tab in the
  // background throttles rendering, and a map that never paints would otherwise never finish
  // starting. Sources and layers can be added as soon as the style is in place.
  await new Promise((resolve, reject) => {
   if(map.isStyleLoaded()) return resolve();
   const fail = setTimeout(() => reject(Error('the 3D basemap timed out')), 20000);
   map.once('style.load', () => { clearTimeout(fail); resolve(); });
   map.once('error', e => { clearTimeout(fail); reject(Error(e?.error?.message || 'the 3D basemap could not load')); });
  });

  // Terrain: the public elevation tiles, gently exaggerated so the hills read at city zoom.
  map.addSource('fx-terrain', { type: 'raster-dem', tiles: [TERRAIN_TILES], tileSize: 256,
   encoding: 'terrarium', maxzoom: 14,
   attribution: 'Elevation: <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a>' });
  map.setTerrain({ source: 'fx-terrain', exaggeration: 1.25 });
  map.setSky({ 'sky-color': '#bcd0e4', 'horizon-color': '#e6ecd8', 'fog-color': '#e9eee1',
   'fog-ground-blend': 0.6, 'sky-horizon-blend': 0.7, 'horizon-fog-blend': 0.5 });

  map.addSource(SOURCE, { type: 'geojson', data: columns([]) });
  const paintColor = ['case', ['has', 'color'], ['get', 'color'], RAMP];
  // A 40 m column is a fraction of a pixel when a whole county is on screen, so below the zoom
  // where columns become legible the same points are drawn as dots, and hand over as you descend.
  map.addLayer({
   id: 'fx-dots', type: 'circle', source: SOURCE, maxzoom: 12.5,
   paint: {
    'circle-color': paintColor, 'circle-opacity': 0.9,
    'circle-stroke-width': 0.9, 'circle-stroke-color': '#ffffff',
    'circle-radius': ['interpolate', ['linear'], ['get', 'height'], 8, 3.5, 120, 8, 420, 15],
   },
  });
  map.addLayer({
   id: 'fx-columns', type: 'fill-extrusion', source: SOURCE, minzoom: 12.5,
   paint: {
    'fill-extrusion-height': ['get', 'height'],
    'fill-extrusion-base': 0,
    'fill-extrusion-opacity': 0.92,
    'fill-extrusion-color': paintColor,
    // The transition is what makes a column grow when the scenario year moves.
    'fill-extrusion-height-transition': { duration: 700, delay: 0 },
    'fill-extrusion-color-transition': { duration: 700, delay: 0 },
   },
  });
  // Real buildings step back when the reader is looking at a whole city, so the columns stay
  // readable; they come back in as the reader zooms into a neighbourhood.
  if(map.getLayer('building-3d')) map.setPaintProperty('building-3d', 'fill-extrusion-opacity',
   ['interpolate', ['linear'], ['zoom'], 14, 0.45, 16, 0.85]);

  for(const layer of ['fx-columns', 'fx-dots']){
   map.on('click', layer, e => {
    const p = e.features?.[0]?.properties; if(!p) return;
    onSelect(p.id);
    popup.setLngLat(e.lngLat).setHTML(
     '<div style="font:13px/1.45 system-ui,sans-serif"><b>' + esc(p.label) + '</b>' +
     (p.sub ? '<br>' + esc(p.sub) : '') +
     (p.detail ? '<br>' + esc(p.detail) : '') + '</div>').addTo(map);
   });
   map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
   map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
  }

  let current = [];
  return {
   map,
   count(){ return current.length; },
   update(points, { fit = false, focus = false } = {}){
    map.resize();   // the card changes height when the reader expands it or turns the phone
    current = placed(points);
    map.getSource(SOURCE)?.setData(columns(current));
    if(focus) this.focus(); else if(fit) this.fit();
    return current.length;
   },
   focus(){
    const anchor = busiest(current);
    // 14.3 rather than 13: real OpenStreetMap buildings only extrude from zoom 14, and the
    // columns mean more standing among the blocks they would be built in.
    if(anchor) map.easeTo({ center: [anchor.lng, anchor.lat], zoom: 14.3, pitch: 62, duration: 1100 });
    else this.fit();
   },
   fit(){
    const box = boundsOf(current, window.maplibregl);
    if(!box) return;
    // fitBounds drops the camera flat, and a flat 3D map is just a slower 2D map. Ask it where it
    // would put the camera, then fly there keeping the tilt.
    const camera = map.cameraForBounds(box, { padding: 70, maxZoom: 14.2, bearing: map.getBearing() });
    if(camera) map.easeTo({ ...camera, pitch: 62, duration: 900 });
    else map.easeTo({ center: box.getCenter(), zoom: 13, pitch: 62, duration: 900 });
   },
   flyTo(lat, lng){
    if(Number.isFinite(lat) && Number.isFinite(lng))
     map.easeTo({ center: [lng, lat], zoom: 15.4, pitch: 62, duration: 900 });
   },
   resize(){ map.resize(); },
   destroy(){ popup.remove(); map.remove(); },
  };
 },
};
