// The city's eScribe page publishes local dates without timezone conversion.
export const SAN_LUIS_OBISPO_CALENDAR='https://pub-slocity.escribemeetings.com/';
function text(value=''){
 return value.replace(/<[^>]*>/g,' ').replace(/&(amp|quot|apos|lt|gt|nbsp);/g,(_,n)=>({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[n])).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/\s+/g,' ').trim();
}
export function parseSanLuisObispoCalendar(html,fromDate,toDate){
 const upcoming=html.split('class="upcoming-meetings"')[1]?.split('class="past-meetings-region"')[0];
 if(upcoming===undefined)throw Error('San Luis Obispo calendar format changed or was unavailable.');
 const cards=upcoming.split(/<div class="calendar-item">/).slice(1);
 if(!cards.length&&!/no (?:upcoming )?meetings/i.test(upcoming))throw Error('San Luis Obispo calendar returned no readable meeting cards.');
 const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
 const meetings=new Map();
 for(const card of cards){
  // Cancelled meetings can keep their original title and only publish a cancellation PDF.
  if(/cancell?ed|cancellation/i.test(card))continue;
  const heading=card.match(/<h3 class="meeting-title-heading">([\s\S]*?)<\/h3>/)?.[1];
  const body=text(heading);
  const dateText=text(card.match(/<div class="meeting-date">([\s\S]*?)<\/div>/)?.[1]);
  const match=dateText.match(/([A-Za-z]+) (\d{1,2}), (\d{4}) @ (\d{1,2}:\d{2} [AP]M)/);
  if(!body||!match||!months.includes(match[1]))continue;
  const date=`${match[3]}-${String(months.indexOf(match[1])+1).padStart(2,'0')}-${match[2].padStart(2,'0')}`;
  if(date<fromDate||date>toDate)continue;
  const href=heading.match(/href=['"]([^'"]+)['"]/)?.[1];
  const url=new URL(text(href)||SAN_LUIS_OBISPO_CALENDAR,SAN_LUIS_OBISPO_CALENDAR);
  if(url.origin!==new URL(SAN_LUIS_OBISPO_CALENDAR).origin)continue;
  meetings.set(body.toLowerCase()+'|'+date+'|'+match[4],{city:'sanluisobispo',body,date,time:match[4],location:null,agendaUrl:url.href,agendaFile:null,agendaPublished:false,source:'official-calendar',matters:[]});
 }
 return [...meetings.values()];
}
export async function fetchSanLuisObispoCalendar(fromDate,toDate){
 const response=await fetch(SAN_LUIS_OBISPO_CALENDAR,{signal:AbortSignal.timeout(12000),headers:{Accept:'text/html'}});
 if(!response.ok)throw Error('San Luis Obispo calendar HTTP '+response.status);
 return parseSanLuisObispoCalendar(await response.text(),fromDate,toDate);
}
