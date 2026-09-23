// Shared photo treatment, retaining each section's existing controls and live labels.
(function(){
 const sections=[
  ['screenDashboard','Overview','PROJECTS · PLACE · PROGRESS','Explore local proposals, follow their status, and find the public records behind the map.','berkeley',null],
  ['screenYourArea','Your area','NEIGHBORHOOD · MAP · CONNECTIONS','The projects, meetings and places closest to you.','sunnyvale','.yourarea-head h2'],
  ['screenPlanner','Get involved','MEETINGS · VOICE · COMMUNITY','Find local decision makers, official agendas and ways to take part.','hayward','.planner-shell > h2'],
  ['screenMeetingSummary','Summarize recent meetings','MEETINGS · RECAPS · CLARITY','Pick a city and get a plain-language summary of what its council and boards actually did.','losgatos','.planner-shell > h2'],
  ['screenHousing','Housing','HOMES · AFFORDABILITY · POLICY','Explore housing proposals, public policy and the path from application to construction.','dalycity','.planner-shell > h2'],
  ['screenDevelopments','Developments','WORKPLACES · STREETS · CHANGE','Follow the commercial, civic and mixed-use projects shaping the Bay Area.','sanjose','.planner-shell > h2'],
  ['screenTransportation','Transportation','TRANSIT · MOBILITY · CONNECTIONS','Explore rail, roads, walking and cycling projects - and how the region gets around.','sancarlos','.planner-shell > h2'],
  ['screenStatistics','Statistics','HOUSING · PEOPLE · PERSPECTIVE','Compare housing, income, population and travel across the region.','oakland','.planner-shell > h2'],
  ['screenResources','Resources','OFFICIAL SOURCES · LOCAL KNOWLEDGE','The planning tools, public documents and city contacts behind the dashboard.','redwoodcity','.planner-shell > h2'],
  ['screenAsk','Ask a Question','QUESTIONS · CONTEXT · SOURCES','Ask about local projects, housing, transportation, public meetings and participation.','mountainview','.ask-head h2'],
  ['screenTimeline','Your timeline','FOLLOW · LEARN · TAKE PART','Build a personal track through the places and topics you care about.','sausalito',null],
  ['screenAccount','Your account','YOUR PLACES · SAVED IDEAS · NEXT STEPS','Make this dashboard yours. Manage your profile, saved projects and local interests.','fremont',null],
  ['screenBank','Resource bank','EXPLORE · SEARCH · DISCOVER','Search projects, news, official resources and statistics from across the Bay Area.','sanfrancisco','.bank-hero h2'],
  ['screenAbout','About this dashboard','NINE COUNTIES · PUBLIC RECORDS · SHARED FUTURE','A clearer view of the places we share, built from public sources.','tiburon','.about-hero h2']
 ];
 for(const [id,title,kicker,description,photoKey,headingSelector] of sections){
  const screen=document.getElementById(id);if(!screen)continue;
  const photo=window.LOCAL_CITY_PHOTOS?.[photoKey];
  const host=screen.querySelector('.wrap')||screen,header=document.createElement('header');
  header.className='section-masthead';header.dataset.photo=photoKey;
  if(photo)header.style.setProperty('--section-photo','url("'+photo.url+'")');
  const eyebrow=document.createElement('div');eyebrow.className='section-eyebrow';eyebrow.textContent=kicker;
  const original=headingSelector?screen.querySelector(headingSelector):null;
  const lead=original?.nextElementSibling?.matches('p.section-note,p.bank-lede')?original.nextElementSibling:null;
  const heading=original||document.createElement('h2');heading.textContent=title;
  const body=document.createElement('div');body.className='section-masthead-copy';body.append(eyebrow,heading);
  const paragraph=lead||document.createElement('p');if(!lead)paragraph.textContent=description;body.append(paragraph);
  header.append(body);
  if(photo){const credit=document.createElement('a');credit.className='section-photo-credit';credit.href='/photo-credits.html';credit.textContent=photo.cap+' · Photo credits ↗';header.append(credit);}
  host.prepend(header);
 }
 const about=document.querySelector('#screenAbout .about-hero');if(about)about.hidden=true;
})();
