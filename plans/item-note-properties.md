# Plan: item note properties — `subtitle` and `own`

> **Context:** Item notes are currently created with a single frontmatter property:
> `done: false`. The card renderer auto-detects a secondary display string from the
> filename via `parseTitleParts()` (digit-anchored `{primary} - {secondary}` split), and
> there is no frontmatter-backed way to set a secondary label or to record ownership of
> the physical item. This plan adds two new properties — `subtitle` (string) and `own`
> (boolean) — to the note creation template and threads them through types, readers, card
> opts, and CSS.
>
> **Relationship to variant-title readability:** `variant-title-readability-analysis.md`
> introduced the `VARIANT_SPLIT` regex and the two-span rendering in `createItemCard`.
> `subtitle` does not replace that heuristic — it overrides it per-note when the user
> explicitly sets it. Notes without `subtitle` continue to auto-detect via the regex.

---

## 1. Current State

### Note template

`createNextNote` in `src/actions.ts`:

```typescript
return app.vault.create(path, "---\ndone: false\n---\n");
```

Every new item note starts with `done: false` and nothing else. The filename is the only
source of display text; there is no frontmatter slot for an override label or ownership flag.

### Card rendering

`createItemCard` in `src/ui/cards.ts` accepts:

```typescript
opts: {
    name: string;        // raw file basename
    path: string;
    coverSrc: string | null;
    done: boolean;
    actionLabel: string;
    onOpen: () => void;
    onToggle: (card: HTMLElement) => void;
    showAction?: boolean;
}
```

The secondary span is derived entirely from `opts.name` via `parseTitleParts`. There is no
opt for an explicit secondary string, and no opt for ownership state.

### Type

`ItemNode` in `src/types.ts`:

```typescript
export interface ItemNode {
    kind: "item";
    name: string;
    path: string;
    done: boolean;
}
```

---

## 2. Design Decisions

### `subtitle` — string, optional

`subtitle` is an explicit per-note secondary label. When present (non-empty string), it is
used as the secondary span text verbatim. When absent or empty, the card falls back to the
existing `parseTitleParts` heuristic on the filename.

This preserves backward compatibility: every note without `subtitle` renders exactly as
before. Notes with `subtitle` get user-controlled secondary text regardless of how the
filename is structured.

> ninja: `subtitle` is intentionally not pre-populated in the note template (`""` in
> frontmatter would be truthy-checked and would suppress the regex fallback on every new
> note). The property only appears in a note's frontmatter when the user (or a future
> action) writes it there. Absence and empty string are both treated as "not set."

### `own` — boolean, pre-populated

`own` records whether the user physically owns the item (the disc, the book, etc.). Unlike
`subtitle`, it is written into the note template as `own: false` so it is present and
queryable from day one — the same pattern as `done: false`. The card shows a small
indicator when `own: true`.

> ninja: `own` and `done` are orthogonal. A user can own a book they have not read yet,
> and in a curated wishlist workflow they may track items they want before they own them.
> The two flags are never combined into a single compound state.

---

## 3. Options — `subtitle` rendering priority

### Option A — explicit `subtitle` overrides regex fallback ⭐ (recommended)

```
if subtitle (non-empty) → use subtitle as secondary span
else if parseTitleParts(name) matches → use regex result
else → single text node, no split
```

| | |
|-|-|
| ✅ Backward compatible — all existing cards render identically | |
| ✅ User has explicit control per note without renaming the file | |
| ✅ The regex fallback still works for new variant cards without frontmatter | |
| ✅ `subtitle` is additive — no existing logic is removed | |

**Verdict:** Recommended.

---

### Option B — `subtitle` is additive (show both)

Show the regex-detected primary/secondary split _and_ append `subtitle` as a third line.

| | |
|-|-|
| ❌ Three text lines on a 2-line clamped title produce unpredictable truncation | |
| ❌ Adds complexity for a case that is unlikely (a variant card that also needs an override) | |

**Verdict:** Rejected.

---

### Option C — remove regex fallback, require explicit `subtitle` everywhere

Delete `parseTitleParts` and `VARIANT_SPLIT`; render secondary text only from `subtitle`.

| | |
|-|-|
| ❌ All existing variant cards lose their secondary span until the user manually edits each note | |
| ❌ Breaks the zero-friction goal — the heuristic was specifically designed to avoid per-note edits | |

**Verdict:** Rejected.

---

## 4. Options — `own` visual indicator

### Option A — CSS class only, no visual (data only)

Write `own: boolean` in frontmatter and add `is-owned` to the card element, but apply no
CSS rule. Ownership is queryable via Obsidian Dataview / Search but invisible in the grid.

| | |
|-|-|
| ✅ Zero CSS, zero visual noise | |
| ❌ The flag is undetectable during a visual scan — the whole point of tracking it is grid-level awareness | |

**Verdict:** Rejected. Ownership information has no value in the grid if it is invisible.

---

### Option B — card outline or border ❌

Add a colored `border` or `outline` to `.is-owned` cards.

| | |
|-|-|
| ❌ Conflicts visually with the `.is-drop-target` outline from the cover drag-drop plan | |
| ❌ A full-card border is visually heavy for a binary state most items share | |

**Verdict:** Rejected.

---

### Option C — corner pip on the cover area ⭐ (recommended)

Add a small circular pip (`::after` pseudo-element) in the top-right corner of
`.media-tracker-card-cover` when the card carries `.is-owned`. The pip uses
`var(--color-green)` so it reads as a positive/possession state.

| | |
|-|-|
| ✅ Visually lightweight — a 10px dot does not compete with the cover image | |
| ✅ Positioned on the cover, not the card border — no conflict with drag-drop outline | |
| ✅ `var(--color-green)` is theme-aware; respects dark/light/high-contrast modes | |
| ✅ On cards without a cover image (placeholder), the pip sits in the placeholder area | |
| ⚠️ Very small at maximum zoom-out — but at that zoom level the dot is still visible as a color point | |

**Verdict:** Recommended.

---

### Option D — text badge ❌

Render a `<span class="media-tracker-card-owned-badge">Owned</span>` element inside the
card footer area.

| | |
|-|-|
| ❌ Takes vertical space in the already compact card footer | |
| ❌ Text badge competes with `actionLabel` ("Read", "Watched", etc.) | |

**Verdict:** Rejected.

---

## 5. Implementation

### 5.1 Note template — `src/actions.ts`

`createNextNote` adds `own: false` to the initial frontmatter:

```typescript
// Before
return app.vault.create(path, "---\ndone: false\n---\n");

// After
return app.vault.create(path, "---\ndone: false\nown: false\n---\n");
```

> ninja: property order matters for readability in the raw note. `done` stays first
> because it is the primary tracking field; `own` follows. `subtitle` is intentionally
> absent — it should only appear when the user explicitly sets it (see §2).

---

### 5.2 Type — `src/types.ts`

Extend `ItemNode` with the two new fields:

```typescript
export interface ItemNode {
    kind: "item";
    name: string;
    path: string;
    done: boolean;
    own: boolean;
    subtitle: string | null;   // null = not set; fall back to parseTitleParts heuristic
}
```

---

### 5.3 Frontmatter readers — `src/library.ts`

Add two file-private helpers alongside `readDone`:

```typescript
export function readOwn(app: App, file: TFile): boolean {
    const own = readFrontmatterField(app, file, "own");
    return own === true || own === "true";
}

export function readSubtitle(app: App, file: TFile): string | null {
    const subtitle = readFrontmatterField(app, file, "subtitle");
    if (typeof subtitle !== "string") return null;
    const trimmed = subtitle.trim();
    return trimmed === "" ? null : trimmed;
}
```

> ninja: `readOwn` mirrors `readDone` exactly — truthy-check on `true` and `"true"` so
> YAML `true` (boolean) and the string `"true"` (from any YAML serialiser that quotes
> booleans) both work. `readSubtitle` normalises whitespace and treats blank strings as
> absent, consistent with `readCollectionTitle`'s empty-string guard.

---

### 5.4 `listChildren` — `src/library.ts`

Include `own` and `subtitle` when constructing `ItemNode`:

```typescript
nodes.push({
    kind: "item",
    name: markdownStem(child),
    path: child.path,
    done: readDone(app, child),
    own: readOwn(app, child),
    subtitle: readSubtitle(app, child),
} satisfies ItemNode);
```

---

### 5.5 Card opts — `src/ui/cards.ts`

Extend the `opts` parameter of `createItemCard`:

```typescript
opts: {
    name: string;
    path: string;
    coverSrc: string | null;
    done: boolean;
    own: boolean;
    subtitle: string | null;
    actionLabel: string;
    onOpen: () => void;
    onToggle: (card: HTMLElement) => void;
    showAction?: boolean;
}
```

Apply `is-owned` class:

```typescript
const card = parent.createDiv({ cls: "media-tracker-card media-tracker-card-item" });
card.dataset.path = opts.path;
card.classList.toggle("is-owned", opts.own);    // add this line
card.addEventListener("click", opts.onOpen);
```

Update title rendering to prefer explicit `subtitle` over the regex fallback:

```typescript
const titleEl = card.createDiv({ cls: "media-tracker-card-title", attr: { title: opts.name } });

// Explicit subtitle takes priority; regex fallback used when subtitle is absent.
// ninja: `opts.subtitle` is null when the frontmatter field is absent or blank.
//        `parseTitleParts` is the existing digit-anchored heuristic — unchanged.
const secondary = opts.subtitle ?? parseTitleParts(opts.name)?.secondary ?? null;
const primary   = opts.subtitle ? opts.name : (parseTitleParts(opts.name)?.primary ?? null);

if (secondary !== null && primary !== null) {
    titleEl.createSpan({ cls: "media-tracker-card-title-primary", text: primary });
    titleEl.createSpan({ cls: "media-tracker-card-title-secondary", text: ` \u2013 ${secondary}` });
} else {
    titleEl.setText(opts.name);
}
```

> ninja: when `subtitle` is set, `primary` is `opts.name` (the full filename, unchanged).
> The user-supplied `subtitle` _replaces_ the secondary span text; the primary span shows
> the full title rather than only the pre-dash portion. This is correct: if the user chose
> to set `subtitle` explicitly, they are overriding the heuristic entirely and the full
> filename is the primary label they want visible.

---

### 5.6 `renderCards` call site — `src/ui/grid-view.ts`

Pass the two new opts:

```typescript
createItemCard(parent, {
    name: node.name,
    path: node.path,
    coverSrc: resolveItemCover(this.app, node.path),
    done: node.done,
    own: node.own,
    subtitle: node.subtitle,
    actionLabel,
    showAction,
    onOpen: () => void this.openItemNote(node.path),
    onToggle: (card) => void this.onToggleDone(node, card, actionLabel),
});
```

---

### 5.7 CSS — `styles.css`

```css
/* Ownership pip — top-right corner of the cover area */
.media-tracker-card-item.is-owned .media-tracker-card-cover::after {
    content: '';
    position: absolute;
    top: 6px;
    right: 6px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background-color: var(--color-green);
    box-shadow: 0 0 0 2px var(--background-primary);
    pointer-events: none;
    z-index: 1;
}
```

> ninja: `.media-tracker-card-cover` already carries `position: relative` (added for the
> ambient blur layer in the `release/ambient-cover-blur` release). The `::after`
> pseudo-element inherits that stacking context — no new `position` rule needed on the
> parent.
>
> `box-shadow: 0 0 0 2px var(--background-primary)` creates a thin halo that separates
> the pip from the cover image on all backgrounds. Using `var(--background-primary)`
> rather than a hardcoded color makes it theme-aware.
>
> `z-index: 1` places the pip above the blur layer (`z-index` default) but below any
> drag-drop overlay (`z-index: 2` from `item-cover-drag-drop.md` plan). Stack order
> is preserved without modification.

---

## 6. Files That Change

| File | Change | Net lines |
|------|--------|-----------|
| `src/actions.ts` | Add `own: false` to note creation template string | +1 |
| `src/types.ts` | Add `own: boolean` and `subtitle: string \| null` to `ItemNode` | +2 |
| `src/library.ts` | Add `readOwn` and `readSubtitle` exports; add `own` and `subtitle` to `listChildren` node construction | +14 |
| `src/ui/cards.ts` | Add `own` and `subtitle` to `createItemCard` opts; add `is-owned` class toggle; replace title rendering block with subtitle-priority logic | +12, −5 |
| `src/ui/grid-view.ts` | Pass `own` and `subtitle` in `createItemCard` call | +2 |
| `styles.css` | Add `.is-owned .media-tracker-card-cover::after` pip rule | +12 |

**No changes to:** `src/naming.ts`, `src/cover.ts`, `src/settings.ts`, `src/main.ts`,
`src/commands.ts`, `manifest.json`, `versions.json`.

Collection cards (`createCollectionCard`) are unaffected — `own` and `subtitle` are
item-level properties.

---

## 7. What NOT to Do

- **Do not add a toolbar button or card-action button to toggle `own`.** Ownership changes
  infrequently; a second action button on every card would clutter the grid for the common
  case (items you already own). The user edits the frontmatter directly, or a future
  command/context-menu action handles bulk toggling. YAGNI.
- **Do not pre-populate `subtitle: ""` in the note template.** An empty string would be
  present in frontmatter and would override the regex fallback with a blank secondary
  span on every new note. Only write `subtitle` when there is content to write.
- **Do not rename the existing `parseTitleParts` function or remove `VARIANT_SPLIT`.**
  They are the correct fallback for notes that have no explicit `subtitle`. Removing them
  would require every variant card to be manually annotated.
- **Do not merge `own` and `done` into a compound state** (e.g., `status: "owned-done"`).
  They represent different dimensions. Dataview queries, Obsidian Search, and future
  filters treat them as independent boolean facets.
- **Do not apply the ownership pip to collection cards.** `own` is an item-level property;
  collections aggregate items and a collection-level ownership concept is undefined.
- **Do not use a hardcoded color for the pip.** `var(--color-green)` adjusts automatically
  for dark themes and high-contrast modes. A hardcoded hex would fail on most themes.
- **Do not guard `readSubtitle` against non-string YAML values with an assertion.** The
  existing `readFrontmatterField` returns `unknown`; checking `typeof subtitle !== "string"`
  already handles numbers, booleans, arrays, and objects safely. No additional guard is
  needed.
- **Do not export `readOwn` and `readSubtitle` only internally.** They must be exported so
  `grid-view.ts` can call them via `listChildren`, which already re-exports node data
  through `ItemNode`. The exports follow the same pattern as `readDone`.

---

## 8. Verification Plan

**Note creation**
1. Run "Add Next" in a series folder. Open the created note. Confirm frontmatter contains
   exactly `done: false` and `own: false` in that order, and no `subtitle` key.
2. Existing notes (pre-plan) that have only `done` in frontmatter continue to render
   correctly — `own` defaults to `false` (pip absent), `subtitle` defaults to `null`
   (regex fallback active).

**`subtitle` — explicit override**
3. Set `subtitle: "Director's Cut"` on an item note whose filename does not contain ` - `.
   Confirm the card shows the full filename as primary and "– Director's Cut" as muted
   secondary.
4. Set `subtitle: "Director's Cut"` on a variant item ("Ultimate X-Men 13 – Iban Coello
   Variant"). Confirm the card shows the full filename as primary and "– Director's Cut"
   as secondary — the regex heuristic is suppressed.
5. Set `subtitle: ""` (blank) on a note. Confirm it is treated as absent — the regex
   fallback runs as if `subtitle` were not present.
6. Remove `subtitle` entirely from a note's frontmatter. Confirm the card falls back to
   `parseTitleParts` (or single text node for non-variant names) without a re-render glitch.

**`subtitle` — regex fallback unaffected**
7. A note with no `subtitle` key and a variant filename ("Ultimate X-Men 13 - Iban Coello
   Variant") renders primary + muted secondary exactly as before this plan.
8. A note with no `subtitle` key and a non-variant filename renders as a single text node,
   no secondary span.

**`own` — visual indicator**
9. Set `own: true` on an item note. Confirm the card shows the green pip in the top-right
   corner of the cover area. On a card with a cover image, the pip is visible above the
   image with a thin halo. On a placeholder card, the pip is visible on the placeholder.
10. `own: false` (default) — confirm no pip is rendered, no CSS artifact visible.
11. `own: true` on a card that also has `is-drop-target` active (drag image over it) —
    confirm the drag-drop overlay (`z-index: 2`) covers the pip without a z-index conflict.
12. `is-done` + `own: true` — pip is visible on a completed (greened-out) card. No CSS
    rule on `.is-done` affects `::after` on the cover sub-element.
13. Dark theme — pip uses `var(--color-green)`, halo uses `var(--background-primary)`.
    Both are theme-aware; verify against at least one dark theme.

**`onToggleDone` hot-path**
14. Clicking the action button (Read / Watched) on an `own: true` card toggles `done`
    without clearing the pip — the `is-owned` class is on the card element and is not
    touched by `applyItemDoneState`.

**Mobile**
15. On Capacitor mobile, `own: true` displays the pip. No interaction is needed — the
    ownership state is read-only in the grid.

---

*Generated: 2026-10-10 — pegasus-media-tracker / dev*
