# Type D AR Display — Layout Rules

## Layout (forkOnRight — AR display)

Vertex 3 is the fixed pivot. Everything else is positioned relative to it.

## Fork vertices (1 and 2) — independent per vertex

Base position: both to the RIGHT of vertex 3 at `(n-2)*GAP + R + 4`.

Reflect to the LEFT of 3 (around vertex 3's vertical axis) if Q^op has that vertex pointing INTO 3:
- Reflect vertex 1 if Q^op has 1→3
- Reflect vertex 2 if Q^op has 2→3

Reflection formula: `2 * axis3 - forkBaseX`

## Tail vertices (4..n) — per-vertex iterative

Build x positions from vertex 3 outward, one step at a time:

```
chainX[3] = axis3
for v = 4 to n:
  if Q^op has (v-1)→v  →  chainX[v] = chainX[v-1] + GAP   (v to the RIGHT)
  if Q^op has v→(v-1)  →  chainX[v] = chainX[v-1] - GAP   (v to the LEFT)
```

Rule: **exiting arrow to next node → you are to its left. Incoming arrow from next node → you are to its right.**

This guarantees every tail Q^op arrow points left-to-right.

## SVG width

Computed dynamically: `max(all vx values) + R + 4`

## Y coordinates (forkOnRight)

- Vertex 2: `R + 4` (top)
- Vertex 1: `cy` (fork junction level)
- Chain v ≥ 3: `cy + (v - 3) * stepY` (slopes downward)

where `cy = FORK_Y + R + 8`, `stepY = cy - R - 4`
