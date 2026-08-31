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
