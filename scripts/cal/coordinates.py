"""Read published CEQAnet coordinates and screen points against locality polygons."""
import re


def published_point(value):
    # CEQAnet CSV exports use degrees/minutes/seconds with compass directions.
    match = re.fullmatch(r'''\s*(\d+(?:\.\d+)?)°(\d+(?:\.\d+)?)'(\d+(?:\.\d+)?)"N\s+(\d+(?:\.\d+)?)°(\d+(?:\.\d+)?)'(\d+(?:\.\d+)?)"W\s*''', value or '')
    if not match:
        return None
    lat_d, lat_m, lat_s, lng_d, lng_m, lng_s = map(float, match.groups())
    if any(v >= 60 for v in (lat_m, lat_s, lng_m, lng_s)):
        return None
    lat, lng = lat_d + lat_m / 60 + lat_s / 3600, -(lng_d + lng_m / 60 + lng_s / 3600)
    return (lng, lat) if 32 <= lat <= 43 and -125 <= lng <= -113 else None


def _in_ring(point, ring):
    x, y = point
    inside = False
    for a, b in zip(ring, ring[1:] + ring[:1]):
        ax, ay = a[:2]
        bx, by = b[:2]
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            inside = not inside
    return inside


def within_locality(point, geometry):
    if point is None or not geometry:
        return False
    polygons = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']] if geometry['type'] == 'Polygon' else []
    return any(_in_ring(point, polygon[0]) and not any(_in_ring(point, hole) for hole in polygon[1:]) for polygon in polygons)
