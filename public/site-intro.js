(() => {
  const about=document.getElementById('introAbout'),more=document.getElementById('introMore'),details=document.getElementById('introDetails');
  let pinned=false;
  function expand(open){details.hidden=!open;more.setAttribute('aria-expanded',String(open));}
  more.addEventListener('click',()=>{pinned=!pinned;expand(pinned);});
  about.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')expand(true);});
  about.addEventListener('pointerleave',()=>{if(!pinned&&!about.contains(document.activeElement))expand(false);});
  about.addEventListener('focusin',()=>expand(true));
  about.addEventListener('focusout',event=>{if(!pinned&&!about.contains(event.relatedTarget))expand(false);});
  document.addEventListener('click',event=>{if(!about.contains(event.target)){pinned=false;expand(false);}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){pinned=false;expand(false);}});
  const dialog=document.getElementById('siteTourDialog'),video=document.getElementById('siteTourVideo'),watch=document.getElementById('watchTour');
  let previousOverflow='';
  watch.addEventListener('click',()=>{
    if(!video.getAttribute('src'))video.src='/media/bay-dashboard-tour.mp4';
    previousOverflow=document.body.style.overflow;
    dialog.showModal();document.body.style.overflow='hidden';
    video.play().catch(()=>{/* Native controls remain available if playback is blocked. */});
  });
  document.getElementById('closeSiteTour').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>{video.pause();document.body.style.overflow=previousOverflow;watch.focus({preventScroll:true});});
  const chapters=[...dialog.querySelectorAll('[data-tour-time]')];
  chapters.forEach(button=>button.addEventListener('click',()=>{
    const seek=()=>{video.currentTime=Number(button.dataset.tourTime);video.play().catch(()=>{});};
    if(video.readyState>=1)seek();else video.addEventListener('loadedmetadata',seek,{once:true});
  }));
  video.addEventListener('timeupdate',()=>{
    const active=Math.min(5,Math.floor(video.currentTime/5));
    chapters.forEach((button,index)=>{if(index===active)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');});
  });
  video.addEventListener('error',()=>{document.getElementById('siteTourError').hidden=false;});
})();
