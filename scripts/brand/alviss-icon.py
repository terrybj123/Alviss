#!/usr/bin/env python3
"""Generates the Alviss app icon (1024x1024 RGBA PNG).

Placeholder brand mark: a rounded field with a teal "A" — enough to ship a
build that carries no upstream brand assets. Replace with the real identity
before the first paid release.

No third-party libraries: raw PNG chunks over zlib.
"""

import math
import struct
import zlib

SIZE = 1024
SS = 2  # supersampling per axis

# Field (the rounded square), and the mark inside it.
PAD = 64
RADIUS = 200
TOP = (0x16, 0x20, 0x2E)
BOTTOM = (0x0B, 0x12, 0x20)
MARK_A = (0x2D, 0xD4, 0xBF)
MARK_B = (0x34, 0xD3, 0x99)

# The "A": two legs and a crossbar, in field coordinates.
LEGS = [
    ((512, 296), (344, 746)),
    ((512, 296), (680, 746)),
]
BAR = ((398, 606), (626, 606))
STROKE = 92


def sd_round_rect(px, py, cx, cy, hw, hh, r):
    dx = abs(px - cx) - (hw - r)
    dy = abs(py - cy) - (hh - r)
    ax, ay = max(dx, 0.0), max(dy, 0.0)
    return math.hypot(ax, ay) + min(max(dx, dy), 0.0) - r


def sd_segment(px, py, a, b):
    ax, ay = a
    bx, by = b
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    t = max(0.0, min(1.0, (wx * vx + wy * vy) / (vx * vx + vy * vy)))
    return math.hypot(wx - t * vx, wy - t * vy)


def mix(c1, c2, t):
    return tuple(c1[i] + (c2[i] - c1[i]) * t for i in range(3))


def render():
    rows = []
    half = SIZE / 2
    hw = (SIZE - 2 * PAD) / 2
    step = 1.0 / SS
    for y in range(SIZE):
        row = bytearray()
        for x in range(SIZE):
            field = 0
            mark = 0
            for sy in range(SS):
                for sx in range(SS):
                    px = x + (sx + 0.5) * step
                    py = y + (sy + 0.5) * step
                    if sd_round_rect(px, py, half, half, hw, hw, RADIUS) <= 0:
                        field += 1
                        d = min(
                            [sd_segment(px, py, a, b) - STROKE / 2 for a, b in LEGS]
                            + [sd_segment(px, py, BAR[0], BAR[1]) - STROKE / 2]
                        )
                        if d <= 0:
                            mark += 1
            n = SS * SS
            if field == 0:
                row += bytes((0, 0, 0, 0))
                continue
            t = y / SIZE
            bg = mix(TOP, BOTTOM, t)
            m = mix(MARK_A, MARK_B, x / SIZE)
            fm = mark / n
            r, g, b = mix(bg, m, fm)
            row += bytes((int(r + 0.5), int(g + 0.5), int(b + 0.5), int(255 * field / n + 0.5)))
        rows.append(bytes(row))
    return rows


def chunk(tag, data):
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def main():
    raw = b"".join(b"\x00" + r for r in render())
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    with open("apps/desktop/src-tauri/icons/source.png", "wb") as f:
        f.write(png)
    print("wrote apps/desktop/src-tauri/icons/source.png")


if __name__ == "__main__":
    main()
