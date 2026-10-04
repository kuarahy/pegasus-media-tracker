# Cover Aspect Ratio — Analysis & Options

> **Context:** The current grid enforces a hard `2/3` portrait aspect ratio on every cover, with
> `object-fit: cover`. This is fine for standard comic / book spines, but breaks down for square
> or near-square covers (graphic novel hardcovers, music albums, certain game boxes, etc.).
> 
> The trigger for this analysis is [Mouse Guard: Fall 1152](https://www.mouseguardcomic.com/) — its
> cover is approximately **1:1**, so `object-fit: cover` inside a `2/3` box crops ~33 % of the
> image height away, cutting off either the title or the author credit depending on vertical
> centering.

---

## 1. Current Implementation

### CSS (styles.css)

```css
/* Container — fixed portrait box */
.media-tracker-card-cover {
  aspect-ratio: 2 / 3;
  background-color: var(--background-modifier-border);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* Image — stretch + crop */
.media-tracker-card-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;   /* crops whatever doesn't fit */
}
```

### Grid (styles.css)

```css
.media-tracker-grid {
  display: grid;
  grid-template-columns: repeat(var(--media-tracker-columns, 6), 1fr);
  gap: var(--size-4-3);
}
```

Column count (`--media-tracker-columns`) is set at runtime by `grid-view.ts` using a
`ResizeObserver`; the minimum card width is `110 px`. No explicit `grid-auto-rows` is set, so
every row height equals the **tallest card** in that row.

---

## 2. The Problem

| Cover ratio | 2/3 container result |
|-------------|----------------------|
| 2:3 portrait | ✅ Fills perfectly, no cropping |
| 3:4 (slight portrait) | ✅ Minimal cropping, negligible |
| 1:1 square | ⚠️ ~33 % height cropped away |
| 4:3 landscape | ❌ ~50 % height cropped (or ~33 % width) |
| 16:9 landscape | ❌ ~75 % height cropped |

**What gets lost:** For Mouse Guard, `object-position: center` (the default) keeps the
middle of the image, so both the top title and the bottom author credit are cropped. An
`object-position: top` fix helps show the title, but loses the author name — neither is
correct.

---

## 3. Grid Alignment — The Core Tension

The grid's visual consistency comes from **uniform card heights**. Every card is the same
width (`1fr`) and the same height (driven by `aspect-ratio: 2/3` on the cover + fixed title
row). This gives clean, snappable row baselines.

As soon as covers have different intrinsic ratios and we stop enforcing a single container
ratio, row heights become heterogeneous — each row height is the max of its tallest card.
The grid still *works*, but short cards in a tall row leave visual dead space below them.

```
  Portrait  Square  Portrait  Portrait  Square   Portrait
  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐
  │      │  │ 1:1  │  │      │  │      │  │ 1:1  │  │      │
  │ 2:3  │  │      │  │ 2:3  │  │ 2:3  │  │      │  │ 2:3  │
  │      │  ├──────┤  │      │  │      │  ├──────┤  │      │
  │      │  │ dead │  │      │  │      │  │ dead │  │      │  ← dead space
  ├──────┤  │ zone │  ├──────┤  ├──────┤  │ zone │  ├──────┤
  │title │  ├──────┤  │title │  │title │  ├──────┤  │title │
  └──────┘  │title │  └──────┘  └──────┘  │title │  └──────┘
             └──────┘                       └──────┘
```

True masonry would solve this, but CSS `grid-template-rows: masonry` is still behind
experimental flags and unavailable in Obsidian's embedded Chromium build.

---

## 4. Options

### Option A — Keep 2/3, `object-fit: contain` (letterbox)
**Change:** Replace `object-fit: cover` → `object-fit: contain` on `.media-tracker-card-cover img`.

```css
.media-tracker-card-cover img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  /* optional: background already provided by .media-tracker-card-cover */
}
```

| | |
|-|-|
| ✅ Zero DOM or JS changes — pure CSS | |
| ✅ Grid alignment unaffected — all cards same height | |
| ✅ No cropping of any cover | |
| ⚠️ Horizontal or vertical letterbox bands visible for non-2:3 images | |
| ⚠️ The `--background-modifier-border` fill color is theme-dependent and may look dull | |

**Verdict:** Fast win, safe, but the letterbox padding breaks the "solid art" feel of a
cover grid when many different ratios are mixed.

---

### Option B — 2/3 container + blurred ambient background ⭐ (recommended)

Used by Spotify, Apple Music, Plex. The cover image is shown with `object-fit: contain`,
while a blurred, darkened copy of the same image is scaled up behind it to fill the dead
space.

**DOM change in `cards.ts`:**

```ts
function renderCover(card: HTMLElement, name: string, coverSrc: string | null): void {
  const cover = card.createDiv({ cls: "media-tracker-card-cover" });
  if (coverSrc) {
    // Blurred ambient fill layer
    const blur = cover.createDiv({ cls: "media-tracker-card-cover-blur" });
    blur.style.backgroundImage = `url("${coverSrc}")`;
    // Foreground image
    cover.createEl("img", { attr: { src: coverSrc, alt: name } });
    return;
  }
  cover.createDiv({ cls: "media-tracker-card-placeholder", text: initials(name) });
}
```

**CSS addition:**

```css
.media-tracker-card-cover {
  aspect-ratio: 2 / 3;
  position: relative;
  overflow: hidden;
}

.media-tracker-card-cover-blur {
  position: absolute;
  inset: -8px;              /* overshoot edges so blur doesn't fade at corners */
  background-size: cover;
  background-position: center;
  filter: blur(16px) brightness(0.55) saturate(1.4);
  z-index: 0;
}

.media-tracker-card-cover img {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
```

| | |
|-|-|
| ✅ No cropping | |
| ✅ Grid alignment unaffected — 2/3 container unchanged | |
| ✅ Visually rich — fills dead space with ambient color derived from the cover | |
| ✅ Looks correct even for perfect 2:3 covers (blur is behind the image, invisible) | |
| ⚠️ Adds one extra DOM element per card | |
| ⚠️ `filter: blur` on many cards could cost GPU on large grids (mitigate: `will-change: filter` only on visible cards, or limit blur radius) | |
| ⚠️ SVG covers: blur renders fine; `data:` URIs in `background-image` may need escaping | |

**Verdict:** Best visual result for mixed-ratio cover libraries. Complexity is low (one
extra div, ~10 lines CSS). Performance is acceptable for typical Obsidian library sizes
(< ~500 visible cards at once).

---

### Option C — Adaptive card height ("cover adjusts to size")

Remove the fixed `aspect-ratio` from `.media-tracker-card-cover`. Let the image render at
its natural intrinsic ratio.

```css
.media-tracker-card-cover {
  /* no aspect-ratio */
  overflow: hidden;
}

.media-tracker-card-cover img {
  width: 100%;
  height: auto;
  display: block;
}
```

Also add `align-items: start` to `.media-tracker-grid` so shorter cards don't stretch:

```css
.media-tracker-grid {
  display: grid;
  grid-template-columns: repeat(var(--media-tracker-columns, 6), 1fr);
  gap: var(--size-4-3);
  align-items: start;   /* cards don't stretch to row height */
}
```

**Grid impact:**

- Each card is as tall as its image's natural ratio + title height.
- Within a row, all cards start at the same top edge but end at different bottom edges.
- This is a **staggered / waterfall** layout — not true masonry (no column-packing), but
  acceptable if the library is mostly consistent ratios with occasional outliers.

```
  Portrait  Square  Portrait  Portrait  Square   Portrait
  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐
  │      │  │ 1:1  │  │      │  │      │  │ 1:1  │  │      │
  │ 2:3  │  ├──────┤  │ 2:3  │  │ 2:3  │  ├──────┤  │ 2:3  │
  │      │  │title │  │      │  │      │  │title │  │      │
  │      │  └──────┘  │      │  │      │  └──────┘  │      │
  ├──────┤             ├──────┤  ├──────┤             ├──────┤
  │title │             │title │  │title │             │title │
  └──────┘             └──────┘  └──────┘             └──────┘
```

| | |
|-|-|
| ✅ No cropping, no letterbox, covers shown exactly as intended | |
| ✅ Most faithful to original cover artwork | |
| ⚠️ Uneven row bottom edges — visually noisy in mixed collections | |
| ⚠️ Images with no intrinsic size (some SVGs) collapse to 0 height | |
| ⚠️ `MIN_CARD_PX` zoom logic still works but row heights are unpredictable | |
| ❌ Placeholder (initials) has no height — would need a fallback `min-height` or `aspect-ratio` on the cover when there is no image | |

**Verdict:** Closest to "cover should know its own shape," but degrades grid uniformity.
Works best when a collection is homogeneous (all albums, all square game covers) rather
than a mixed library. Consider as a **per-collection setting** rather than a global default.

---

### Option D — Per-collection `coverRatio` frontmatter

Add an optional `coverRatio` key to the collection's `Cover.md` (or a new `_collection.md`
note). When present, it overrides the CSS custom property for that grid.

```yaml
---
coverRatio: "1:1"      # or "2:3", "4:3", "16:9", "auto"
---
```

In `grid-view.ts`, read the frontmatter value and set a CSS var on the grid element:

```ts
this.contentEl.style.setProperty(
  "--media-tracker-cover-ratio",
  coverRatio ?? "2 / 3"
);
```

```css
.media-tracker-card-cover {
  aspect-ratio: var(--media-tracker-cover-ratio, 2 / 3);
}
```

| | |
|-|-|
| ✅ Grid is always perfectly aligned *within* a collection | |
| ✅ Covers displayed at the intended ratio for that collection type | |
| ✅ No change to the default experience — opt-in only | |
| ⚠️ Doesn't help mixed collections (e.g., a reading list that spans books and albums) | |
| ⚠️ `"auto"` still needs Option C's staggered approach as a backend | |

---

## 5. Recommendation Summary

| Option | Grid alignment | Cropping | Visual quality | Effort |
|--------|---------------|----------|----------------|--------|
| A — contain + letterbox | ✅ Perfect | ✅ None | ⚠️ OK | 🟢 Trivial |
| **B — blurred ambient** | ✅ Perfect | ✅ None | ✅ Best | 🟡 Low |
| C — adaptive height | ⚠️ Staggered | ✅ None | ⚠️ Rough in mixed sets | 🟡 Low |
| D — per-collection ratio | ✅ Perfect per collection | ✅ None | ✅ Good | 🟡 Low |

### Phased approach

1. **Now:** Ship Option B (blurred ambient) as default. It handles the Mouse Guard case and
   every other ratio without any user configuration, and the grid stays pristine.
2. **Later:** Add a per-collection `coverRatio` frontmatter key (Option D) to explicitly
   opt collections into a fixed ratio (e.g., a "Music" collection can declare `1:1`). The
   blurred ambient treatment stays for covers that still don't fill the ratio.
3. **Future:** Revisit CSS Masonry once `grid-template-rows: masonry` lands in stable
   Chromium (currently behind `#enable-experimental-web-platform-features`).

---

## 6. Implementation Notes for Option B

### Performance guard
Blur is applied in the paint layer. For very large lists, restrict to visible cards via
Obsidian's virtual scroll or limit to the `IntersectionObserver` visible set. An
alternative is using `backdrop-filter` instead of `filter` to leverage compositor
optimisation, though `backdrop-filter` only blurs *behind* an element and won't work here.

### Placeholder cards (no cover image)
When `coverSrc` is null, the placeholder div already fills the `2/3` container — no blur
element is created. No change needed.

### `done` opacity overlay
The existing `.is-done .media-tracker-card-cover { opacity: 0.55 }` rule applies to the
whole cover container, so it will dim both the blur layer and the foreground image equally.
No changes needed.

### SVG covers
SVG files set as `background-image` on a div render correctly. The `filter: blur` on the
background layer will work. The foreground `<img>` SVG will still render with its own
intrinsic ratio through `object-fit: contain`.

---

*Generated: 2026-10-03 — pegasus-media-tracker / dev*
