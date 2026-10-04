# Plan: Per-collection custom font for card titles

**Recommendation:** Add a `font:` key to each collection's Cover.md frontmatter (mirrors `action:` / `title:` exactly). At grid render time, collect all unique font names referenced across the visible collections, inject one Google Fonts `<link>` per font into `document.head` (idempotent, checked by a `data-font` attribute), then pass the font name down to `createCollectionCard` as an optional `font?: string` argument. The card function sets a CSS custom property `--media-tracker-collection-font` on the `.media-tracker-card-collection` element; a scoped CSS rule applies it only to that card's `.media-tracker-card-title`. No global settings key needed. No font bundled. Offline behavior is graceful: the browser caches the Google Fonts stylesheet after the first successful load; on a fresh offline session the card title falls back silently to the Obsidian UI font.

---

## 1 · YAGNI check

Does this need to be built?

Yes — but only if Lucas actively maintains collections with visually distinct identities and finds the uniform font visually undifferentiated. The cost is low: one small new file (`src/fonts.ts`), one helper (`readCollectionFont`), a minor type extension, a handful of CSS lines, and one `<link>` injection per used font. The risk surface is equally small: CSS custom property on a scoped element, no global style mutation, no new settings.

If the vault has only one or two collections the feature is useless but still harmless. Build it; it costs almost nothing to ship and nothing to ignore.

**A settings-level global default font is explicitly YAGNI.** If every collection used the same font the user would set it in a Obsidian CSS snippet in 30 seconds. A `defaultFont` field in `MediaTrackerSettings` adds settings UI, a migration path, and a fallback chain for zero gain. Do not add it.

---

## 2 · Font loading strategy

Four approaches, ordered from worst to best for this use case:

| Strategy | How it works | Bundle size | Offline | Security | Verdict |
|----------|-------------|-------------|---------|----------|---------|
| **(a) Static `@import` in styles.css** | One or more `@import url("https://fonts.googleapis.com/…")` at the top of `styles.css` at build time | Zero | Fails entirely until cached; no way to skip unused fonts | None — but all fonts load on every vault regardless of whether any collection uses them | ❌ Loads fonts unconditionally; forces every user to pay the network round-trip even with zero `font:` keys |
| **(b) Dynamic `<link>` injection per used font** | At render time, read all unique `font:` values from visible collections; inject `<link rel="stylesheet" href="…">` per font into `document.head` if not already present | Zero | First load requires network; subsequent loads hit browser cache | Font names come from user-controlled frontmatter but are used only in a `<link>` href, never in a `<style>` block | ✅ Recommended — pay only for fonts actually used |
| **(c) Bundled font files** | TTF/WOFF2 committed to the repo, imported into the plugin bundle | +1–3 MB per font | Works fully offline | None | ❌ Grotesque bundle bloat for a cosmetic feature; plugin binary grows for every user |
| **(d) System font stacks only** | No Google Fonts; user types a CSS font-family stack (e.g., `Georgia, serif`) | Zero | Always works | Font name goes into a CSS property — same injection concern as (b), same mitigation | ⚠️ No exotic display fonts; acceptable fallback but not the primary goal |

**Recommendation: option (b)**, with option (d) as an undocumented bonus — system font names (e.g., `Georgia`) work automatically through the same code path because the CSS custom property is set regardless of whether a `<link>` was injected. `loadGoogleFont` silently no-ops for a name it doesn't need to fetch (detection: if the font resolves immediately from the browser's font cache or is a system font, the `<link>` is still injected but the request returns 200 immediately or the OS supplies the font).

### Offline and mobile behavior

- **Obsidian Desktop (Electron):** Electron uses Chromium's HTTP cache. After the first successful load of a Google Fonts stylesheet, the response is cached on disk. Subsequent offline sessions read from cache. The cache duration for Google Fonts CDN responses is typically one year (the `Cache-Control: max-age=31536000` header). In practice, a user who has opened the vault once with internet access will have the font cached indefinitely.
- **Obsidian Mobile (iOS / Android):** Same Chromium cache behavior on Android. iOS (WKWebView) also caches aggressively. Neither platform requires special handling.
- **Completely offline first session:** The `<link>` request fails silently. The browser never loads the `@font-face` rules. The CSS custom property `--media-tracker-collection-font` is still set on the element, but no matching font face is available, so the browser falls back to the next `font-family` in the cascade. Because the rule is `font-family: var(--media-tracker-collection-font)` with no explicit fallback stack, the browser walks up to the nearest inherited font — in Obsidian's case, the `--font-interface` stack, which is exactly the desired fallback. No error is thrown; no card looks broken; the title simply renders in the normal UI font.

**ninja:** Do not attempt to detect offline state and suppress the `<link>` injection. The browser handles this silently and the CSS custom property gives a graceful degradation path. Adding a navigator.onLine check would only add complexity without changing the user experience.

---

## 3 · Where the setting lives

`font:` key in Cover.md frontmatter. No changes to `MediaTrackerSettings`.

```yaml
---
title: "Saga"
action: Read
font: "Playfair Display"
---
```

This mirrors the `action:` / `title:` pattern exactly:

| Key | Reads from | Helper | Fallback |
|-----|-----------|--------|---------|
| `title:` | Cover.md `title` field | `readCollectionTitle(app, folder)` | `folder.name` |
| `action:` | Cover.md `action` field | `readActionLabel(app, folder, fallback)` | settings `actionLabel` |
| `font:` | Cover.md `font` field | `readCollectionFont(app, folder)` | `null` (no font applied) |

`readCollectionFont` returns `string | null`. `null` means "no `font:` key present or value is blank" — the card renders with whatever font the Obsidian theme provides. There is no fallback chain through settings because a global default font is YAGNI (§1).

The key name is `font:` not `titleFont:` or `cardFont:`. It is short, self-documenting in frontmatter, and unambiguous in this context because no other Obsidian frontmatter convention uses `font:` for this purpose. If a future Obsidian core feature ever colonises `font:`, the key can be namespaced to `pegasus-font:` — that migration would touch Cover.md files, not source code, and is easy to script.

---

## 4 · Curated font palette

The feature accepts **any** Google Fonts family name as a string — it is not validated against an allowlist. The README should document a short curated list of fonts that work well at small card sizes (`--font-ui-small`, roughly 12–13 px in most themes, displayed in a 2-line clamp). The list below is a starting point; Lucas can update it.

| Font name (exactly as typed in `font:`) | Category | Why it works at small sizes |
|-----------------------------------------|----------|-----------------------------|
| `Playfair Display` | Serif / Display | High contrast, elegant; legible at 12 px for short titles |
| `Bebas Neue` | Display / Condensed | All-caps, condensed; punchy for action/comics titles |
| `Cinzel` | Serif / Decorative | Roman inscriptional feel; good for mythology/fantasy |
| `Special Elite` | Slab Serif / Typewriter | Worn typewriter effect; pairs well with horror/noir |
| `IM Fell English` | Serif / Old Style | Irregular, manuscript quality; good for literary fiction |
| `Merriweather` | Serif / Text | Designed for screen readability; safe fallback for any genre |
| `Space Mono` | Monospace | Technical/sci-fi feel; readable at small sizes |
| `Permanent Marker` | Handwritten / Display | Bold marker stroke; works for graphic novels |
| `Oswald` | Sans Serif / Condensed | Narrow, strong; good for collections with long titles |
| `Abril Fatface` | Display / Slab | Heavy-weight headline style; striking for short titles only |

**ninja:** Fonts with multiple words must be quoted in YAML only if YAML requires it (generally not required but conventional). `font: Playfair Display` and `font: "Playfair Display"` are both valid YAML strings and both work. The `readCollectionFont` helper does not strip quotes — the YAML parser (Obsidian's frontmatter cache) returns the unquoted string value.

**What to avoid at card-title sizes:**
- Highly decorative scripts (e.g., `Dancing Script`, `Pacifico`) — illegible at 12 px in a 2-line clamp
- Ultra-light weights without a `wght` axis specified — they vanish against the card background
- Any font that requires a `font-weight` or `font-style` override to look good — the feature does not expose weight/style controls (YAGNI)

---

## 5 · CSS implementation

### Custom property on the collection card element

The `.media-tracker-card-collection` element receives a CSS custom property via `style.setProperty`. A scoped CSS rule applies it to the title child only.

**`styles.css` additions:**

```css
/* Per-collection custom font — set via JS when font: is present in Cover.md */
.media-tracker-card-collection[style*="--media-tracker-collection-font"] .media-tracker-card-title {
	font-family: var(--media-tracker-collection-font);
}
```

The `[style*="--media-tracker-collection-font"]` attribute selector is the idiomatic way to detect that the custom property is actually set inline (as opposed to inheriting a value that was never set). Without this guard, any element that inherits `--media-tracker-collection-font` from a parent would get the font applied, which is not desired.

**Why not a `data-font` attribute with a separate CSS rule?**

The original approach of setting `card.dataset.font = fontName` and writing `.media-tracker-card-collection[data-font] .media-tracker-card-title { font-family: attr(data-font) }` is ruled out because `attr()` in `font-family` is not supported in any current browser outside the experimental CSS Values Level 5 spec. The CSS custom property set inline is the correct, widely-supported mechanism.

**Why not a `<style>` block injected per card?**

Injecting `<style>.media-tracker-card-title { font-family: "Playfair Display"; }` globally or per-card would: (a) affect every card that matches the selector, not just the one collection; (b) require a strategy for removing/updating styles on re-render; (c) open a CSS injection vector if the font name is not sanitized. The custom property approach is scoped, stateless across renders, and safe by construction — the value goes into a CSS variable, not into a `<style>` parser.

**The font name in `style.setProperty` is safe even without sanitization** because it is set as a CSS custom property value, not as part of a CSS rule string. A malicious value like `"Playfair Display; color: red"` would only affect the `font-family` declaration that reads it — CSS parsers treat invalid `font-family` values as `font-family: initial`, producing no visual effect and no XSS vector. That said, `readCollectionFont` trims whitespace, which is sufficient defensive normalization.

---

## 6 · Font loader — `src/fonts.ts`

New file. Small and self-contained.

```typescript
// src/fonts.ts

const GOOGLE_FONTS_BASE = "https://fonts.googleapis.com/css2";

/**
 * Injects a Google Fonts stylesheet link for the given font family name if one
 * is not already present in document.head. Idempotent: safe to call on every render.
 *
 * ninja: Uses a data-font attribute on the <link> element for deduplication so
 * we don't rely on URL equality (which would break if query param order differs).
 */
export function loadGoogleFont(fontName: string): void {
	const normalized = fontName.trim();
	if (normalized === "") return;
	const selector = `link[data-font="${CSS.escape(normalized)}"]`;
	if (document.head.querySelector(selector)) return; // already loaded
	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.dataset.font = normalized;
	// Google Fonts family names use spaces; replace with + for the URL.
	const family = normalized.replace(/ /g, "+");
	link.href = `${GOOGLE_FONTS_BASE}?family=${family}&display=swap`;
	document.head.appendChild(link);
}
```

**Notes on implementation:**
- `CSS.escape()` is available in all modern browsers and Electron. It ensures the `querySelector` call is safe even if the font name contains characters that are special in CSS selectors (e.g., parentheses, dots). The `data-font` attribute value stored is the raw normalized name; `CSS.escape` is only used for the selector string.
- `display=swap` tells the browser to use the fallback font immediately while the custom font loads — no flash of invisible text (FOIT) at the card title level.
- The function does not return a Promise. It fires the network request and returns immediately; the font loads asynchronously and the browser repaints cards once the font face is available. This is the correct behavior for a cosmetic feature — there is no reason to await font loading before rendering the grid.
- The function is pure side-effecting (no class, no state). It can be called multiple times with the same argument with no cost beyond one `querySelector`.

---

## 7 · Data flow end to end

### 7.1 · New helper: `readCollectionFont`

Add to `src/library.ts`, immediately after `readActionLabel` (same shape, same file):

```typescript
// src/library.ts

export function readCollectionFont(app: App, folder: TFolder): string | null {
	const note = findFolderNote(folder);
	if (!note) return null;
	const font = readFrontmatterField(app, note, "font");
	if (typeof font !== "string") return null;
	const trimmed = font.trim();
	return trimmed === "" ? null : trimmed;
}
```

`readFrontmatterField` already exists and handles the `metadataCache.getFileCache` lookup. No new dependencies.

### 7.2 · Extend `CollectionNode`

Add `font` field to `CollectionNode` in `src/types.ts`:

```typescript
// src/types.ts

export interface CollectionNode {
	kind: "collection";
	/** Card / breadcrumb label (`title` on Cover.md, else folder name). */
	name: string;
	path: string;
	/** Optional Google Font family name from Cover.md `font:` key. null = use default UI font. */
	font: string | null;
}
```

**ninja:** `font` is `string | null`, not `string | undefined`, to be consistent with the `coverSrc` field on the card opts (which is also `string | null`). Explicit null means "no font configured"; undefined would mean "field not present in the type" which is a different semantic.

### 7.3 · `listChildren` populates `font`

In `src/library.ts`, `listChildren` already calls `readCollectionTitle`. Add `readCollectionFont` alongside it:

```typescript
// src/library.ts  (listChildren, collection branch)

if (child instanceof TFolder) {
	if (isHiddenCollectionFolder(child.name)) continue;
	nodes.push({
		kind: "collection",
		name: readCollectionTitle(app, child),
		path: child.path,
		font: readCollectionFont(app, child),   // new
	});
	continue;
}
```

### 7.4 · Grid render injects fonts then passes to card

In `src/ui/grid-view.ts`, the `render()` method calls `listChildren` and then `renderCards`. Font loading happens between these two steps:

```typescript
// src/ui/grid-view.ts  (render method, after nodes are built)

import { loadGoogleFont } from "../fonts";

// …inside render(), after:  const nodes = listChildren(this.app, folder);

for (const node of nodes) {
	if (node.kind === "collection" && node.font !== null) {
		loadGoogleFont(node.font);
	}
}
```

`loadGoogleFont` is idempotent and synchronous (the network request is fire-and-forget). Calling it before `renderCards` means by the time the grid is painted the browser has already started fetching the font stylesheet. Because `display=swap`, cards render immediately in the fallback font and repaint when the custom font arrives — typically within one network round-trip.

### 7.5 · `createCollectionCard` accepts and applies font

Extend `opts` in `src/ui/cards.ts`:

```typescript
// src/ui/cards.ts

export function createCollectionCard(
	parent: HTMLElement,
	opts: {
		name: string;
		coverSrc: string | null;
		onOpen: () => void;
		font?: string | null;   // new — undefined and null both mean "no font"
	},
): HTMLElement {
	const card = parent.createDiv({ cls: "media-tracker-card media-tracker-card-collection" });
	card.addEventListener("click", opts.onOpen);
	renderCover(card, opts.name, opts.coverSrc);
	card.createDiv({ cls: "media-tracker-card-title", text: opts.name, attr: { title: opts.name } });
	if (opts.font) {
		card.style.setProperty("--media-tracker-collection-font", opts.font);
	}
	return card;
}
```

**ninja:** `opts.font` is checked for truthiness (not `!== null && !== undefined`) because an empty string should also be a no-op. `style.setProperty` does not need quotes around the value — the value is passed as a CSS string, not as CSS source text. `font-family: Playfair Display` (without quotes) is valid CSS and the browser parses it correctly.

In `src/ui/grid-view.ts`, pass `font` through to `createCollectionCard`:

```typescript
// src/ui/grid-view.ts  (renderCards, collection branch)

if (node.kind === "collection") {
	createCollectionCard(parent, {
		name: node.name,
		coverSrc: resolveCollectionCover(this.app, node.path),
		onOpen: () => this.openFolder(node.path),
		font: node.font,   // new
	});
	continue;
}
```

---

## 8 · What NOT to do

- **Do not apply `font:` to item cards.** `createItemCard` does not receive a font argument and `.media-tracker-card-item .media-tracker-card-title` has no custom font rule. Item cards are individual notes; their visual identity belongs to the collection they live under, not the note itself.
- **Do not add a `defaultFont` setting to `MediaTrackerSettings`.** If a user wants every card in the same font they can write two lines of Obsidian CSS. A global default forces a settings dropdown or text field, a fallback chain in `readCollectionFont`, and a migration question for old vaults. YAGNI.
- **Do not bundle font files.** Even one WOFF2 for a single font weight adds 50–150 KB to the plugin binary, which is loaded by every user on every platform regardless of whether they have any `font:` keys in their vault. For a feature that is off by default and per-collection, this is an unacceptable tradeoff.
- **Do not inject the font name into a `<style>` block.** `document.head.appendChild` of a `<style>` element whose text content includes `font-family: ${fontName}` is a CSS injection vector. Even though Cover.md is a local user file (not external input), the correct pattern is the CSS custom property — set as a property value, not as CSS source text. Use `style.setProperty`.
- **Do not add a `font-weight` or `font-style` control.** The feature is font family only. A weight/style dropdown is YAGNI and dramatically increases the combinatorial surface (each font has different available weights). If a user wants bold Playfair Display they can add a `font-weight: 700` override to a CSS snippet.
- **Do not guard `loadGoogleFont` with `navigator.onLine`.** The browser handles failed network requests silently and falls back to cached stylesheets on subsequent loads. The `navigator.onLine` check is unreliable (it detects local connectivity, not CDN reachability) and adds a code branch that is never tested.
- **Do not validate the font name against a known-good list in code.** Validation in `readCollectionFont` would need to be kept in sync with the Google Fonts catalog (thousands of families, updated frequently). An invalid name results in a 404 `<link>` that fails silently — the fallback font is used. That is the correct behavior. Documentation (README curated list) is the right tool for discoverability; runtime validation is not.

---

## 9 · Files that change

| File | Change | Net lines |
|------|--------|-----------|
| `src/library.ts` | Add `readCollectionFont(app, folder): string \| null` helper; populate `font` field in `listChildren` collection branch | +10 |
| `src/types.ts` | Add `font: string \| null` to `CollectionNode` interface | +2 |
| `src/ui/cards.ts` | Add optional `font?: string \| null` to `createCollectionCard` opts; call `card.style.setProperty` when truthy | +4 |
| `src/ui/grid-view.ts` | Import `loadGoogleFont`; call it for each collection node before `renderCards`; pass `node.font` to `createCollectionCard` | +7 |
| `src/fonts.ts` | **New file** — `loadGoogleFont(fontName: string): void` | +20 |
| `styles.css` | Add scoped custom-property rule for `.media-tracker-card-collection[style*=…] .media-tracker-card-title` | +5 |
| `README.md` | Document `font:` key in frontmatter table; add curated font suggestions | +15–20 |

**No changes to:** `src/settings.ts`, `src/cover.ts`, `src/actions.ts`, `src/naming.ts`, `src/main.ts`, `manifest.json`.

---

## 10 · Validation checklist

Manual steps in order. All should be verifiable without a build step beyond `npm run dev`.

1. **Basic happy path:** Add `font: "Playfair Display"` to the Cover.md of one collection. Open the plugin view. Confirm the collection card title renders in Playfair Display. Open DevTools → Elements, inspect the `.media-tracker-card-collection` element. Confirm `style` attribute contains `--media-tracker-collection-font: Playfair Display`. Confirm `document.head` contains a `<link data-font="Playfair Display" ...>` element.

2. **Multiple fonts:** Add `font: "Bebas Neue"` to a second collection. Reload the view. Confirm both cards render in their respective fonts. Confirm `document.head` has two `<link data-font="…">` elements.

3. **Idempotency of `loadGoogleFont`:** Trigger the render multiple times (e.g., modify a file to trigger `scheduleRender`). Confirm that `document.head` does not accumulate duplicate `<link>` elements for the same font — there should be exactly one per unique font name.

4. **No font configured:** Verify that a collection with no `font:` key in Cover.md renders its title in the Obsidian UI font (same as before this feature). Confirm that the `.media-tracker-card-collection` element for that collection does not have a `style` attribute containing `--media-tracker-collection-font`.

5. **Item cards unaffected:** Navigate into a collection that has `font:` set. Confirm that the item card titles inside the collection render in the Obsidian UI font, not in the collection font. The `--media-tracker-collection-font` CSS rule selector scopes to `.media-tracker-card-collection .media-tracker-card-title` — item cards use `.media-tracker-card-item` and are not matched.

6. **Blank `font:` value:** Set `font: ""` or `font: "   "` (whitespace only) in Cover.md. Confirm `readCollectionFont` returns `null` and the card renders with no custom font.

7. **Invalid font name (404):** Set `font: "NotARealFontXYZ"`. Confirm the plugin does not throw or surface an error. Confirm the `<link>` is injected (network request will 404), and the card title falls back gracefully to the UI font.

8. **System font name:** Set `font: "Georgia"`. Confirm the card title renders in Georgia (a system serif font on all desktop platforms). Confirm a `<link>` is injected pointing at the Google Fonts CDN for Georgia (it will likely 404 since Georgia is not on Google Fonts, which is fine — the OS supplies the font, and the `<link>` failure is silent).

9. **Offline first session (simulate):** In DevTools → Network, set throttling to "Offline". Reload Obsidian. Navigate to the collection with `font: "Playfair Display"`. Confirm the card title renders in the fallback font (not Playfair Display). Confirm no error is visible in the UI or console beyond a failed network request. Re-enable network and reload — Playfair Display should appear once the stylesheet loads.

10. **Re-render preserves font:** Click "Change Title" on a collection with a font set. Save the new title. Confirm the card re-renders with the custom font applied (the font was not lost during the re-render cycle).

---

*Authored by Lucas — pegasus-media-tracker / dev*

*Generated: 2026-10-04 — pegasus-media-tracker / dev*
