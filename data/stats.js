// Market statistics, pulled from Zillow's public research data (files.zillowstatic.com).
//
//   homeValue  ZHVI, smoothed & seasonally adjusted, all homes 33rd-67th percentile
//   rent       ZORI, smoothed, all homes plus multifamily
//
// Both are indexes for the whole city, not for the projects tracked in this dashboard - they are
// here to give a reader context for what's being built, not to describe any individual project.
// Series carry one reading per July so a six-year trend fits in a compact chart.
//
// West San Jose is a district of San Jose rather than its own city, so it carries San Jose's
// citywide figures; the UI labels it as such.
//
// Last pulled: August 2026 (latest reading 2026-07-31).
export const CITY_STATS = {
  sunnyvale: {
    population: 153455, medianIncome: 181862, medianGrossRent: 3065,
    meanCommuteMin: 23.2, transitSharePct: 4.3, renterSharePct: 56.2,
    medianYearBuilt: 1975, censusHomeValue: 1816600,
    zillowName: 'Sunnyvale',
    homeValue: 2050814, rent: 3899,
    homeValueSeries: [{year:'2021', value:1742337}, {year:'2022', value:2018276}, {year:'2023', value:1812393}, {year:'2024', value:2026853}, {year:'2025', value:2031676}, {year:'2026', value:2050814}],
    rentSeries: [{year:'2021', value:3041}, {year:'2022', value:3362}, {year:'2023', value:3335}, {year:'2024', value:3487}, {year:'2025', value:3622}, {year:'2026', value:3899}],
  },
  cupertino: {
    population: 58886, medianIncome: 231139, medianGrossRent: 3501,
    meanCommuteMin: 24.8, transitSharePct: 1.1, renterSharePct: 38.7,
    medianYearBuilt: 1973, censusHomeValue: 2000001,
    zillowName: 'Cupertino',
    homeValue: 3008438, rent: 4359,
    homeValueSeries: [{year:'2021', value:2352183}, {year:'2022', value:2817068}, {year:'2023', value:2504838}, {year:'2024', value:2858846}, {year:'2025', value:2915692}, {year:'2026', value:3008438}],
    rentSeries: [{year:'2021', value:3321}, {year:'2022', value:3710}, {year:'2023', value:3754}, {year:'2024', value:3880}, {year:'2025', value:4009}, {year:'2026', value:4359}],
  },
  mountainview: {
    population: 82363, medianIncome: 179917, medianGrossRent: 2975,
    meanCommuteMin: 23.6, transitSharePct: 4.1, renterSharePct: 61.2,
    medianYearBuilt: 1974, censusHomeValue: 1927400,
    zillowName: 'Mountain View',
    homeValue: 1962774, rent: 4416,
    homeValueSeries: [{year:'2021', value:1762957}, {year:'2022', value:2018566}, {year:'2023', value:1805245}, {year:'2024', value:1980622}, {year:'2025', value:1928206}, {year:'2026', value:1962774}],
    rentSeries: [{year:'2021', value:3495}, {year:'2022', value:3833}, {year:'2023', value:3821}, {year:'2024', value:3939}, {year:'2025', value:4032}, {year:'2026', value:4416}],
  },
  milpitas: {
    population: 78216, medianIncome: 176822, medianGrossRent: 3112,
    meanCommuteMin: 26.4, transitSharePct: 2.4, renterSharePct: 40.7,
    medianYearBuilt: 1987, censusHomeValue: 1180000,
    zillowName: 'Milpitas',
    homeValue: 1424179, rent: 3715,
    homeValueSeries: [{year:'2021', value:1194650}, {year:'2022', value:1406602}, {year:'2023', value:1283565}, {year:'2024', value:1463925}, {year:'2025', value:1444791}, {year:'2026', value:1424179}],
    rentSeries: [{year:'2021', value:2932}, {year:'2022', value:3262}, {year:'2023', value:3295}, {year:'2024', value:3331}, {year:'2025', value:3429}, {year:'2026', value:3715}],
  },
  losaltos: {
    population: 30736, medianIncome: 250001, medianGrossRent: 3501,
    meanCommuteMin: 22.9, transitSharePct: 1.4, renterSharePct: 19.2,
    medianYearBuilt: 1964, censusHomeValue: 2000001,
    zillowName: 'Los Altos',
    homeValue: 4601729, rent: 7837,
    homeValueSeries: [{year:'2021', value:3566636}, {year:'2022', value:4355235}, {year:'2023', value:3851085}, {year:'2024', value:4174999}, {year:'2025', value:4300426}, {year:'2026', value:4601729}],
    rentSeries: [{year:'2021', value:5528}, {year:'2022', value:5945}, {year:'2023', value:6097}, {year:'2024', value:6463}, {year:'2025', value:6631}, {year:'2026', value:7837}],
  },
  saratoga: {
    population: 30335, medianIncome: 241348, medianGrossRent: 3501,
    meanCommuteMin: 27.2, transitSharePct: 1.1, renterSharePct: 13.4,
    medianYearBuilt: 1967, censusHomeValue: 2000001,
    zillowName: 'Saratoga',
    homeValue: 4038070, rent: 6244,
    homeValueSeries: [{year:'2021', value:3090468}, {year:'2022', value:3769210}, {year:'2023', value:3404422}, {year:'2024', value:3773924}, {year:'2025', value:3890071}, {year:'2026', value:4038070}],
    rentSeries: [{year:'2021', value:4833}, {year:'2022', value:5061}, {year:'2023', value:5330}, {year:'2024', value:5911}, {year:'2025', value:5945}, {year:'2026', value:6244}],
  },
  westsanjose: {
    population: 990054, medianIncome: 141565, medianGrossRent: 2617,
    meanCommuteMin: 28.1, transitSharePct: 2.8, renterSharePct: 44.1,
    medianYearBuilt: 1975, censusHomeValue: 1187800,
    zillowName: 'San Jose',
    homeValue: 1391204, rent: 3527,
    homeValueSeries: [{year:'2021', value:1167162}, {year:'2022', value:1379685}, {year:'2023', value:1261707}, {year:'2024', value:1423045}, {year:'2025', value:1407324}, {year:'2026', value:1391204}],
    rentSeries: [{year:'2021', value:2819}, {year:'2022', value:3110}, {year:'2023', value:3134}, {year:'2024', value:3227}, {year:'2025', value:3330}, {year:'2026', value:3527}],
  },
  santaclara: {
    population: 129239, medianIncome: 173670, medianGrossRent: 2985,
    meanCommuteMin: 23.1, transitSharePct: 2.5, renterSharePct: 58.8,
    medianYearBuilt: 1973, censusHomeValue: 1527900,
    zillowName: 'Santa Clara',
    homeValue: 1680833, rent: 3935,
    homeValueSeries: [{year:'2021', value:1378395}, {year:'2022', value:1593938}, {year:'2023', value:1446945}, {year:'2024', value:1653683}, {year:'2025', value:1682983}, {year:'2026', value:1680833}],
    rentSeries: [{year:'2021', value:3043}, {year:'2022', value:3381}, {year:'2023', value:3436}, {year:'2024', value:3562}, {year:'2025', value:3665}, {year:'2026', value:3935}],
  },
  losgatos: {
    population: 32773, medianIncome: 207891, medianGrossRent: 2969,
    meanCommuteMin: 27.8, transitSharePct: 0.5, renterSharePct: 37.5,
    medianYearBuilt: 1971, censusHomeValue: 2000001,
    zillowName: 'Los Gatos',
    homeValue: 2628349, rent: 4256,
    homeValueSeries: [{year:'2021', value:2085374}, {year:'2022', value:2529169}, {year:'2023', value:2280686}, {year:'2024', value:2516411}, {year:'2025', value:2524032}, {year:'2026', value:2628349}],
    rentSeries: [{year:'2021', value:3258}, {year:'2022', value:3522}, {year:'2023', value:3682}, {year:'2024', value:3828}, {year:'2025', value:3997}, {year:'2026', value:4256}],
  },
  campbell: {
    population: 42848, medianIncome: 147128, medianGrossRent: 2751,
    meanCommuteMin: 23.7, transitSharePct: 1.2, renterSharePct: 49.5,
    medianYearBuilt: 1972, censusHomeValue: 1550000,
    zillowName: 'Campbell',
    homeValue: 1881250, rent: 3395,
    homeValueSeries: [{year:'2021', value:1456441}, {year:'2022', value:1706671}, {year:'2023', value:1563038}, {year:'2024', value:1786308}, {year:'2025', value:1831601}, {year:'2026', value:1881250}],
    rentSeries: [{year:'2021', value:2796}, {year:'2022', value:3039}, {year:'2023', value:3062}, {year:'2024', value:3132}, {year:'2025', value:3188}, {year:'2026', value:3395}],
  },
  paloalto: {
    population: 67231, medianIncome: 220408, medianGrossRent: 3328,
    meanCommuteMin: 22.9, transitSharePct: 3.1, renterSharePct: 45.8,
    medianYearBuilt: 1963, censusHomeValue: 2000001,
    zillowName: 'Palo Alto',
    homeValue: 3599324, rent: 4501,
    homeValueSeries: [{year:'2021', value:3091423}, {year:'2022', value:3563738}, {year:'2023', value:3179067}, {year:'2024', value:3403557}, {year:'2025', value:3442876}, {year:'2026', value:3599324}],
    rentSeries: [{year:'2021', value:3576}, {year:'2022', value:3828}, {year:'2023', value:3888}, {year:'2024', value:3998}, {year:'2025', value:4195}, {year:'2026', value:4501}],
  },
  gilroy: {
    zillowName: 'Gilroy',
    homeValue: null, rent: null,
    homeValueSeries: [], rentSeries: [],
    population: 58561, medianIncome: 131554, medianGrossRent: 2270,
    meanCommuteMin: 33.9, transitSharePct: 1.6, renterSharePct: 37.2,
    medianYearBuilt: 1990, censusHomeValue: 975800,
  },
  losaltoshills: {
    zillowName: 'Los Altos Hills',
    homeValue: null, rent: null,
    homeValueSeries: [], rentSeries: [],
    population: 8367, medianIncome: 250001, medianGrossRent: 3501,
    meanCommuteMin: 27.7, transitSharePct: 1.2, renterSharePct: 5.0,
    medianYearBuilt: 1976, censusHomeValue: 2000001,
  },
  montesereno: {
    zillowName: 'Monte Sereno',
    homeValue: null, rent: null,
    homeValueSeries: [], rentSeries: [],
    population: 3459, medianIncome: 250001, medianGrossRent: 2947,
    meanCommuteMin: 24.3, transitSharePct: 0.6, renterSharePct: 4.3,
    medianYearBuilt: 1964, censusHomeValue: 2000001,
  },
  morganhill: {
    zillowName: 'Morgan Hill',
    homeValue: null, rent: null,
    homeValueSeries: [], rentSeries: [],
    population: 45152, medianIncome: 159758, medianGrossRent: 2275,
    meanCommuteMin: 34.8, transitSharePct: 1.7, renterSharePct: 27.7,
    medianYearBuilt: 1989, censusHomeValue: 1127600,
  },
  // ---- San Mateo County, ACS 2023 5-year estimates plus Zillow research data ----
  // income top-coded by the Census at $250,000; gross rent top-coded at $3,500; home value top-coded at $2,000,000
  atherton: {
    population:7021, medianIncome:250001, medianGrossRent:3501, meanCommuteMin:23.7, transitSharePct:1.7, renterSharePct:12.6, medianYearBuilt:1960, censusHomeValue:2000001, zillowName:'Atherton', homeValue:8557851, rent:16000,
    homeValueSeries:[{year:'2021', value:7445611}, {year:'2022', value:7592748}, {year:'2023', value:7348910}, {year:'2024', value:7512391}, {year:'2025', value:7980999}, {year:'2026', value:8557851}] },
  // home value top-coded at $2,000,000
  belmont: {
    population:27505, medianIncome:207609, medianGrossRent:2894, meanCommuteMin:29.5, transitSharePct:4.4, renterSharePct:44.0, medianYearBuilt:1966, censusHomeValue:2000001, zillowName:'Belmont', homeValue:2284322, rent:3550,
    homeValueSeries:[{year:'2021', value:2016510}, {year:'2022', value:2075163}, {year:'2023', value:2059647}, {year:'2024', value:2200058}, {year:'2025', value:2241946}, {year:'2026', value:2284322}],
    rentSeries:[{year:'2021', value:2802}, {year:'2022', value:2892}, {year:'2023', value:3004}, {year:'2024', value:3090}, {year:'2025', value:3338}, {year:'2026', value:3550}] },
  brisbane: {
    population:4718, medianIncome:151593, medianGrossRent:2634, meanCommuteMin:29.5, transitSharePct:6.6, renterSharePct:39.5, medianYearBuilt:1967, censusHomeValue:1127200, zillowName:'Brisbane', homeValue:1161800, rent:3012,
    homeValueSeries:[{year:'2021', value:1201288}, {year:'2022', value:1180479}, {year:'2023', value:1145175}, {year:'2024', value:1170173}, {year:'2025', value:1149431}, {year:'2026', value:1161800}] },
  // home value top-coded at $2,000,000
  burlingame: {
    population:30526, medianIncome:168832, medianGrossRent:2643, meanCommuteMin:31.3, transitSharePct:9.2, renterSharePct:49.5, medianYearBuilt:1957, censusHomeValue:2000001, zillowName:'Burlingame', homeValue:2817833, rent:3921,
    homeValueSeries:[{year:'2021', value:2469721}, {year:'2022', value:2500894}, {year:'2023', value:2454911}, {year:'2024', value:2570852}, {year:'2025', value:2672261}, {year:'2026', value:2817833}],
    rentSeries:[{year:'2021', value:3035}, {year:'2022', value:3243}, {year:'2023', value:3254}, {year:'2024', value:3401}, {year:'2025', value:3645}, {year:'2026', value:3921}] },
  colma: {
    population:1441, medianIncome:121488, medianGrossRent:2152, meanCommuteMin:29.3, transitSharePct:9.6, renterSharePct:53.0, medianYearBuilt:1988, censusHomeValue:1040900, zillowName:'Colma', homeValue:1087359,
    homeValueSeries:[{year:'2021', value:1158713}, {year:'2022', value:1127262}, {year:'2023', value:1108334}, {year:'2024', value:1113613}, {year:'2025', value:1089149}, {year:'2026', value:1087359}] },
  dalycity: {
    population:102560, medianIncome:119570, medianGrossRent:2523, meanCommuteMin:29.2, transitSharePct:14.1, renterSharePct:39.5, medianYearBuilt:1965, censusHomeValue:1092700, zillowName:'Daly City', homeValue:1137024, rent:2765,
    homeValueSeries:[{year:'2021', value:1143451}, {year:'2022', value:1135336}, {year:'2023', value:1125592}, {year:'2024', value:1150760}, {year:'2025', value:1116624}, {year:'2026', value:1137024}],
    rentSeries:[{year:'2021', value:2318}, {year:'2022', value:2427}, {year:'2023', value:2469}, {year:'2024', value:2469}, {year:'2025', value:2577}, {year:'2026', value:2765}] },
  eastpaloalto: {
    population:29143, medianIncome:104832, medianGrossRent:2209, meanCommuteMin:25.2, transitSharePct:2.0, renterSharePct:52.1, medianYearBuilt:1963, censusHomeValue:1124000, zillowName:'East Palo Alto', homeValue:1016727, rent:3603,
    homeValueSeries:[{year:'2021', value:1118553}, {year:'2022', value:1073894}, {year:'2023', value:1023071}, {year:'2024', value:1061113}, {year:'2025', value:1027249}, {year:'2026', value:1016727}] },
  // gross rent top-coded at $3,500
  fostercity: {
    population:32964, medianIncome:193633, medianGrossRent:3501, meanCommuteMin:30.7, transitSharePct:3.9, renterSharePct:48.8, medianYearBuilt:1976, censusHomeValue:1774500, zillowName:'Foster City', homeValue:1863228, rent:4317,
    homeValueSeries:[{year:'2021', value:1738282}, {year:'2022', value:1781768}, {year:'2023', value:1801034}, {year:'2024', value:1871290}, {year:'2025', value:1852022}, {year:'2026', value:1863228}],
    rentSeries:[{year:'2021', value:3322}, {year:'2022', value:3438}, {year:'2023', value:3482}, {year:'2024', value:3637}, {year:'2025', value:3853}, {year:'2026', value:4317}] },
  halfmoonbay: {
    population:11454, medianIncome:153199, medianGrossRent:2299, meanCommuteMin:31.3, transitSharePct:0.0, renterSharePct:27.2, medianYearBuilt:1982, censusHomeValue:1467000, zillowName:'Half Moon Bay', homeValue:1547730, rent:4661,
    homeValueSeries:[{year:'2021', value:1413793}, {year:'2022', value:1457483}, {year:'2023', value:1467696}, {year:'2024', value:1513419}, {year:'2025', value:1538453}, {year:'2026', value:1547730}] },
  // income top-coded by the Census at $250,000; gross rent top-coded at $3,500; home value top-coded at $2,000,000
  hillsborough: {
    population:11122, medianIncome:250001, medianGrossRent:3501, meanCommuteMin:27.6, transitSharePct:1.9, renterSharePct:7.0, medianYearBuilt:1967, censusHomeValue:2000001, zillowName:'Hillsborough', homeValue:5524660,
    homeValueSeries:[{year:'2021', value:5068092}, {year:'2022', value:5126108}, {year:'2023', value:4973244}, {year:'2024', value:5005189}, {year:'2025', value:5221922}, {year:'2026', value:5524660}] },
  // home value top-coded at $2,000,000
  menlopark: {
    population:32775, medianIncome:206588, medianGrossRent:3156, meanCommuteMin:24.2, transitSharePct:3.0, renterSharePct:44.7, medianYearBuilt:1962, censusHomeValue:2000001, zillowName:'Menlo Park', homeValue:2890071, rent:4349,
    homeValueSeries:[{year:'2021', value:2540882}, {year:'2022', value:2574600}, {year:'2023', value:2558262}, {year:'2024', value:2669738}, {year:'2025', value:2787358}, {year:'2026', value:2890071}],
    rentSeries:[{year:'2021', value:3348}, {year:'2022', value:3462}, {year:'2023', value:3594}, {year:'2024', value:3749}, {year:'2025', value:3974}, {year:'2026', value:4349}] },
  millbrae: {
    population:22589, medianIncome:157567, medianGrossRent:3401, meanCommuteMin:28.8, transitSharePct:9.1, renterSharePct:36.8, medianYearBuilt:1960, censusHomeValue:1929700, zillowName:'Millbrae', homeValue:2055633, rent:3767,
    homeValueSeries:[{year:'2021', value:1794801}, {year:'2022', value:1808388}, {year:'2023', value:1825554}, {year:'2024', value:1930958}, {year:'2025', value:1991877}, {year:'2026', value:2055633}],
    rentSeries:[{year:'2021', value:3001}, {year:'2022', value:3050}, {year:'2023', value:3300}, {year:'2024', value:3246}, {year:'2025', value:3511}, {year:'2026', value:3767}] },
  pacifica: {
    population:37527, medianIncome:156819, medianGrossRent:3080, meanCommuteMin:28.3, transitSharePct:5.1, renterSharePct:31.5, medianYearBuilt:1966, censusHomeValue:1211700, zillowName:'Pacifica', homeValue:1276738, rent:3582,
    homeValueSeries:[{year:'2021', value:1278365}, {year:'2022', value:1279701}, {year:'2023', value:1266320}, {year:'2024', value:1300122}, {year:'2025', value:1263908}, {year:'2026', value:1276738}],
    rentSeries:[{year:'2021', value:2982}, {year:'2022', value:3083}, {year:'2023', value:3107}, {year:'2024', value:3205}, {year:'2025', value:3436}, {year:'2026', value:3582}] },
  // income top-coded by the Census at $250,000; gross rent top-coded at $3,500; home value top-coded at $2,000,000
  portolavalley: {
    population:4329, medianIncome:250001, medianGrossRent:3501, meanCommuteMin:27.5, transitSharePct:0.0, renterSharePct:16.3, medianYearBuilt:1970, censusHomeValue:2000001, zillowName:'Portola Valley', homeValue:4313310,
    homeValueSeries:[{year:'2021', value:3685266}, {year:'2022', value:3711407}, {year:'2023', value:3671074}, {year:'2024', value:3805623}, {year:'2025', value:4134748}, {year:'2026', value:4313310}] },
  redwoodcity: {
    population:82423, medianIncome:150840, medianGrossRent:2959, meanCommuteMin:24.6, transitSharePct:4.0, renterSharePct:52.3, medianYearBuilt:1968, censusHomeValue:1838800, zillowName:'Redwood City', homeValue:1893533, rent:4077,
    homeValueSeries:[{year:'2021', value:1741201}, {year:'2022', value:1777317}, {year:'2023', value:1756823}, {year:'2024', value:1832407}, {year:'2025', value:1849532}, {year:'2026', value:1893533}],
    rentSeries:[{year:'2021', value:3238}, {year:'2022', value:3339}, {year:'2023', value:3400}, {year:'2024', value:3545}, {year:'2025', value:3722}, {year:'2026', value:4077}] },
  sanbruno: {
    population:42612, medianIncome:135976, medianGrossRent:2696, meanCommuteMin:25.1, transitSharePct:6.6, renterSharePct:38.2, medianYearBuilt:1961, censusHomeValue:1199400, zillowName:'San Bruno', homeValue:1308809, rent:3338,
    homeValueSeries:[{year:'2021', value:1191093}, {year:'2022', value:1216497}, {year:'2023', value:1232092}, {year:'2024', value:1290017}, {year:'2025', value:1284581}, {year:'2026', value:1308809}],
    rentSeries:[{year:'2021', value:2734}, {year:'2022', value:2854}, {year:'2023', value:2947}, {year:'2024', value:3021}, {year:'2025', value:3167}, {year:'2026', value:3338}] },
  // home value top-coded at $2,000,000
  sancarlos: {
    population:29797, medianIncome:233333, medianGrossRent:2802, meanCommuteMin:25.4, transitSharePct:3.7, renterSharePct:31.8, medianYearBuilt:1961, censusHomeValue:2000001, zillowName:'San Carlos', homeValue:2457746, rent:4554,
    homeValueSeries:[{year:'2021', value:2163728}, {year:'2022', value:2213934}, {year:'2023', value:2169306}, {year:'2024', value:2312603}, {year:'2025', value:2381677}, {year:'2026', value:2457746}],
    rentSeries:[{year:'2021', value:3468}, {year:'2022', value:3732}, {year:'2023', value:3878}, {year:'2024', value:3896}, {year:'2025', value:4119}, {year:'2026', value:4554}] },
  sanmateo: {
    population:103555, medianIncome:152669, medianGrossRent:3079, meanCommuteMin:27.1, transitSharePct:6.1, renterSharePct:49.2, medianYearBuilt:1964, censusHomeValue:1563200, zillowName:'San Mateo', homeValue:1685162, rent:3821,
    homeValueSeries:[{year:'2021', value:1585637}, {year:'2022', value:1590594}, {year:'2023', value:1563968}, {year:'2024', value:1649487}, {year:'2025', value:1646755}, {year:'2026', value:1685162}],
    rentSeries:[{year:'2021', value:3039}, {year:'2022', value:3139}, {year:'2023', value:3185}, {year:'2024', value:3316}, {year:'2025', value:3529}, {year:'2026', value:3821}] },
  southsanfrancisco: {
    population:64487, medianIncome:135909, medianGrossRent:2833, meanCommuteMin:27.2, transitSharePct:8.5, renterSharePct:39.2, medianYearBuilt:1963, censusHomeValue:1160100, zillowName:'South San Francisco', homeValue:1235804, rent:4088,
    homeValueSeries:[{year:'2021', value:1183337}, {year:'2022', value:1190343}, {year:'2023', value:1180158}, {year:'2024', value:1222412}, {year:'2025', value:1218233}, {year:'2026', value:1235804}],
    rentSeries:[{year:'2021', value:3248}, {year:'2022', value:3386}, {year:'2023', value:3353}, {year:'2024', value:3466}, {year:'2025', value:3633}, {year:'2026', value:4088}] },
  // income top-coded by the Census at $250,000; gross rent top-coded at $3,500; home value top-coded at $2,000,000
  woodside: {
    population:5181, medianIncome:250001, medianGrossRent:3501, meanCommuteMin:26.4, transitSharePct:1.6, renterSharePct:14.4, medianYearBuilt:1966, censusHomeValue:2000001, zillowName:'Woodside', homeValue:3978315,
    homeValueSeries:[{year:'2021', value:3711119}, {year:'2022', value:3721009}, {year:'2023', value:3650328}, {year:'2024', value:3730486}, {year:'2025', value:3790313}, {year:'2026', value:3978315}] },
};

export const STATS_SOURCE = {
  label: 'Zillow Research public data (ZHVI and ZORI), city level',
  url: 'https://www.zillow.com/research/data/',
  asOf: 'July 2026',
};

// Population, income, commute, transit share, tenure and housing age come from the US Census
// American Community Survey 5-year estimates. Pulled once and embedded rather than fetched at
// runtime: ACS updates annually, so a live call would add a dependency and an API key for data
// that changes once a year.
export const CENSUS_SOURCE = {
  label: 'US Census American Community Survey, 5-year estimates',
  url: 'https://www.census.gov/programs-surveys/acs',
  asOf: '2023 (ACS 5-year)',
};
