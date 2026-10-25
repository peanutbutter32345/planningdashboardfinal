// Santa Barbara publishes upcoming meetings as dated cards on its official calendar.
export const SANTA_BARBARA_CALENDAR='https://santabarbaraca.gov/government/boards-commissions/public-meeting-calendar';
function text(value=''){
 return value.replace(/<[^>]*>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n)))
  .replace(/&(amp|quot|apos|lt|gt|nbsp);/g,(_,n)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[n])).replace(/\s+/g,' ').trim();
}
export function parseSantaBarbaraCalendar(html,fromDate,toDate){
 const cards=[...html.matchAll(/<article\b[^>]*class="[^"]*\bevent-card\b[^"]*"[^>]*>([\s\S]*?)<\/article>/gi)];
 if(!cards.length)throw Error('Santa Barbara calendar format changed or no dated meeting cards were returned.');
 const meetings=new Map();
 for(const [,card] of cards){
  const link=card.match(/<a\b[^>]*class="event-card__link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
  const stamp=card.match(/datetime="(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2})"/i)?.[1];
  if(!link||!stamp)continue;
  const body=text(link[2]),date=stamp.slice(0,10),url=new URL(text(link[1]),SANTA_BARBARA_CALENDAR);
  if(url.origin!=='https://calendar.santabarbaraca.gov'||!url.pathname.startsWith('/event/'))continue;
  if(/cancelled|canceled/i.test(body)||date<fromDate||date>toDate)continue;
  const time=new Date(stamp).toLocaleTimeString('en-US',{timeZone:'America/Los_Angeles',hour:'numeric',minute:'2-digit'});
  const location=text(card.match(/class="event-card__location"[\s\S]*?<span>([\s\S]*?)<\/span>/i)?.[1]);
  meetings.set(body.toLowerCase()+'|'+stamp,{city:'santabarbara',body,date,time,location:location||null,agendaUrl:url.href,agendaFile:null,agendaPublished:false,source:'official-calendar',matters:[]});
 }
 return [...meetings.values()];
}
export async function fetchSantaBarbaraCalendar(fromDate,toDate){
 const response=await fetch(SANTA_BARBARA_CALENDAR,{signal:AbortSignal.timeout(12000),headers:{Accept:'text/html'}});
 if(!response.ok)throw Error('Santa Barbara calendar HTTP '+response.status);
 return parseSantaBarbaraCalendar(await response.text(),fromDate,toDate);
}
