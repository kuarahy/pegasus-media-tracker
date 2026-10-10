# Variant Suffix Title Readability Analysis

> **Context:** Item cards whose names include a variant suffix (e.g.
> "Ultimate X-Men 13 - Iban Coello Variant", "Ultimate X-Men 19 - Nogi San Variant")
> render the entire string in uniform weight and size across the `-webkit-line-clamp: 2`
> area. At `--font-ui-small`, the two-part name reads as a single dense block — the user
> cannot quickly distinguish the issue number from the variant annotation when scanning the
> grid.
>
> **Relationship to button alignment:** `read-button-alignment-analysis.md` addresses why
> the Read button sits at different Y positions on 1-line vs 2-line title cards. That fix
> (`margin-top: auto` on `.media-tracker-card-action`) is orthogonal to this one — both
> problems appear together on variant cards, both can be resolved independently.

---

## 1. Root Cause

### How the card title is rendered

`createItemCard` in `src/ui/cards.ts`:

```
card.createDiv({
    cls: "media-tracker-card-title",
    text: opts.name,
    attr: { title: opts.name },
});
```

`opts.name` is the raw file basename — e.g., `"Ultimate X-Men 13 - Iban Coello Variant"`.
It is placed as a single text node. There is no structural distinction between the primary
portion (`"Ultimate X-Men 13"`) and the variant annotation (`"Iban Coello Variant"`).

### CSS

```css
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

`-webkit-line-clamp: 2` allows up to two lines but sets no visual hierarchy between them.
Both lines share the same `font-size`, `font-weight`, and `color`. The ` - ` separator is
typographically invisible — it does not visually signal that the second part is ancillary.

### Why the tooltip is not enough

The `title` attribute tooltip contains the full name and is always correct. However:
- Hover is not available on touch/mobile.
- In a grid of 8–12 cards, the user's first pass is purely visual — hovering each card
  to identify variants defeats the purpose of the grid view.
- The problem is not that the name is inaccessible; it is that it is unreadable at a glance.

---

## 2. Options

### Option A — Clamp to 1 line, rely on tooltip

Set `-webkit-line-clamp: 1` on `.media-tracker-card-title` for item cards.

| | |
|-|-|
| ✅ Uniform card heights; also eliminates the button misalignment without `margin-top: auto` | |
| ❌ "Ultimate X-Men 13 - Iban…" clips mid-title; the variant suffix becomes invisible | |
| ❌ Long base titles ("My Hero Academia - Vigilantes 12") also clip before the number | |
| ❌ The only recovery path is hover, which does not work on mobile | |

**Verdict:** Solves the layout symptom but makes the readability problem worse. Rejected.

---

### Option B — Strip the variant suffix from the visible title (show in tooltip only)

Detect a trailing ` - suffix` with `parseTitleParts` and display only the primary portion
in the card. The full name remains in the `title` attribute.

| | |
|-|-|
| ✅ Every card title fits on one line; grid is uniform | |
| ✅ Button misalignment also resolves (no 2-line cards) | |
| ❌ Variant editions are indistinguishable from the base edition at a glance | |
| ❌ A collection with only variant cards (e.g., a variant shelf) loses all labelling | |
| ❌ Discards information the user explicitly put in the filename | |

**Verdict:** Appealing layout-wise but wrong product decision — the variant annotation is
meaningful content, not decoration. Rejected.

---

### Option C — Visual hierarchy via two-span rendering ⭐ (recommended)

Parse `opts.name` for a ` - ` separator that follows a number. Render the primary portion
in a `<span class="media-tracker-card-title-primary">` and the variant suffix in a
`<span class="media-tracker-card-title-secondary">`. Apply muted color and slightly
smaller size to the secondary span.

| | |
|-|-|
| ✅ Both parts remain visible — no information is hidden | |
| ✅ The eye lands on the issue number first; the variant name recedes visually | |
| ✅ Cards without a variant suffix are unaffected (no split, no DOM change) | |
| ✅ Works on touch/mobile — no hover dependency | |
| ✅ The `title` attribute tooltip still carries the full name | |
| ⚠️ Two-part titles still occupy 2 lines — button alignment fix (`margin-top: auto`) still needed | |

The ⚠️ is not a regression — it is the same state as today. Once both fixes land, variant
cards align AND read clearly.

> ninja: splitting on ` - ` following a digit is the correct heuristic because the
> naming convention in `naming.ts` mandates trailing digits for the issue number. A name
> that ends in a digit before ` - ` is almost certainly `{series} {n} - {variant}`, not
> an ambiguous compound title. A name with ` - ` that does NOT have a digit before the
> separator (e.g., "My Hero Academia - Vigilantes 12") does not match and is rendered as
> a single unsplit string — correct fallback.

---

## 3. Implementation

### 3.1 Parser — `parseTitleParts`

Add to `src/ui/cards.ts` (file-private, no export needed):

```typescript
// Matches: "Ultimate X-Men 13 - Iban Coello Variant"
//           ────────────────── ─ ────────────────────
//              primary (group 1)   secondary (group 2)
//
// ninja: anchors to a digit immediately before ` - ` to avoid splitting series titles
// that contain a dash as part of the name (e.g., "Spider-Man 5").
const VARIANT_SPLIT = /^(.*\d)\s+-\s+(.+)$/;

function parseTitleParts(name: string): { primary: string; secondary: string } | null {
    const match = name.match(VARIANT_SPLIT);
    if (!match) return null;
    return { primary: match[1].trimEnd(), secondary: match[2].trimStart() };
}
```

### 3.2 Card rendering — `createItemCard`

Replace the single `createDiv` title call with a helper that conditionally splits:

```typescript
// src/ui/cards.ts  (inside createItemCard, where title div is created)

const titleEl = card.createDiv({ cls: "media-tracker-card-title", attr: { title: opts.name } });
const parts = parseTitleParts(opts.name);
if (parts) {
    titleEl.createSpan({ cls: "media-tracker-card-title-primary", text: parts.primary });
    titleEl.createSpan({ cls: "media-tracker-card-title-secondary", text: ` \u2013 ${parts.secondary}` });
} else {
    titleEl.setText(opts.name);
}
```

> ninja: `\u2013` (en dash) replaces the raw ` - ` in the secondary span's text so the
> rendered separator is typographically correct and visually lighter than a hyphen.
> The `title` attribute still holds the original filename string (with the hyphen-minus)
> so hover tooltips and screen readers see the exact file name.

### 3.3 CSS additions — `styles.css`

```css
/* Variant suffix — secondary part of a split item title */
.media-tracker-card-title-secondary {
    font-size: calc(var(--font-ui-small) * 0.88);
    color: var(--text-muted);
    opacity: 0.85;
}
```

> ninja: `calc(… * 0.88)` is a relative scale rather than a fixed token. Choosing a
> fixed token (e.g., `--font-ui-smaller`) risks the secondary text becoming unreadably
> small if the user has increased the base UI font. The relative factor keeps both spans
> proportional regardless of theme or accessibility font-size overrides.
>
> `opacity: 0.85` adds a second layer of visual recession on top of `color: var(--text-muted)`.
> On themes where `--text-muted` is already very close to `--text-normal`, the opacity
> prevents the secondary span from blending into the primary.

### 3.4 `is-done` state

The `.is-done .media-tracker-card-title` rule already sets `color: var(--text-muted)` on
the entire title. The secondary span inherits this and also carries its own reduced
opacity — making the variant suffix slightly more muted than the primary portion even on
completed items. No additional rule needed.

---

## 4. Files that change

| File | Change | Net lines |
|------|--------|-----------|
| `src/ui/cards.ts` | Add `VARIANT_SPLIT` regex constant + `parseTitleParts` function; replace single `setText` with conditional span rendering in `createItemCard` | +18 |
| `styles.css` | Add `.media-tracker-card-title-secondary` rule | +5 |

**No changes to:** `src/naming.ts`, `src/library.ts`, `src/types.ts`, `src/settings.ts`,
`src/ui/grid-view.ts`, `src/main.ts`, `manifest.json`.

Collection cards (`createCollectionCard`) are unaffected — variant suffixes appear on item
cards (individual issues), not on collection-level cards.

---

## 5. What NOT to do

- **Do not split on every ` - `.** "Spider-Man – Black Suit 5" contains a dash that is
  part of the series name. The regex `.*\d\s+-\s+` guards against this by requiring a digit
  before the separator.
- **Do not hide the variant suffix.** Option B's appeal is a clean 1-line grid, but it
  silently removes information the user encoded in the filename. If the user wants to
  suppress variant labels they can rename the files.
- **Do not add a setting to toggle the split rendering.** If the heuristic misfires on
  a specific title, the correct fix is to adjust the regex (or rename the file), not to
  expose a boolean in settings that most users will never touch.
- **Do not change `parseTitleParts` to export it for use in grid sorting/filtering.**
  That is a separate concern; mixing display logic with data logic would violate SRP.
  Export it only when a concrete second caller exists.
- **Do not apply split rendering to `createCollectionCard`.** Collection folders do not
  follow the `{series} {n} - {variant}` naming convention.

---

## 6. Verification Plan

**Core case**
1. Open a collection containing at least one variant-suffix item (e.g., "Ultimate X-Men 13 - Iban Coello Variant") alongside standard items.
2. Confirm the variant card's title shows the primary part in normal weight/color and the secondary part in muted/smaller text.
3. Confirm the ` – ` separator (en dash) appears between the two spans in the rendered card.
4. Hover the variant card — confirm the `title` tooltip shows the original full name with a hyphen-minus (` - `).

**Non-variant cards unaffected**
5. Confirm standard items ("Ultimate X-Men 12", "Ultimate X-Men 14") render as a single text node with no `.media-tracker-card-title-secondary` span present in the DOM.

**Edge cases**
6. A series name containing a dash before the issue number: "Spider-Man 5" — confirm no split occurs (no digit immediately before ` - `).
7. A title with multiple ` - ` segments: "My Hero Academia - Vigilantes 12 - Cover B" — confirm it splits as primary "My Hero Academia - Vigilantes 12" + secondary "Cover B" (the regex is greedy on group 1, picking up the first dash as part of the series name).
8. `is-done` state — confirm that a completed variant item shows the secondary span at reduced opacity on top of the muted title color; neither span should lose legibility.
9. Dark theme and high-contrast theme — verify `--text-muted` + `opacity: 0.85` remains readable against the card background in both.
10. Mobile / touch — confirm the visual hierarchy is sufficient without hover; the muted secondary span should be legible at thumb-scanning distance.

---

## 7. Summary

The readability issue is caused by uniform typographic treatment across both lines of a
2-line clamped title. Variant suffixes like "Iban Coello Variant" carry equal visual weight
to the core title "Ultimate X-Men 13", making the grid hard to scan.

The fix is a small structural change in `createItemCard`: detect the `{primary} - {secondary}`
pattern (anchored to a trailing digit before the dash), render two spans, and mute the
secondary span in CSS. No new files, no settings, no schema changes. Cards without a
variant suffix are completely unaffected.

Apply alongside `read-button-alignment-analysis.md` (Option B: `margin-top: auto`) for
fully consistent variant card rendering.

---

*Generated: 2026-10-09 — pegasus-media-tracker / dev*
