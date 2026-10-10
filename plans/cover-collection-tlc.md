# Plan: Cover Collection section — title readability TLC

**Context:** The Covers Collection grid currently renders each collection card's title in
`font-size: var(--font-ui-small)` with `line-height: var(--line-height-tight)` and a 2-line
clamp. At small card widths (6-column default grid), titles like *"Absolute Wonder Woman 18 –
Bel…"* are barely legible — the text competes visually with the cover art and carries no
typographic weight that signals "this is a collection label, not decoration".

This plan covers two orthogonal improvements that together resolve the readability issue:

| # | Scope | Status |
|---|-------|--------|
| 1 | **Collection card title baseline** — bigger, bolder title CSS for `.media-tracker-card-collection` cards | New (this doc) |
| 2 | **Per-collection custom font** — `font:` frontmatter key + Google Fonts injection | Analysis complete → [`collection-title-fonts.md`](collection-title-fonts.md) |
| 3 | **Item card variant title hierarchy** — two-span rendering for `{primary} – {secondary}` names | Analysis complete → [`variant-title-readability-analysis.md`](variant-title-readability-analysis.md) |

Items 2 and 3 are already fully specified in their own documents; this plan adds the missing
baseline fix (item 1) and acts as the implementation coordination point for all three.

---

## 1 · YAGNI check

Does the baseline CSS change need to be built?

Yes — without it, per-collection fonts (item 2) just swap one barely-readable font for a
different barely-readable font. The font feature is cosmetic differentiation; the size/weight
fix is the readability floor that makes the grid functional at small widths. Building the font
feature first without this fix ships a half-working experience.

Item 3 (variant title hierarchy for item cards) is independent — it applies when the user
navigates *inside* a collection. It does not affect collection-level cards at all.

**ninja:** Items 2 and 3 can land in any order; item 1 should land first or alongside item 2.
Without item 1, the font feature's user-visible payoff is minimal.

---

## 2 · Root cause — why collection titles are hard to read

### Current CSS (both card types share one rule)

```css
/* styles.css */
.media-tracker-card-title {
    padding: var(--size-4-2);
    font-size: var(--font-ui-small);
    line-height: var(--line-height-tight);
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
}
```

`var(--font-ui-small)` is ~12–13 px in most Obsidian themes. Item cards at that size are fine
because the issue number is short and the card is navigated to only after choosing a
collection. Collection cards are the *entry point* — they are what the user scans first.
Rendering them at the smallest available UI size is the wrong default.

### Why item cards don't have this problem (as much)

Item names like `"Ultimate X-Men 12"` fit comfortably on one line at small sizes. The problem
is worst on collection cards because collection names tend to be longer ("Absolute Wonder
Woman", "Saga of the Swamp Thing") and because the user is scanning a grid of collections to
navigate — legibility directly impacts usability, not just aesthetics.

---

## 3 · Fix — scoped CSS override for collection card titles

Add a single additional CSS rule that targets only `.media-tracker-card-collection` titles:

```css
/* styles.css — add after existing .media-tracker-card-title rule */

/* Collection cards are navigation entry points; give their titles slightly more
   presence than item cards so the grid is scannable at small widths. */
.media-tracker-card-collection .media-tracker-card-title {
    font-size: var(--font-ui-medium);
    font-weight: var(--font-semibold);
    -webkit-line-clamp: 2; /* keep clamping; collection names can be long */
}
```

**Why `--font-ui-medium` and `--font-semibold`:**

- `--font-ui-medium` is the standard body/UI text size in Obsidian (typically 14–15 px). It is
  one step up from `--font-ui-small` and avoids introducing a hard-coded px value that breaks
  on user font-size overrides.
- `--font-semibold` adds enough weight to anchor the title visually against the cover art
  without requiring a full bold weight (which would feel heavy in a grid).
- Both tokens are available in every Obsidian theme; no fallback needed.

**ninja:** The specificity of `.media-tracker-card-collection .media-tracker-card-title` beats
`.media-tracker-card-title` by one class selector — no `!important`, no duplication of the
base rule. The base rule still applies for `padding`, `line-height`, `overflow`, and the box
clamp setup; the override rule adds only the two properties that differ.

### What NOT to do

- **Do not increase the font size for item cards.** Item names already fit; the extra size
  would reduce information density inside collections without any benefit.
- **Do not use a hard-coded `font-size: 14px`.** Breaks if the user has increased the Obsidian
  UI font in accessibility settings.
- **Do not clamp to 1 line.** Collection names are intentionally long in many vaults. Clamping
  to 1 line silently truncates names like "The Sandman: Overture" to "The Sandman: Ove…".
  The 2-line clamp from the base rule is correct.
- **Do not change the padding or line-height.** The base rule's spacing is correct for both
  card types.

---

## 4 · Interaction with item 2 (per-collection fonts)

The scoped rule from §3 sets `font-size` and `font-weight`. The per-collection font feature
(`collection-title-fonts.md`) sets `--media-tracker-collection-font` as a CSS custom property
and applies it via:

```css
/* from collection-title-fonts.md §5 */
.media-tracker-card-collection[style*="--media-tracker-collection-font"] .media-tracker-card-title {
    font-family: var(--media-tracker-collection-font);
}
```

These two rules coexist without conflict. The `font-family` override does not touch
`font-size` or `font-weight`; the baseline rule does not touch `font-family`. A collection
with a custom font gets:

1. `font-size: var(--font-ui-medium)` — from the baseline override
2. `font-weight: var(--font-semibold)` — from the baseline override
3. `font-family: <custom>` — from the per-collection rule when `font:` is set in Cover.md

A collection *without* a custom font gets items 1 and 2 and falls back to the Obsidian theme
font — still more readable than today.

**ninja:** Build item 1 first (one-line CSS rule, immediate win). Build item 2 second (the
font feature is larger but the analysis in `collection-title-fonts.md` is complete and
implementation-ready). The two builds do not touch the same lines of any file.

---

## 5 · Interaction with item 3 (variant title hierarchy for item cards)

Item 3 applies only to `.media-tracker-card-item` inside a collection. It has no effect on
`.media-tracker-card-collection` cards at the library root. The two changes are completely
orthogonal and can be built independently in any order.

---

## 6 · Files that change (item 1 only)

| File | Change | Net lines |
|------|--------|-----------|
| `styles.css` | Add `.media-tracker-card-collection .media-tracker-card-title` override rule | +5 |

No changes to TypeScript source, no new files, no settings, no schema changes.

---

## 7 · Validation checklist

1. **Baseline legibility:** Open the plugin view at the default 6-column grid. Confirm
   collection card titles are rendered at `--font-ui-medium` weight and `--font-semibold`
   weight. Names like "Absolute Wonder Woman" and "Saga" should be clearly readable without
   zooming in.
2. **Item cards unaffected:** Navigate into any collection. Confirm item card titles still
   render at `--font-ui-small` (normal weight). The override rule must not cascade into item
   cards.
3. **Long names clamp correctly:** A collection named "The Sandman: Season of Mists" should
   clamp to 2 lines, not overflow the card or stretch its height relative to adjacent cards.
4. **Custom font stacks correctly (item 2):** After building item 2, set `font: "Playfair
   Display"` in a Cover.md. Confirm the collection title renders in Playfair Display at
   `--font-ui-medium` size and `--font-semibold` weight — not at `--font-ui-small`.
5. **Zoom levels:** Test at 3-column (zoomed in) and 8-column (zoomed out). At 8 columns the
   cards are narrower; confirm titles still clamp at 2 lines and don't overflow horizontally.
6. **Theme compatibility:** Switch to a light Obsidian theme and a high-contrast theme.
   Confirm `--font-ui-medium` and `--font-semibold` resolve to readable values in both.

---

## 8 · Build order

```
1. styles.css override (item 1) — 5 lines, instant win, standalone commit
2. collection-title-fonts.md implementation (item 2) — ~50 lines across 6 files
3. variant-title-readability-analysis.md implementation (item 3) — ~23 lines across 2 files
```

Items 2 and 3 have no shared files and can be built in parallel if desired.

---

*Authored by Lucas — pegasus-media-tracker / dev*

*Generated: 2026-10-09 — pegasus-media-tracker / dev*
