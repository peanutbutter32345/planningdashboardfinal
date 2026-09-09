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
  // ---- San Mateo County, from the same 6th Cycle progress report ----
  atherton: { vli:[28,94], li:[15,54], mod:[8,56], above:[93,144], units:144, target:348, pct:41.4 },
  belmont: { vli:[102,488], li:[98,281], mod:[25,283], above:[16,733], units:241, target:1785, pct:13.5 },
  brisbane: { vli:[8,317], li:[4,183], mod:[4,303], above:[3,785], units:19, target:1588, pct:1.2 },
  burlingame: { vli:[121,863], li:[79,497], mod:[39,529], above:[718,1368], units:957, target:3257, pct:29.4 },
  colma: { vli:[0,44], li:[1,25], mod:[0,37], above:[0,96], units:1, target:202, pct:0.5 },
  dalycity: { vli:[100,1336], li:[50,769], mod:[38,762], above:[75,1971], units:263, target:4838, pct:5.4 },
  eastpaloalto: { vli:[25,165], li:[19,95], mod:[19,159], above:[17,410], units:80, target:829, pct:9.7 },
  fostercity: { vli:[10,520], li:[21,299], mod:[5,300], above:[2,777], units:38, target:1896, pct:2.0 },
  halfmoonbay: { vli:[58,181], li:[22,104], mod:[12,54], above:[28,141], units:120, target:480, pct:25.0 },
  hillsborough: { vli:[45,155], li:[30,89], mod:[32,87], above:[46,223], units:153, target:554, pct:27.6 },
  menlopark: { vli:[121,740], li:[72,426], mod:[63,496], above:[92,1284], units:348, target:2946, pct:11.8 },
  millbrae: { vli:[18,575], li:[100,331], mod:[27,361], above:[258,932], units:403, target:2199, pct:18.3 },
  pacifica: { vli:[19,538], li:[17,310], mod:[13,291], above:[15,753], units:64, target:1892, pct:3.4 },
  portolavalley: { vli:[10,73], li:[19,42], mod:[8,39], above:[9,99], units:46, target:253, pct:18.2 },
  redwoodcity: { vli:[198,1115], li:[232,643], mod:[76,789], above:[645,2041], units:1151, target:4588, pct:25.1 },
  sanbruno: { vli:[56,704], li:[471,405], mod:[36,573], above:[23,1483], units:586, target:3165, pct:18.5 },
  sancarlos: { vli:[17,739], li:[17,425], mod:[28,438], above:[90,1133], units:152, target:2735, pct:5.6 },
  sanmateo: { vli:[85,1777], li:[80,1023], mod:[73,1175], above:[321,3040], units:559, target:7015, pct:8.0 },
  southsanfrancisco: { vli:[101,871], li:[151,502], mod:[79,720], above:[1156,1863], units:1487, target:3956, pct:37.6 },
  woodside: { vli:[21,90], li:[19,52], mod:[19,52], above:[37,134], units:96, target:328, pct:29.3 },
};

export const RHNA_SOURCE = {
  label: 'California HCD, 6th Cycle RHNA Progress Report',
  url: 'https://data.ca.gov/dataset/rhna-progress-report',
  asOf: 'August 2026',
};
