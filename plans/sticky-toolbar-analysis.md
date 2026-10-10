# Sticky Toolbar — Scroll Visibility Analysis

> **Context:** The toolbar (breadcrumb + zoom controls + Change Title / Change Cover / Add Next
> buttons) sits in normal document flow inside the view's scroll container. On large collections
> — especially when zoomed in to a low column count so the grid is tall — the toolbar scrolls
> off the top of the pane. The zoom controls and navigation buttons are then unreachable without
> scrolling all the way back to the top. The fix should work at every zoom level because the
> problem is worse, not better, when zoomed in (fewer columns = more rows = more scrolling).

---

## 1. Root Cause

### Layout structure

`.media-tracker-view` is the Obsidian `contentEl` element. It is both the padding container and
the scroll container:

```css
.media-tracker-view {
    padding: var(--size-4-3);
    overflow-y: auto;
    height: 100%;
}
```

Its two children are rendered in normal block flow:

```
┌──────────────────────────────────────────────────────────────┐
│  [padding-top: var(--size-4-3)]                              │
├──────────────────────────────────────────────────────────────┤
│  .media-tracker-toolbar                 Library / Comics / … │
│                                         − +  Change Title …  │
├──────────────────────────────────────────────────────────────┤
│  .media-tracker-grid                                         │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐     │
│  │      │ │      │ │      │ │      │ │      │ │      │     │
│  │      │ │      │ │      │ │      │ │      │ │      │     │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘     │
│  … more rows …                                               │
└──────────────────────────────────────────────────────────────┘
```

Because the toolbar has no `position` override it participates in the normal scroll flow. As
soon as the user scrolls past `padding-top + toolbar-height` pixels the toolbar exits the
scrollport and all controls vanish.

### Why zoom amplifies the problem

At the maximum column count (zoomed out), the grid is wide and short: perhaps two rows for 12
items. At one column (maximum zoom-in), the same 12 items become 12 rows — roughly 12× more
scrollable height. The toolbar disappears after the user scrolls past the first card. This is
the exact situation where the zoom controls are most needed (to zoom back out), and they are
the least accessible.

---

## 2. Options

### Option A — `position: sticky; top: 0` (minimal) ⚠️

Add two declarations to `.media-tracker-toolbar`:

```css
.media-tracker-toolbar {
    position: sticky;
    top: 0;
    z-index: 1;
    background-color: var(--background-primary);
}
```

Sticky positioning clamps the toolbar to `top: 0` relative to the scroll container's padding
edge. Because `.media-tracker-view` has `padding: var(--size-4-3)` on all sides, the toolbar
is already inset `var(--size-4-3)` from the pane edge. When the sticky constraint engages,
that top padding scrolls away and the toolbar is flush with the container top — no gap.
`background-color` prevents grid cards from showing through.

| | |
|-|-|
| ✅ Two properties, CSS only, no JS | |
| ✅ Works at every column count and zoom level | |
| ⚠️ The left/right padding strips (`var(--size-4-3)` wide on each side) are **not** covered by the toolbar background — as the grid scrolls behind the stuck toolbar, card slivers are visible in the side gutters | |

The side-gutter bleed is visible whenever a card row's background colour is darker than the
pane background. On most Obsidian themes `--background-secondary` (card background) is
noticeably different from `--background-primary` (pane background), making the bleed
distracting.

**Verdict:** Works but the side-gutter bleed looks unpolished. Rejected as the final form;
   used as the foundation for Option B.

---

### Option B — Sticky with edge-to-edge background ⭐ (recommended)

Extend the toolbar background to the full pane width by pulling the element outside the
container's side padding with negative margins, then restoring the internal inset with
matching padding:

```css
.media-tracker-toolbar {
    position: sticky;
    top: 0;
    z-index: 1;
    background-color: var(--background-primary);
    /* Pull left and right edges flush with the pane */
    margin-left: calc(-1 * var(--size-4-3));
    margin-right: calc(-1 * var(--size-4-3));
    /* Restore the visual inset inside the toolbar */
    padding-left: var(--size-4-3);
    padding-right: var(--size-4-3);
    /* Replace margin-bottom with padding-bottom so background covers the gap */
    padding-bottom: var(--size-4-3);
    margin-bottom: 0;
}
```

The toolbar's rendered width becomes `100% + 2 × var(--size-4-3)` — it spans edge-to-edge
inside the pane. The negative margins do not affect the toolbar's height or the flex layout
of its children (breadcrumb, zoom buttons, action buttons) because `padding-left/right`
restores the inset exactly.

> ninja: `margin-bottom` is replaced by an equal `padding-bottom` so the background colour
> covers the space between the toolbar buttons and the grid. Without this, a card whose
> top row aligns with the toolbar's original bottom margin would be partially visible above
> the toolbar as the user begins to scroll — the background gap disappears and the grid
> shows through.

| | |
|-|-|
| ✅ CSS only, no JS, no DOM changes | |
| ✅ Edge-to-edge background eliminates the side-gutter bleed | |
| ✅ Works at every zoom level | |
| ✅ The existing `@media (max-width: 420px)` block only adjusts `flex-wrap` and button padding — no conflict | |
| ✅ Negative-margin trick is standard CSS; supported everywhere | |
| ⚠️ The bottom gap between toolbar and grid (previously `margin-bottom: var(--size-4-3)`) is now `padding-bottom: var(--size-4-3)` — visually identical but semantically part of the toolbar | |

The ⚠️ is cosmetic naming only; the rendered layout is unchanged.

---

### Option C — DOM restructure (scroll inner container) ❌

Remove `overflow-y: auto` from `.media-tracker-view`. In `grid-view.ts`, wrap the grid in a
new `.media-tracker-scroll` div that carries `overflow-y: auto; flex: 1`. The toolbar lives
outside the scroll container and never scrolls.

```
.media-tracker-view  (flex column, height: 100%, no overflow)
├── .media-tracker-toolbar   (static, always visible)
└── .media-tracker-scroll    (overflow-y: auto, flex: 1)
    └── .media-tracker-grid
```

| | |
|-|-|
| ✅ Conceptually the cleanest separation | |
| ❌ Requires changes to `grid-view.ts` (new wrapper div in `render()`) | |
| ❌ `applyGridColumns()` queries `.media-tracker-grid` for its `clientWidth` to compute column count — the wrapper div changes the DOM path and must be tested | |
| ❌ `registerZoomListeners` attaches the `wheel` handler to `this.contentEl` — the wheel target changes | |
| ❌ More surface area for regressions across the column-calculation logic | |

**Verdict:** Architecturally correct but disproportionate to the problem. Rejected unless
Option B proves insufficient.

---

### Option D — JS fixed positioning ❌

On `scroll` events on `contentEl`, read `scrollTop` and toggle a `is-stuck` class that
switches the toolbar to `position: fixed` with a computed `top`/`left`/`width`.

| | |
|-|-|
| ❌ Requires a scroll listener, a resize listener, and a bounding-rect read on every scroll event | |
| ❌ Fixed positioning breaks out of the Obsidian pane stacking context — toolbar can overlap other panes | |
| ❌ Width must be recalculated on every resize; ResizeObserver already used for column counts | |
| ❌ Adds complexity the CSS approach eliminates entirely | |

**Verdict:** Rejected. Option B does the same job with zero JS.

---

## 3. Implementation

All changes are in `styles.css`. `grid-view.ts` and `cards.ts` are unchanged.

### 3.1 Current rule

```css
.media-tracker-toolbar {
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
    margin-bottom: var(--size-4-3);
}
```

### 3.2 Updated rule

```css
.media-tracker-toolbar {
    display: flex;
    align-items: center;
    gap: var(--size-4-2);
    /* sticky toolbar */
    position: sticky;
    top: 0;
    z-index: 1;
    background-color: var(--background-primary);
    margin-left: calc(-1 * var(--size-4-3));
    margin-right: calc(-1 * var(--size-4-3));
    padding-left: var(--size-4-3);
    padding-right: var(--size-4-3);
    padding-bottom: var(--size-4-3);
    /* margin-bottom replaced by padding-bottom above */
}
```

`margin-bottom: var(--size-4-3)` is removed and replaced by `padding-bottom: var(--size-4-3)`.
The grid-to-toolbar gap is visually unchanged.

### 3.3 Mobile block (`@media (max-width: 420px)`)

The existing mobile override adjusts `flex-wrap` on `.media-tracker-toolbar` and padding on
child buttons — neither conflicts with the new sticky rules. No change needed there.

---

## 4. Zoom-level behaviour

The column count is driven by `--media-tracker-columns` (a CSS custom property set inline on
`.media-tracker-view`). The sticky toolbar is purely a scroll-plane feature; it has no
interaction with the grid column count. The table below confirms the fix applies uniformly:

| Zoom level | Grid height | Toolbar scrolls away? | With fix |
|------------|-------------|----------------------|---------|
| Max columns (zoomed out) | Short — 1–2 rows for typical collections | Rarely, only on very large collections | Toolbar sticks at top of pane |
| Mid (3–5 columns) | Moderate | Yes, after ~5 rows | Toolbar sticks |
| 1 column (max zoom-in) | Tall — one card per row | Yes, after the very first card | Toolbar sticks |

> ninja: the fix is zoom-agnostic by design. `position: sticky` reacts to scroll distance,
> not column count. The zoom controls (−/+) that are hardest to reach when zoomed in are now
> always one scroll-free click away.

---

## 5. Verification Plan

No automated test harness exists for view layout; this is a manual checklist.

**Core behaviour**
1. Open any collection with ≥ 10 items at a 2-column zoom level. Scroll down two screenfuls.
   Confirm the toolbar remains pinned at the top of the pane throughout.
2. Confirm the breadcrumb, zoom buttons, Change Title, Change Cover, and Add Next are all
   clickable while scrolled (toolbar is not obscured by anything above).
3. Confirm the toolbar background covers the full pane width — no card slivers visible in the
   left/right gutters as cards scroll behind the toolbar.

**Zoom interaction**
4. While scrolled mid-grid, click `−` to zoom out. Confirm the grid reflows and the toolbar
   stays stuck (does not jump or flash).
5. While scrolled mid-grid, use Ctrl+Scroll to zoom. Same check.
6. Zoom in to 1 column on a collection with ≥ 20 items. Scroll to item 15. Confirm toolbar
   is still visible and functional.

**Scroll-top state (toolbar not stuck)**
7. At the very top of the view (not scrolled), confirm the toolbar appears at its normal
   position with `var(--size-4-3)` padding above it — identical to the pre-fix appearance.
8. Confirm the gap between the toolbar and the first grid row is visually the same before and
   after the fix (`padding-bottom` replacing `margin-bottom`).

**Edge cases**
9. A collection with 0 items (empty state message) — toolbar sticks correctly; empty message
   is visible below.
10. Library root view — no Change Title button; remaining buttons still sticky.
11. Obsidian panel narrower than 420 px (`@media (max-width: 420px)` block) — toolbar wraps
    to two lines, sticky behaviour is preserved, breadcrumb takes the full first line.
12. Theme with a non-default `--background-primary` — confirm the toolbar background matches
    the pane (uses the variable, not a hard-coded colour).

---

## 6. Summary

The toolbar scrolls off screen because it sits in normal flow inside the same `overflow-y: auto`
container as the grid. As the grid grows (more items, or fewer columns from zooming in), the
scroll distance increases and the toolbar disappears sooner and further.

`position: sticky; top: 0` pins the toolbar to the scrollport top once the user scrolls past
it. The negative left/right margins with matching padding restore the full-width background so
grid cards scrolling behind the toolbar are cleanly covered. The change is three meaningful
lines of CSS and converts `margin-bottom` to `padding-bottom` on one existing rule.

No JS, no new DOM elements, no changes outside `styles.css`.

---

*Generated: 2026-10-09 — pegasus-media-tracker / dev*
