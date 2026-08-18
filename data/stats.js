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
    zillowName: 'Sunnyvale',
    homeValue: 2050814, rent: 3899,
    homeValueSeries: [{year:'2021', value:1742337}, {year:'2022', value:2018276}, {year:'2023', value:1812393}, {year:'2024', value:2026853}, {year:'2025', value:2031676}, {year:'2026', value:2050814}],
    rentSeries: [{year:'2021', value:3041}, {year:'2022', value:3362}, {year:'2023', value:3335}, {year:'2024', value:3487}, {year:'2025', value:3622}, {year:'2026', value:3899}],
  },
  cupertino: {
    zillowName: 'Cupertino',
    homeValue: 3008438, rent: 4359,
    homeValueSeries: [{year:'2021', value:2352183}, {year:'2022', value:2817068}, {year:'2023', value:2504838}, {year:'2024', value:2858846}, {year:'2025', value:2915692}, {year:'2026', value:3008438}],
    rentSeries: [{year:'2021', value:3321}, {year:'2022', value:3710}, {year:'2023', value:3754}, {year:'2024', value:3880}, {year:'2025', value:4009}, {year:'2026', value:4359}],
  },
  mountainview: {
    zillowName: 'Mountain View',
    homeValue: 1962774, rent: 4416,
    homeValueSeries: [{year:'2021', value:1762957}, {year:'2022', value:2018566}, {year:'2023', value:1805245}, {year:'2024', value:1980622}, {year:'2025', value:1928206}, {year:'2026', value:1962774}],
    rentSeries: [{year:'2021', value:3495}, {year:'2022', value:3833}, {year:'2023', value:3821}, {year:'2024', value:3939}, {year:'2025', value:4032}, {year:'2026', value:4416}],
  },
  milpitas: {
    zillowName: 'Milpitas',
    homeValue: 1424179, rent: 3715,
    homeValueSeries: [{year:'2021', value:1194650}, {year:'2022', value:1406602}, {year:'2023', value:1283565}, {year:'2024', value:1463925}, {year:'2025', value:1444791}, {year:'2026', value:1424179}],
    rentSeries: [{year:'2021', value:2932}, {year:'2022', value:3262}, {year:'2023', value:3295}, {year:'2024', value:3331}, {year:'2025', value:3429}, {year:'2026', value:3715}],
  },
  losaltos: {
    zillowName: 'Los Altos',
    homeValue: 4601729, rent: 7837,
    homeValueSeries: [{year:'2021', value:3566636}, {year:'2022', value:4355235}, {year:'2023', value:3851085}, {year:'2024', value:4174999}, {year:'2025', value:4300426}, {year:'2026', value:4601729}],
    rentSeries: [{year:'2021', value:5528}, {year:'2022', value:5945}, {year:'2023', value:6097}, {year:'2024', value:6463}, {year:'2025', value:6631}, {year:'2026', value:7837}],
  },
  saratoga: {
    zillowName: 'Saratoga',
    homeValue: 4038070, rent: 6244,
    homeValueSeries: [{year:'2021', value:3090468}, {year:'2022', value:3769210}, {year:'2023', value:3404422}, {year:'2024', value:3773924}, {year:'2025', value:3890071}, {year:'2026', value:4038070}],
    rentSeries: [{year:'2021', value:4833}, {year:'2022', value:5061}, {year:'2023', value:5330}, {year:'2024', value:5911}, {year:'2025', value:5945}, {year:'2026', value:6244}],
  },
  westsanjose: {
    zillowName: 'San Jose',
    homeValue: 1391204, rent: 3527,
    homeValueSeries: [{year:'2021', value:1167162}, {year:'2022', value:1379685}, {year:'2023', value:1261707}, {year:'2024', value:1423045}, {year:'2025', value:1407324}, {year:'2026', value:1391204}],
    rentSeries: [{year:'2021', value:2819}, {year:'2022', value:3110}, {year:'2023', value:3134}, {year:'2024', value:3227}, {year:'2025', value:3330}, {year:'2026', value:3527}],
  },
  santaclara: {
    zillowName: 'Santa Clara',
    homeValue: 1680833, rent: 3935,
    homeValueSeries: [{year:'2021', value:1378395}, {year:'2022', value:1593938}, {year:'2023', value:1446945}, {year:'2024', value:1653683}, {year:'2025', value:1682983}, {year:'2026', value:1680833}],
    rentSeries: [{year:'2021', value:3043}, {year:'2022', value:3381}, {year:'2023', value:3436}, {year:'2024', value:3562}, {year:'2025', value:3665}, {year:'2026', value:3935}],
  },
  losgatos: {
    zillowName: 'Los Gatos',
    homeValue: 2628349, rent: 4256,
    homeValueSeries: [{year:'2021', value:2085374}, {year:'2022', value:2529169}, {year:'2023', value:2280686}, {year:'2024', value:2516411}, {year:'2025', value:2524032}, {year:'2026', value:2628349}],
    rentSeries: [{year:'2021', value:3258}, {year:'2022', value:3522}, {year:'2023', value:3682}, {year:'2024', value:3828}, {year:'2025', value:3997}, {year:'2026', value:4256}],
  },
  campbell: {
    zillowName: 'Campbell',
    homeValue: 1881250, rent: 3395,
    homeValueSeries: [{year:'2021', value:1456441}, {year:'2022', value:1706671}, {year:'2023', value:1563038}, {year:'2024', value:1786308}, {year:'2025', value:1831601}, {year:'2026', value:1881250}],
    rentSeries: [{year:'2021', value:2796}, {year:'2022', value:3039}, {year:'2023', value:3062}, {year:'2024', value:3132}, {year:'2025', value:3188}, {year:'2026', value:3395}],
  },
  paloalto: {
    zillowName: 'Palo Alto',
    homeValue: 3599324, rent: 4501,
    homeValueSeries: [{year:'2021', value:3091423}, {year:'2022', value:3563738}, {year:'2023', value:3179067}, {year:'2024', value:3403557}, {year:'2025', value:3442876}, {year:'2026', value:3599324}],
    rentSeries: [{year:'2021', value:3576}, {year:'2022', value:3828}, {year:'2023', value:3888}, {year:'2024', value:3998}, {year:'2025', value:4195}, {year:'2026', value:4501}],
  },
};

export const STATS_SOURCE = {
  label: 'Zillow Research public data (ZHVI and ZORI), city level',
  url: 'https://www.zillow.com/research/data/',
  asOf: 'July 2026',
};
