// Regional Housing Needs Allocation progress, from the state's own 6th Cycle RHNA Progress Report
// on the California Open Data Portal (dataset: RHNA Progress Report, 6th Cycle resource).
//
// Every city is assigned a housing target for the cycle, split across four income bands, and
// reports the units it has permitted against each. This is the number that decides whether a
// city's Housing Element stays compliant, which in turn decides whether Builder's Remedy applies
// there. It is the reason several projects in this dashboard carry a Builder's Remedy flag.
//
// units = permitted so far this cycle. target = the city's allocation for the cycle.
// Pulled once and embedded: the state refreshes this a few times a year, not daily.
export const RHNA_PERIOD = '01/31/2023 - 01/31/2031';
export const RHNA = {
  campbell: { vli:[42,752], li:[43,434], mod:[43,499], above:[132,1292], units:260, target:2977, pct:8.7 },
  cupertino: { vli:[41,1193], li:[41,687], mod:[42,755], above:[135,1953], units:259, target:4588, pct:5.6 },
  gilroy: { vli:[33,669], li:[32,385], mod:[32,200], above:[309,519], units:406, target:1773, pct:22.9 },
  losaltos: { vli:[99,501], li:[142,288], mod:[117,326], above:[248,843], units:606, target:1958, pct:30.9 },
  losaltoshills: { vli:[19,125], li:[19,72], mod:[58,82], above:[19,210], units:115, target:489, pct:23.5 },
  losgatos: { vli:[43,537], li:[36,310], mod:[36,320], above:[57,826], units:172, target:1993, pct:8.6 },
  milpitas: { vli:[59,1685], li:[25,970], mod:[59,1131], above:[267,2927], units:410, target:6713, pct:6.1 },
  montesereno: { vli:[21,53], li:[6,30], mod:[3,31], above:[24,79], units:54, target:193, pct:28.0 },
  morganhill: { vli:[65,262], li:[0,151], mod:[87,174], above:[508,450], units:660, target:1037, pct:63.6 },
  mountainview: { vli:[259,2773], li:[92,1597], mod:[73,1885], above:[502,4880], units:926, target:11135, pct:8.3 },
  paloalto: { vli:[41,1556], li:[47,896], mod:[81,1013], above:[456,2621], units:625, target:6086, pct:10.3 },
  santaclara: { vli:[103,2872], li:[241,1653], mod:[137,1981], above:[1063,5126], units:1544, target:11632, pct:13.3 },
  saratoga: { vli:[83,454], li:[91,261], mod:[81,278], above:[200,719], units:455, target:1712, pct:26.6 },
  sunnyvale: { vli:[170,2968], li:[115,1709], mod:[173,2032], above:[637,5257], units:1095, target:11966, pct:9.2 },
  westsanjose: { vli:[1971,15088], li:[1945,8687], mod:[2184,10711], above:[1719,27714], units:7819, target:62200, pct:12.6 },
};

export const RHNA_SOURCE = {
  label: 'California HCD, 6th Cycle RHNA Progress Report',
  url: 'https://data.ca.gov/dataset/rhna-progress-report',
  asOf: 'August 2026',
};
