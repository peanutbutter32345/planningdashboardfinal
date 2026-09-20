"""Rasterise the site mark (public/img/logo.svg) to the PNG sizes browsers ask for.

The SVG is the source of truth for the logo; this script redraws the same shapes with a small
supersampled rasteriser because the machine has no SVG converter installed and the icon is simple
enough that pulling in a rendering library would cost more than it saves. Re-run after editing the
logo:

    python3 scripts/make_icon.py

Output: public/img/icon-180.png (Apple touch icon), public/img/icon-32.png.
"""
import struct, zlib

INK = (46, 59, 28)        # #2E3B1C  the tile
HILL = (95, 118, 64)      # #5F7640  the bay shore
PALE = (203, 212, 186)    # #CBD4BA  the shorter towers
WHITE = (255, 255, 255)
SUN = (240, 200, 106)     # #F0C86A

SS = 4                    # supersampling factor, for edges that do not stair-step


def inside_round_rect(x, y, w, h, r):
    if x < r and y < r:      return (x - r) ** 2 + (y - r) ** 2 <= r * r
    if x > w - r and y < r:  return (x - (w - r)) ** 2 + (y - r) ** 2 <= r * r
    if x < r and y > h - r:  return (x - r) ** 2 + (y - (h - r)) ** 2 <= r * r
    if x > w - r and y > h - r: return (x - (w - r)) ** 2 + (y - (h - r)) ** 2 <= r * r
    return True


def hill_top(x):
    """The shoreline curve, as two humps across the tile - the same silhouette as the SVG path."""
    import math
    return 24.5 - 1.5 * math.sin(x / 32 * math.pi * 2) - 0.6 * (x / 32)


def sample(x, y):
    """Colour of the logo at a point in the 32x32 design space, or None outside the tile."""
    if not inside_round_rect(x, y, 32, 32, 6):
        return None
    if (x - 24.6) ** 2 + (y - 7.4) ** 2 <= 2.6 ** 2:
        return SUN
    if y >= hill_top(x):
        return HILL
    for x0, y0, w, h, colour in ((5.5, 12, 5, 11, PALE), (13.5, 7.5, 5, 15.5, WHITE), (21.5, 14.5, 5, 8.5, PALE)):
        if x0 <= x <= x0 + w and y0 <= y <= y0 + h:
            return colour
    return INK


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
