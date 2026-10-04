# Read Button Alignment — Variable-Length Title Analysis

> **Context:** In any collection where items carry variant suffixes (e.g.
> "TMNT 1 (2024) - Earls variant"), the card title wraps to two lines. Adjacent
> items whose titles fit on one line ("TMNT 5 (2024)") leave the Read button
> floating higher inside the card, so the buttons in the same grid row land at
> visibly different Y positions. On longer rows or when zoomed out the stagger
> is immediately noticeable.

---

## 1. Root Cause

### Card layout

`.media-tracker-card` is a `flex` column with three stacked children:

```
┌──────────────────────────────┐
│  .media-tracker-card-cover   │  aspect-ratio: 2/3 (fixed)
├──────────────────────────────┤
│  .media-tracker-card-title   │  variable: 1–2 lines (-webkit-line-clamp: 2)
├──────────────────────────────┤
│  .media-tracker-card-action  │  follows title directly
└──────────────────────────────┘
```

CSS grid places every card in the same row at an identical height (the tallest
card in that row stretches all siblings). The cover fills the same proportion of
height in every card. The **title, however, is not fixed-height**: it consumes
`1 × line-height` for short names and `2 × line-height` for long ones.

Because `.media-tracker-card-action` has no `margin-top` property, it sits
immediately below whatever text the title produced. On a 1-line card the button
sits one `line-height` higher than on a 2-line card, even though both cards have
the same total height.

### Why the clamp alone does not help

`-webkit-line-clamp: 2` caps overflow at two lines; it does **not** add a
minimum height. A card whose title uses only one of those two allowed lines still
renders a shorter title box — the button is not anchored to the bottom.

---

## 2. Options

### Option A — Fixed height on the title ❌

Set `height` or `min-height` on `.media-tracker-card-title` to exactly
`2 × line-height-tight × 1em + 2 × --size-4-2` so every title occupies the
same vertical space.

| | |
|-|-|
| ❌ Requires a computed `calc()` mixing two CSS variables and `1em`, fragile if either token changes | |
| ❌ If the theme overrides `--line-height-tight` the hard-coded height drifts | |
| ❌ A future third line (e.g. subtitle) would require touching this value again | |

**Verdict:** Achieves alignment but ties the layout to a specific computed size. Rejected.

---

### Option B — `margin-top: auto` on the action button ⭐ (recommended)

Add one rule to `.media-tracker-card-action`:

```css
.media-tracker-card-action {
    margin: auto var(--size-4-2) var(--size-4-2);
}
```

`auto` top margin in a flex column absorbs all remaining free space above the
button. Since every card in the same grid row is the same height and the cover
occupies the same aspect-ratio share, the button always lands at the same
distance from the card's bottom edge — regardless of whether the title is one
line or two.

| | |
|-|-|
| ✅ One-property change, zero new selectors | |
| ✅ Works at every zoom level and every card width | |
| ✅ Robust to title length changes; no computed magic | |
| ✅ Consistent with how flex toolbars use `margin: auto` for spacing | |
| ⚠️ The visual gap between title and button grows on 1-line cards | |

The ⚠️ is acceptable: the eye reads the button's position relative to the card
bottom, not relative to the title. Consistent bottom-anchoring looks intentional;
the stagger looks broken.

> ninja: `margin-top: auto` is the standard flexbox idiom for "stick this child
> to the far end of the container". It does not require knowing the title's
> computed size, and it scales correctly for every card width and zoom setting
> already supported by the grid.

---

## 3. Implementation

All changes are in `styles.css`. `cards.ts` and `grid-view.ts` are unchanged.

### 3.1 Current rule

```css
.media-tracker-card-action {
    margin: 0 var(--size-4-2) var(--size-4-2);
}
```

### 3.2 Updated rule

```css
.media-tracker-card-action {
    margin: auto var(--size-4-2) var(--size-4-2);
}
```

`0` → `auto` on the top margin only. Left and bottom margins are unchanged so
the button stays inset from the card edge exactly as before.

No change is needed in the `@media (max-width: 420px)` block — the toolbar
padding override there does not affect card layout.

---

## 4. Verification Plan

No automated test harness exists for view layout; this is a manual checklist.

**Core case (the reported symptom)**
1. Open any collection where some items have variant suffixes and some do not.
2. Confirm Read buttons in the same row all share the same Y position.
3. Zoom out to the maximum column count; confirm alignment holds at narrow card widths.
4. Zoom in to 1–2 columns; confirm the button is not pushed off-screen by the extra top margin.

**Edge cases**
5. A card whose title clips at exactly 2 lines — button still aligns with 1-line neighbours.
6. A collection where all items have 1-line titles — uniform spacing looks intentional, not broken.
7. A collection where all items have 2-line titles — no regression; button position unchanged relative to current behaviour.
8. `is-done` state — green background and muted title still render correctly; the margin change does not affect the colour rules.

---

## 5. Summary

The stagger happens because `.media-tracker-card-action` is positioned by normal
flex flow immediately after a variable-height title. Changing its top margin from
`0` to `auto` bottom-anchors the button inside the flex column. Every card in the
same grid row has identical total height, so bottom-anchoring produces identical
button Y positions — the button aligns whether the title is one word or
"TMNT 7 (2024) - Variant C Ferreyra".

The fix is one character: `0` → `auto`.

---

*Generated: 2026-10-04 — pegasus-media-tracker / dev*
