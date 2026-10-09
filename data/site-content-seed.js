// Private initial entries. Existing owner edits are preserved on restart.
export const SITE_CONTENT_SEED = [
  {id:'advisor-emily-gnecco',kind:'advisors',position:0,name:'Emily Gnecco',role:'Advisor',image:'/api/admin/site-content/assets/emily-gnecco.png',url:'https://www.livermoreca.gov/departments/community-development/planning'},
  {id:'advisor-erik-nolthenius',kind:'advisors',position:1,name:'Erik Nolthenius',role:'Planning Manager',organization:'City of Brentwood',image:'/api/admin/site-content/assets/erik.png',url:'https://www.brentwoodca.gov/Home/Components/StaffDirectory/StaffDirectory/162/'},
  {id:'advisor-kimberly-mosley',kind:'advisors',position:2,name:'Kimberly Mosley',role:'President & CEO',organization:'Los Altos Chamber of Commerce',image:'/api/admin/site-content/assets/kimberly-mosley.jpg',url:'https://www.losaltoschamber.org/chamber-staff/'},
  {id:'advisor-jeannice-fairrer-samani',kind:'advisors',position:3,name:'Dr. Jeannice Fairrer Samani',role:'Board Chair',organization:'Los Altos Chamber of Commerce',image:'/api/admin/site-content/assets/jeannice-fairrer-samani.png',url:'https://www.losaltoschamber.org/board-of-directors/'},
  {id:'feature-brisbane',kind:'featured',position:0,name:'City of Brisbane',title:'The Blast newsletter',image:'/api/admin/site-content/assets/brisbane.png',url:'https://www.brisbaneca.gov/m/newsflash/home/detail/418'},
  {id:'feature-south-bay-today',kind:'featured',position:1,name:'South Bay Today',title:'Local newsletter',image:'/api/admin/site-content/assets/south-bay-today.png',url:'https://southbaytoday.org/newsletters/2026-09-09'},
  {id:'feature-civic-tech-guide',kind:'featured',position:2,name:'Civic Tech Guide',title:'Civic technology directory',image:'/api/admin/site-content/assets/civic-tech-guide.png',url:'https://app.civictech.guide/p/the-bay-dashboard/r/recdHcix0MrMBeqXE'}
];

// Update only the previous defaults, preserving any administrator customizations.
export const SITE_CONTENT_PATCHES = [
  ['advisor-emily-gnecco','url','https://www.linkedin.com/in/emily-gnecco-389a6b287'],
  ['advisor-kimberly-mosley','url','https://www.linkedin.com/in/kimrmosley'],
  ['advisor-jeannice-fairrer-samani','url','https://jeannice.com/about/'],
  ['advisor-kimberly-mosley','image',''],
  ['advisor-jeannice-fairrer-samani','image','']
];
