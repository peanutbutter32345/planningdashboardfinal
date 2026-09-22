"""Rasterise the site mark (public/img/logo.svg) to the PNG sizes browsers ask for.

The SVG is the source of truth for the logo; this script redraws the same shapes with a small
supersampled rasteriser because the machine has no SVG converter installed and the icon is simple
enough that pulling in a rendering library would cost more than it saves. Re-run after editing the
logo:

    python3 scripts/make_icon.py

Output: public/img/icon-180.png (Apple touch icon), public/img/icon-32.png.
"""
import struct, zlib

INK = (46, 59, 28)          # #2E3B1C  the tile
ROAD = (74, 92, 48)         # #4A5C30  the main streets
ROAD_THIN = (62, 79, 36)    # #3E4F24  the side streets
FOLD = (36, 48, 22)         # the dog-eared corner, blended over the tile
CREAM = (245, 243, 231)     # #F5F3E7  "BAY"
GOLD = (240, 200, 106)      # #F0C86A  the pin

SS = 4                       # supersampling factor, for edges that do not stair-step

# A classic 5x7 bitmap font, just enough of it for B, A and Y - bold and legible at 16px, which a
# hand-drawn outline at that size would not be.
FONT = {
    'B': ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    'A': ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    'Y': ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
}


def inside_round_rect(x, y, w, h, r):
    if x < r and y < r:      return (x - r) ** 2 + (y - r) ** 2 <= r * r
    if x > w - r and y < r:  return (x - (w - r)) ** 2 + (y - r) ** 2 <= r * r
    if x < r and y > h - r:  return (x - r) ** 2 + (y - (h - r)) ** 2 <= r * r
    if x > w - r and y > h - r: return (x - (w - r)) ** 2 + (y - (h - r)) ** 2 <= r * r
    return True


def near_hline(x, y, y0, x0, x1, half_w):
    return x0 <= x <= x1 and abs(y - y0) <= half_w


def near_vline(x, y, x0, y0, y1, half_w):
    return y0 <= y <= y1 and abs(x - x0) <= half_w


def in_fold_corner(x, y):
    # The dog-eared triangle at the top-right: x from 25 to 32, under the line x+y=32.
    return (x >= 25 and (x - 25) >= (7 - y)) if y <= 7 else False


def letter_pixel(x, y, letter, x0, y0, cell_w, cell_h):
    """True if (x, y) falls on a lit cell of `letter`'s 5x7 bitmap, placed at (x0, y0)."""
    rows = FONT[letter]
    col = int((x - x0) / cell_w)
    row = int((y - y0) / cell_h)
    if row < 0 or row >= 7 or col < 0 or col >= 5:
        return False
    return rows[row][col] == '1'


def in_pin(x, y):
    # A teardrop approximated as a circle sitting on a small downward triangle - legible at 16px,
    # where the true bezier teardrop in the SVG would blur into a blob.
    cx, cy = 9.4, 24.6
    if (x - cx) ** 2 + (y - cy) ** 2 <= 2.9 ** 2:
        return True
    # the tip: a triangle from the circle's base down to a point
    if 24.6 <= y <= 30.3:
        half = 2.9 * (1 - (y - 24.6) / 5.7)
        return abs(x - cx) <= max(0, half)
    return False


def sample(x, y):
    """Colour of the logo at a point in the 32x32 design space, or None outside the tile."""
    if not inside_round_rect(x, y, 32, 32, 6):
        return None
    if in_pin(x, y):
        return INK if (x - 9.4) ** 2 + (y - 24.6) ** 2 <= 1.15 ** 2 else GOLD
    cell_w, cell_h = 1.65, 1.6
    if letter_pixel(x, y, 'B', 2.0, 7.5, cell_w, cell_h) or \
       letter_pixel(x, y, 'A', 2.0 + 6 * cell_w, 7.5, cell_w, cell_h) or \
       letter_pixel(x, y, 'Y', 2.0 + 12 * cell_w, 7.5, cell_w, cell_h):
        return CREAM
    base = INK
    if in_fold_corner(x, y):
        base = FOLD
    if near_hline(x, y, 22, 0, 32, 0.6) or near_vline(x, y, 6, 19.2, 32, 0.6) or \
       near_vline(x, y, 26, 19.2, 32, 0.6):
        return ROAD
    return base


def render(size):
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r = g = b = a = 0
            for sy in range(SS):
                for sx in range(SS):
                    x = (px + (sx + 0.5) / SS) / size * 32
                    y = (py + (sy + 0.5) / SS) / size * 32
                    colour = sample(x, y)
                    if colour:
                        r += colour[0]; g += colour[1]; b += colour[2]; a += 255
            n = SS * SS
            hits = a // 255 or 1
            row += bytes((r // hits, g // hits, b // hits, a // n))
        rows.append(bytes(row))
    return rows


def write_png(path, size):
    raw = b''.join(b'\x00' + row for row in render(size))
    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    open(path, 'wb').write(png)
    print(f'{path}: {size}x{size}, {len(png):,} bytes')


write_png('public/img/icon-180.png', 180)
write_png('public/img/icon-32.png', 32)
