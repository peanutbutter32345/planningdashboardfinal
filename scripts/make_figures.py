"""Render the Local Figures charts with matplotlib.

matplotlib is Python, so it cannot run in the browser or on the Node server. The data behind
these charts is static - Zillow and Census figures are embedded in data/stats.js, RHNA in
data/rhna.js, and the pipeline counts come from the project records - so the charts are rendered
once here and served as SVG. Re-run this whenever that data changes:

    node -e "...dump..." > /tmp/figdata.json && python3 scripts/make_figures.py

Output: public/img/figures/<city>-<metric>.svg
"""
import json, os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

INK, SOFT, GRID, AXIS = '#2F663A', '#B4D8B7', '#E4EEE5', '#6E7B70'
OUT = 'public/img/figures'
os.makedirs(OUT, exist_ok=True)

plt.rcParams.update({
    'font.family': 'DejaVu Sans',
    'font.size': 7.2,
    'axes.edgecolor': AXIS,
    'axes.linewidth': 0.7,
    'axes.labelcolor': AXIS,
    'xtick.color': AXIS, 'ytick.color': AXIS,
    'xtick.labelsize': 6.6, 'ytick.labelsize': 6.6,
    'xtick.major.size': 2.5, 'ytick.major.size': 2.5,
    'xtick.major.width': 0.7, 'ytick.major.width': 0.7,
    'svg.fonttype': 'none',          # keep text as text so it stays crisp and small
    'figure.dpi': 100,
})

FIGSIZE = (3.55, 1.55)

def frame(ax):
    """Two spines only, hairline grid behind the data: the convention for a figure in a paper."""
    for side in ('top', 'right'):
        ax.spines[side].set_visible(False)
    ax.grid(axis='y', color=GRID, linewidth=0.7)
    ax.set_axisbelow(True)
    ax.tick_params(length=2.5, pad=2)

def save(fig, name):
    fig.savefig(f'{OUT}/{name}.svg', format='svg', bbox_inches='tight', pad_inches=0.04,
                transparent=True)
    plt.close(fig)

def trend(series, name, fmt):
    if not series or len(series) < 2:
        return False
    fig, ax = plt.subplots(figsize=FIGSIZE)
    xs = [p['year'] for p in series]
    ys = [p['value'] for p in series]
    ax.plot(xs, ys, color=INK, linewidth=1.3, marker='s', markersize=2.6,
            markerfacecolor=INK, markeredgecolor=INK)
    ax.fill_between(range(len(xs)), ys, min(ys) - (max(ys)-min(ys))*0.12,
                    color=INK, alpha=0.07)
    ax.set_xlim(-0.15, len(xs)-0.85)
    ax.yaxis.set_major_formatter(FuncFormatter(lambda v, _: fmt(v)))
    ax.locator_params(axis='y', nbins=4)
    frame(ax)
    save(fig, name)
    return True

def ranking(values, me, name, fmt, top=8):
    rows = sorted([(k, v) for k, v in values.items() if v], key=lambda r: -r[1])[:top]
    if len(rows) < 3:
        return False
    rows.reverse()
    fig, ax = plt.subplots(figsize=(3.55, 1.75))
    labels = [r[0] for r in rows]
    vals = [r[1] for r in rows]
    colors = [INK if lbl == me else SOFT for lbl in labels]
    ax.barh(range(len(rows)), vals, color=colors, height=0.72)
    ax.set_yticks(range(len(rows)))
    ax.set_yticklabels(labels, fontsize=6.2)
    ax.xaxis.set_major_formatter(FuncFormatter(lambda v, _: fmt(v)))
    ax.locator_params(axis='x', nbins=4)
    for side in ('top', 'right'):
        ax.spines[side].set_visible(False)
    ax.grid(axis='x', color=GRID, linewidth=0.7)
    ax.set_axisbelow(True)
    ax.tick_params(length=2.5, pad=2)
    save(fig, name)
    return True

def rhna_bars(r, name):
    if not r:
        return False
    bands = ['Very low', 'Low', 'Moderate', 'Above mod']
    got = [r['vli'][0], r['li'][0], r['mod'][0], r['above'][0]]
    target = [r['vli'][1], r['li'][1], r['mod'][1], r['above'][1]]
    rest = [max(0, t - g) for t, g in zip(target, got)]
    fig, ax = plt.subplots(figsize=FIGSIZE)
    x = range(len(bands))
    ax.bar(x, got, color=INK, width=0.62, label='Permitted')
    ax.bar(x, rest, bottom=got, color=SOFT, width=0.62, label='Remaining')
    ax.set_xticks(list(x))
    ax.set_xticklabels(bands, fontsize=6.2)
    ax.locator_params(axis='y', nbins=4)
    frame(ax)
    save(fig, name)
    return True

data = json.load(open('/tmp/figdata.json'))['cities']
money = lambda v: f'${v/1e6:.1f}M'
rent = lambda v: f'${v/1000:.1f}k'
plain = lambda v: f'{v:,.0f}'

made = 0
for key, c in data.items():
    label = c['label']
    if trend(c.get('homeValueSeries'), f'{key}-homeValue', money): made += 1
    if trend(c.get('rentSeries'), f'{key}-rent', rent): made += 1
    if rhna_bars(c.get('rhna'), f'{key}-rhnaPct'): made += 1
    if ranking({v['label']: v.get('commute') for v in data.values()}, label,
               f'{key}-commute', lambda v: f'{v:.0f}m'): made += 1
    if ranking({v['label']: v.get('pipelineUnits') for v in data.values()}, label,
               f'{key}-units', lambda v: f'{v/1000:.0f}k' if v >= 1000 else f'{v:.0f}'): made += 1
    if ranking({v['label']: v.get('commissions') for v in data.values()}, label,
               f'{key}-commissions', plain): made += 1

print(f'rendered {made} svg figures into {OUT}')
