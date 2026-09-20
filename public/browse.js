/* Shared, bounded navigation for the city directory and topic collections. */
(function(root){
 function citiesIn(cities,county='',query=''){
  const q=query.trim().toLowerCase();
  return Object.entries(cities).filter(([key,c])=>key!=='all'&&(!county||c.county===county)&&(!q||c.label.toLowerCase().includes(q))).sort((a,b)=>a[1].label.localeCompare(b[1].label));
 }
 function page(items,index,size){
  size=Math.max(1,Math.floor(size)||1);
  const pages=Math.max(1,Math.ceil(items.length/size));
  index=Math.min(pages-1,Math.max(0,Math.floor(index)||0));
  return {items:items.slice(index*size,(index+1)*size),index,pages,total:items.length,start:items.length?index*size+1:0,end:Math.min(items.length,(index+1)*size)};
 }
 function setupValid(setup,counties){return Boolean(setup&&counties.includes(setup.county));}
 function swipeDirection(start,end){const dx=end.x-start.x,dy=end.y-start.y;return Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5?(dx<0?1:-1):0;}
 // A page holds whole rows of the grid, not a fixed count: three cards on a desktop row meant one
 // row per page (Housing read "1 / 48"). Four rows fill a screen; anything shorter needs no pager.
 const ROWS_PER_PAGE=4;
 function columnsOf(el){
  const raw=getComputedStyle(el).gridTemplateColumns||'';
  const repeated=raw.match(/repeat\((\d+)/);           // hidden screens report the unresolved value
  if(repeated)return Math.max(1,Number(repeated[1]));
  const tracks=raw.split(' ').filter(part=>part&&part!=='none');
  if(tracks.length)return tracks.length;
  return matchMedia('(max-width: 680px)').matches?1:3;
 }
 function mountPager(host,items,render,{label='Records',key='',gridClass='register-grid',onRender=()=>{}}={}){
  host._pagerCleanup?.();
  let index=host.dataset.pageKey===key?Number(host.dataset.pageIndex)||0:0;
  host.dataset.pageKey=key;
  host.classList.add('collection-pager');host.classList.remove('register-grid','news-grid');
  host.innerHTML='<div class="pager-toolbar"><span class="pager-count" role="status" aria-live="polite"></span><div class="pager-controls"><button type="button" class="btn secondary" data-page-prev aria-label="Previous page of '+label+'">←</button><span class="pager-position"></span><button type="button" class="btn secondary" data-page-next aria-label="Next page of '+label+'">→</button></div></div><div class="pager-items '+gridClass+'" tabindex="0" aria-label="'+label+'; use left and right arrow keys to change page"></div><p class="pager-hint">Swipe or use the arrows to explore.</p>';
  const content=host.querySelector('.pager-items'),prev=host.querySelector('[data-page-prev]'),next=host.querySelector('[data-page-next]');
  const toolbar=host.querySelector('.pager-toolbar'),hint=host.querySelector('.pager-hint');
  const size=()=>Math.max(1,columnsOf(content)*ROWS_PER_PAGE);
  let renderedSize=size();
  function draw(){const p=page(items,index,size());index=p.index;renderedSize=size();host.dataset.pageIndex=index;
   content.innerHTML=p.items.length?p.items.map(render).join(''):'<div class="empty">No records in this view. Try the Bay Area view or another city.</div>';
   host.querySelector('.pager-count').textContent=p.total?p.start+'–'+p.end+' of '+p.total.toLocaleString()+' '+label.toLowerCase():'No '+label.toLowerCase();
   host.querySelector('.pager-position').textContent=(index+1)+' / '+p.pages;prev.disabled=index===0;next.disabled=index===p.pages-1;
   // One page means the whole collection is on screen: no controls, no swipe hint.
   const single=p.pages<=1;toolbar.hidden=single;hint.hidden=single;
   onRender(content);
  }
  function move(delta){const nextIndex=page(items,index+delta,size()).index;if(nextIndex!==index){index=nextIndex;draw();}}
  prev.onclick=()=>move(-1);next.onclick=()=>move(1);
  content.onkeydown=e=>{if(e.target!==content)return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);}};
  let start=null;
  content.addEventListener('touchstart',e=>{if(e.touches.length===1)start={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
  content.addEventListener('touchend',e=>{if(!start)return;const t=e.changedTouches[0],delta=swipeDirection(start,{x:t.clientX,y:t.clientY});start=null;if(delta)move(delta);},{passive:true});
  content.addEventListener('touchcancel',()=>{start=null;},{passive:true});
  // Column count follows the CSS breakpoints, so re-measure on any resize and keep the reader's place.
  let resizeTimer=0;
  const resize=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{
   const next=size();if(next===renderedSize)return;index=Math.floor(index*renderedSize/next);draw();},150);};
  addEventListener('resize',resize);
  host._pagerCleanup=()=>{clearTimeout(resizeTimer);removeEventListener('resize',resize);};draw();
 }
 root.DashboardBrowse={citiesIn,page,setupValid,swipeDirection,mountPager};
})(globalThis);
