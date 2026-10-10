# Plan: Item card drag-drop cover

**Recommendation:** Build it. Drop an image onto an item card and the cover is set silently — no note opens, no modal appears, no extra step. The existing vault listeners in `grid-view.ts` re-render the grid automatically once the frontmatter write lands, so the card flips to the new cover with zero additional wiring. The feature is three small edits: a handler block in `grid-view.ts`, two action functions in `actions.ts`, and a CSS feedback layer in `styles.css`. No new files, no new abstractions.

---

## 1 · YAGNI

Yes, build it. The current path to set a cover on a single item (`click card → note opens → drag image into note`) has three steps and requires the user to leave the grid entirely. Drop-onto-card collapses this to one gesture. Bulk cover-setting for a brand-new collection — where every card needs an image and none have one yet — is a real workflow where this multiplies the payoff: the user drags image after image without ever opening a note.

The desktop-only constraint does not reduce the value: Obsidian on desktop is where cover images are managed (mobile has no file picker or drag gesture anyway, so events simply never fire — no guard needed).

---

## 2 · Drag-source taxonomy

Three source types a drop handler might encounter, plus one non-event:

| Source | How to detect | What the handler does |
|--------|---------------|-----------------------|
| **OS file drop** (Finder / Explorer) | `event.dataTransfer.files.length > 0` | Read `File.arrayBuffer()`, import into vault, set `cover:` frontmatter |
| **Obsidian vault file drag** | `files.length === 0`, `dataTransfer.getData('text/plain')` returns a vault-relative path | Validate `isImageFile`, set `cover:` frontmatter directly — no copy |
| **Non-image OS file** | `files.length > 0`, `file.type` does not start with `image/` | Show `new Notice(…)`, abort |
| **Mobile** | Drag events never fire on Capacitor mobile | Nothing — no guard, no crash |

**ninja:** Electron populates `dataTransfer.items[0].type` (the MIME type) during `dragover` before the drop, so the image check can gate `dropEffect` at hover time — the card only lights up for valid sources. Vault-path drags set `text/plain` but `files` is empty; `type` is `""` in that case, so validate at drop time instead.

---

## 3 · Event delegation on the grid

Attach **one set** of listeners to the `.media-tracker-grid` div, not per-card. Use `event.target.closest('.media-tracker-card-item')` to resolve the target card.

```typescript
// in registerItemDropListeners(grid: HTMLElement)
grid.addEventListener('dragenter',  e => this.onGridDragEnter(e),  false);
grid.addEventListener('dragover',   e => this.onGridDragOver(e),   false);
grid.addEventListener('dragleave',  e => this.onGridDragLeave(e),  false);
grid.addEventListener('drop',       e => this.onGridDrop(e),       false);
```

Reasons delegation wins here:

| Concern | Per-card listeners | Grid delegation |
|---------|-------------------|-----------------|
| Listener count | One set per card, recreated every render | One set total, attached once |
| Child-element drags (cover img, title div) | Each child must stopPropagation or re-resolve | `closest()` handles transparently |
| Re-render safety | Must detach + reattach after every `scheduleRender` | Grid div is stable; listeners survive |
| Cleanup | Must track every card's listeners for `register()` | Single `this.register()` call |

**`dragleave` flicker fix:** when the pointer moves from a card to one of its children, both `dragleave` (card) and `dragenter` (child) fire. Guard:

```typescript
private onGridDragLeave(e: DragEvent): void {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.media-tracker-card-item');
    if (card && card.contains(e.relatedTarget as Node)) return; // moved to child — ignore
    card?.classList.remove('is-drop-target');

    // If pointer left the grid entirely, clear global state
    if (!this.gridEl.contains(e.relatedTarget as Node)) {
        this.gridEl.classList.remove('has-drag-active');
    }
}
```

---

## 4 · `dragover` gating

Accept or reject during `dragover` by inspecting `dataTransfer.types` and, for OS drops, the MIME type of the first item. Only call `preventDefault()` when accepting — this is what allows the browser to fire `drop`.

```typescript
private onGridDragOver(e: DragEvent): void {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.media-tracker-card-item');
    if (!card) return; // dragging over grid background — ignore

    const dt = e.dataTransfer!;
    const hasFiles   = dt.types.includes('Files');
    const hasVault   = dt.types.includes('text/plain');
    const firstType  = dt.items[0]?.type ?? '';          // populated by Electron during dragover
    const isImage    = hasFiles
        ? (firstType === '' || firstType.startsWith('image/')) // '' means Electron couldn't read yet
        : hasVault;

    if (!isImage) {
        dt.dropEffect = 'none';
        return;
    }

    e.preventDefault();
    dt.dropEffect = 'copy';

    this.gridEl.classList.add('has-drag-active');
    // Move is-drop-target to current card
    this.gridEl.querySelectorAll('.is-drop-target').forEach(el => {
        if (el !== card) el.classList.remove('is-drop-target');
    });
    card.classList.add('is-drop-target');
}
```

**ninja:** `dataTransfer.items[0].type` is `""` (empty string) when Electron hasn't resolved the MIME yet (this can happen on the very first `dragover` event). Treat `""` as tentatively accepted — validate the real MIME at drop time. This avoids falsely rejecting valid image drops.

---

## 5 · Import strategy for OS file drops

**Destination folder:** the item note's own folder — not `assets/covers/`. `resolveItemCover` already has `firstImageInFolder` as its lowest-priority fallback, but more importantly, co-location is natural: the image lives beside the note it describes.

**ninja:** `assets/covers/` is for collection covers. `findCoverFileForCollection` slug-matches filenames there. Dropping item covers into that folder would pollute the collection cover namespace and create confusing false positives.

**Naming strategy (priority order):**

| Priority | Name tried | Example |
|----------|-----------|---------|
| 1 | `{itemBasename}{ext}` | `The Uncanny X-Men 3.jpg` |
| 2 | Original filename from OS | `cover.jpg` |
| 3 | Original filename + unique suffix | `cover 1.jpg`, `cover 2.jpg` |

```typescript
// src/actions.ts

/** Like availableCoverPath but for an arbitrary folder. */
function availablePathInFolder(
    vault: Vault,
    folder: TFolder,
    preferred: string,
    fallback: string,
): string {
    const ext = fallback.slice(fallback.lastIndexOf('.'));
    const base = preferred.endsWith(ext) ? preferred : preferred + ext;
    const full = normalizePath(`${folder.path}/${base}`);
    if (!vault.getAbstractFileByPath(full)) return full;

    // Fall back to original filename
    const orig = normalizePath(`${folder.path}/${fallback}`);
    if (!vault.getAbstractFileByPath(orig)) return orig;

    // Unique suffix
    let n = 1;
    while (true) {
        const stem = fallback.slice(0, fallback.lastIndexOf('.'));
        const candidate = normalizePath(`${folder.path}/${stem} ${n}${ext}`);
        if (!vault.getAbstractFileByPath(candidate)) return candidate;
        n++;
    }
}

/** Import an OS File into the vault beside the item note, then set cover: frontmatter. */
export async function setItemCoverFromFile(
    app: App,
    itemPath: string,
    imageFile: File,
): Promise<void> {
    const itemFile = app.vault.getFileByPath(itemPath);
    if (!itemFile) throw new Error(`Item note not found: ${itemPath}`);

    const folder = itemFile.parent;
    if (!folder) throw new Error(`Item note has no parent folder: ${itemPath}`);

    const ext       = imageFile.name.slice(imageFile.name.lastIndexOf('.')).toLowerCase();
    const preferred = itemFile.basename + ext;   // e.g. 'The Uncanny X-Men 3.jpg'
    const destPath  = availablePathInFolder(app.vault, folder, preferred, imageFile.name);

    const buffer = await imageFile.arrayBuffer();
    await app.vault.createBinary(destPath, buffer);

    await mutateFrontmatter(app, itemFile, fm => {
        fm['cover'] = `[[${destPath}]]`;
    });
}
```

---

## 6 · Vault file drops

When `dataTransfer.files.length === 0` the drag originated inside Obsidian. Read `text/plain` for the vault-relative path. No file copy — just a frontmatter update.

```typescript
// src/actions.ts

/** Point an item's cover: frontmatter at an existing vault image file. No copy. */
export async function setItemCoverFromVaultFile(
    app: App,
    itemPath: string,
    imagePath: string,
): Promise<void> {
    const itemFile = app.vault.getFileByPath(itemPath);
    if (!itemFile) throw new Error(`Item note not found: ${itemPath}`);

    const imageFile = app.vault.getFileByPath(imagePath);
    if (!imageFile || !(imageFile instanceof TFile))
        throw new Error(`Vault file not found: ${imagePath}`);

    if (!isImageFile(imageFile))
        throw new Error(`Not an image file: ${imagePath}`);

    await mutateFrontmatter(app, itemFile, fm => {
        fm['cover'] = `[[${imagePath}]]`;
    });
}
```

**ninja:** `isImageFile` is already exported from `src/cover.ts` — import it directly. Do not duplicate the `IMAGE_EXTENSIONS` check.

---

## 7 · `registerItemDropListeners` in `grid-view.ts`

A private method called once after the grid div is created. Uses `this.register()` so Obsidian cleans up on view close.

```typescript
// src/ui/grid-view.ts  (inside the view class)

private gridEl: HTMLElement | null = null;

private registerItemDropListeners(grid: HTMLElement): void {
    const onEnter = (e: DragEvent) => this.onGridDragEnter(e);
    const onOver  = (e: DragEvent) => this.onGridDragOver(e);
    const onLeave = (e: DragEvent) => this.onGridDragLeave(e);
    const onDrop  = (e: DragEvent) => this.onGridDrop(e);

    grid.addEventListener('dragenter',  onEnter, false);
    grid.addEventListener('dragover',   onOver,  false);
    grid.addEventListener('dragleave',  onLeave, false);
    grid.addEventListener('drop',       onDrop,  false);

    this.register(() => {
        grid.removeEventListener('dragenter',  onEnter, false);
        grid.removeEventListener('dragover',   onOver,  false);
        grid.removeEventListener('dragleave',  onLeave, false);
        grid.removeEventListener('drop',       onDrop,  false);
    });
}

private onGridDragEnter(e: DragEvent): void {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.media-tracker-card-item');
    if (card) this.gridEl?.classList.add('has-drag-active');
}

// onGridDragOver — see §4

// onGridDragLeave — see §3

private async onGridDrop(e: DragEvent): Promise<void> {
    e.preventDefault();

    const card = (e.target as HTMLElement).closest<HTMLElement>('.media-tracker-card-item');

    // Always clean up visual state regardless of whether we have a card
    this.gridEl?.classList.remove('has-drag-active');
    this.gridEl?.querySelectorAll('.is-drop-target')
        .forEach(el => el.classList.remove('is-drop-target'));

    if (!card) return; // dropped on grid background

    const itemPath = card.dataset.path;
    if (!itemPath) return;

    const dt = e.dataTransfer!;

    if (dt.files.length > 0) {
        // OS file drop
        const file = dt.files[0];
        if (!file.type.startsWith('image/')) {
            new Notice('Drop an image file to set the cover.');
            return;
        }
        try {
            await setItemCoverFromFile(this.app, itemPath, file);
        } catch (err) {
            new Notice(`Could not set cover: ${(err as Error).message}`);
        }
    } else {
        // Vault drag — text/plain carries the vault-relative path
        const vaultPath = dt.getData('text/plain').trim();
        if (!vaultPath) return;
        try {
            await setItemCoverFromVaultFile(this.app, itemPath, vaultPath);
        } catch (err) {
            new Notice(`Could not set cover: ${(err as Error).message}`);
        }
    }
}
```

Call site in `renderCards()` / `render()`:

```typescript
// Inside render() after the grid div is created
this.gridEl = this.containerEl.createDiv({ cls: 'media-tracker-grid' });
this.registerItemDropListeners(this.gridEl);
// ... then populate cards
```

**ninja:** `card.dataset.path` requires `createItemCard` to write `el.dataset.path = opts.path` when creating item cards. Add one line there — no structural change.

---

## 8 · Visual feedback CSS

Three independent feedback layers, all non-layout (no size/position changes):

```css
/* ── Drop target: outline on the hovered card ───────────────────────── */
.media-tracker-card-item.is-drop-target {
    outline: 2px solid var(--color-accent);
    outline-offset: -2px; /* inset — no layout shift */
}

/* ── Dim all non-targeted item cards while a drag is active ─────────── */
.media-tracker-grid.has-drag-active .media-tracker-card-item:not(.is-drop-target) {
    opacity: 0.4;
    transition: opacity 80ms ease;
}

/* ── "Set cover" overlay on the cover area of the targeted card ──────── */
.media-tracker-card-item.is-drop-target .media-tracker-card-cover::after {
    content: 'Set cover';
    position: absolute;      /* .media-tracker-card-cover already has position:relative */
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--color-accent) 60%, transparent);
    color: #fff;
    font-size: var(--font-ui-small);
    font-weight: 600;
    pointer-events: none;
    z-index: 2;
}
```

**`has-drag-active` lifecycle:**

| Event | Action |
|-------|--------|
| `dragenter` fires on a card | Add `has-drag-active` to grid |
| `dragleave` fires, pointer left card to a **child** | `card.contains(relatedTarget)` → skip |
| `dragleave` fires, pointer left the **grid entirely** | `!grid.contains(relatedTarget)` → remove `has-drag-active` |
| `drop` fires | Remove `has-drag-active` + all `is-drop-target` |

`color-mix()` requires Chromium 111+. All current Obsidian desktop builds (based on Electron 28+) ship Chromium 120+. No fallback needed.

---

## 9 · `createItemCard` stays pure

`createItemCard` in `src/ui/cards.ts` creates DOM and returns the element. It does not attach drag listeners. The one addition needed is exposing `opts.path` on the dataset so the drop handler can resolve the item note:

```typescript
// src/ui/cards.ts — inside createItemCard, after creating the root div
el.dataset.path = opts.path; // add this line
```

Everything else — `is-drop-target`, `has-drag-active` — is managed exclusively by `grid-view.ts`. Cards are dumb DOM; the grid view is the state machine.

---

## 10 · What NOT to do

- **Do not attach drag listeners inside `createItemCard`.** The delegation pattern makes per-card listeners unnecessary and harmful (they multiply on re-render).
- **Do not call `setCoverOnNote`.** It appends a `![[image]]` embed to the note body as a side effect. A silent background cover-set must not modify note content.
- **Do not import OS images into `assets/covers/`.** That folder is for collection covers. `findCoverFileForCollection` slug-matches filenames there — dropping item covers in would cause false positive matches for collections.
- **Do not add drag-drop on collection cards.** The UX is ambiguous (does it set the collection cover or the covers of all items?). YAGNI until there is a concrete request.
- **Do not show a modal on drop.** A confirmation dialog defeats the zero-friction goal entirely.
- **Do not validate the vault-path source type during `dragover`.** Only `Files` MIME is reliably available at hover time in Electron. Check `isImageFile` at drop time.
- **Do not intercept markdown text drags from note bodies.** The `text/plain` source from Obsidian internal drags carries the vault path, not markdown text. If `text/plain` does not resolve to a valid vault file, the action throws and the `Notice` handles it gracefully.
- **Do not add a global `dragstart` listener.** This plugin is the drop *target*, not the drag *source*. A `dragstart` on the grid would be meaningless.
- **Do not manually trigger a grid re-render after the frontmatter write.** The existing vault listeners (`metadataCache.on('changed', …)` + `vault.on('create', …)` in `grid-view.ts`) call `scheduleRender()` automatically when the imported image file and the updated frontmatter land.

---

## 11 · Files that change

| File | Type of change | Est. lines |
|------|---------------|-----------|
| `src/ui/grid-view.ts` | Add `registerItemDropListeners`, `onGridDragEnter`, `onGridDragOver`, `onGridDragLeave`, `onGridDrop`; store `gridEl`; call register in `render()` | +60 |
| `src/actions.ts` | Add `setItemCoverFromFile`, `setItemCoverFromVaultFile`, `availablePathInFolder`; export the two public actions | +35 |
| `src/ui/cards.ts` | Add `el.dataset.path = opts.path` in `createItemCard` | +1 |
| `styles.css` | Add `is-drop-target`, `has-drag-active`, `::after` overlay rules | +25 |
| `README.md` | Add "Setting covers by drag and drop" section under Usage | +10 |

No new files. No new dependencies.

---

## 12 · Validation checklist

1. **OS image drop sets cover.** Drop a `.jpg` from Finder/Explorer onto an item card. `cover:` frontmatter is written; grid re-renders with the new cover image within 1–2 seconds.
2. **Grid auto-rerenders.** Confirm no manual `scheduleRender()` call is added — the existing vault listeners fire on `vault.create` (new image file) and `metadataCache.changed` (frontmatter update).
3. **Vault file drag sets cover.** Drag a `.png` from the Obsidian file explorer onto an item card. `cover:` frontmatter points to the existing vault path; no file is copied.
4. **Non-image OS file shows notice.** Drop a `.pdf` onto an item card. A `Notice` appears: "Drop an image file to set the cover." No frontmatter change.
5. **`dragover` visual feedback.** During a valid image drag, hovered card shows accent outline + "Set cover" overlay; all other item cards dim to 40% opacity.
6. **Dragleave child flicker does not occur.** Drag an image slowly over the card title div and cover image inside the card. `is-drop-target` does not flicker off/on. The `card.contains(relatedTarget)` guard suppresses false leaves.
7. **Drop on collection card is no-op.** Drop an image onto a collection card. Nothing happens — `closest('.media-tracker-card-item')` returns null for collection cards.
8. **Drop on grid background (no card) is no-op.** Drop onto the empty space between cards. No action, no error, visual state clears.
9. **Mobile has no crash.** On Capacitor mobile, drag events never fire. No errors in the console, no defensive guards needed.
10. **Existing `cover:` frontmatter is overwritten on re-drop.** Drop a second image onto a card that already has a cover. `mutateFrontmatter` overwrites the existing `cover:` value; the card shows the new cover after render.
11. **`has-drag-active` removed cleanly.** After drop: all item cards return to full opacity immediately. After dragleave-from-grid (drag out of window without dropping): same. No state leak between drag sessions.
12. **Cover persists after Obsidian restart.** Re-open Obsidian. Card shows the cover image set by the drag-drop operation. Confirm `cover:` is in frontmatter (not just a body embed).
13. **Simultaneous hover over two cards impossible.** Drag slowly from one card to an adjacent card. Only the currently-hovered card has `is-drop-target`; the previous card's class is removed in `onGridDragOver` before adding it to the new card.

---

*Generated: 2026-10-04 — pegasus-media-tracker / dev*
