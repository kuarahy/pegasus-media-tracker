# Least-Resistance Sync Names

**Recommendation: Path R — automatic sanitize on create/rename, no new setting.**

---

## In plain language

| Moment | User types / does | Disk gets | Card shows |
|--------|------------------|-----------|------------|
| Rename an item | `She-Hulk #6` | `She-Hulk 6.md` | `She-Hulk #6` |
| Add Next, all-`#` folder | (button) | `She-Hulk 7.md` | `She-Hulk #7` |
| Add Next, empty folder | (button) | `Saga 1.md` | `Saga 1` |
| Rename item, no `#` | `Saga v1` | `Saga v1.md` | `Saga v1` |
| Existing `Attack on Titan #1.md` | (plugin startup) | `Attack on Titan 1.md` | `Attack on Titan #1` |

The user names files however they want. If the name contains `#`, the plugin silently moves the `#` off the filename and onto a `title:` field in the note's frontmatter. The card reads `title:` first, stem second — exactly what collections already do. Nothing syncs broken. No setting to discover.

---

## Why Path R, not Path S or Path N

### Path N (do nothing beyond sharp-slug)
`She-Hulk #6` typed by a user as a rename — the plugin did not create that file, so sharp-slug never touched it. Sync on Android still fails. The user must know not to use `#` anywhere in a name, including renames. That is user work shifted from the plugin to every user, forever.

### Path S (numbering-scheme dropdown)
A settings dropdown tells Add Next to display `#` for items in a `#`-scheme collection. It does not intercept typed renames. A user who renames a note to `She-Hulk #6.md` manually still breaks sync. The setting solves display for files the plugin already created without `#` (i.e., it adds decoration to `Saga 1` → show as `Saga #1`). That is half the problem — display only — with settings friction attached. The numbering-scheme-vs-action-label analysis assumed the user had to opt in to `#` display. Path R inverts: the user types `#` and it persists in `title:` automatically. The `numbering:` Cover.md key is not needed. The global dropdown is not needed. The four-file plan in that analysis collapses to three files (no `settings.ts` change).

**ninja:** The question is least resistance for the user, not the author. A dropdown is less code than a rename hook. But the user must open Settings, find the dropdown, pick it, optionally open Cover.md and add a frontmatter key — and then discover that renames still break. Path R requires zero user action for any naming choice.

---

## Display: reuse the `readCollectionTitle` split

Collections: `folderSlug("Supergirl: Woman of Tomorrow")` → disk `Supergirl - Woman of Tomorrow/`, `title: "Supergirl: Woman of Tomorrow"` on Cover.md, `readCollectionTitle` returns the original.

Items (Path R): slug `She-Hulk #6` → disk `She-Hulk 6.md`, `title: "She-Hulk #6"` in item note frontmatter, `readItemTitle` returns the original.

Same split, same pattern. `readItemTitle(app, file)` mirrors `readCollectionTitle` exactly: reads `title:` from the file's frontmatter cache, falls back to `markdownStem(file)`. One new function, same shape as existing code.

`listChildren` uses `readItemTitle(app, child)` for the item `name` field.

`listItemBasenames` is **not changed**. It reads disk stems (`markdownStem`), which is what `nextNoteBasename` needs to parse real filenames. After sanitization, disk stems are `#`-free. `parseIssue("She-Hulk 6")` → prefix `"She-Hulk "`, n=6 — incrementing still works.

---

## `createNextNote` changes

`nextNoteBasename` can still return a `#`-containing name when the folder is all-`#` (e.g., folder not yet sanitized on startup). `createNextNote` strips `#` before writing to disk and writes `title:` if the raw and safe names differ:

```typescript
export async function createNextNote(app: App, folder: TFolder): Promise<TFile> {
    const rawBasename = nextNoteBasename(listItemBasenames(folder), folder.name);
    const safeBasename = rawBasename.replace(/#/g, "");
    const displayTitle = rawBasename !== safeBasename ? rawBasename : null;
    const path = joinPath(folder, `${safeBasename}.md`);
    const frontmatter = displayTitle
        ? `---\ndone: false\ntitle: ${JSON.stringify(displayTitle)}\n---\n`
        : "---\ndone: false\n---\n";
    return app.vault.create(path, frontmatter);
}
```

`nextNoteBasename` is **not changed** — its signature stays `(basenames: string[], collectionTitle: string): string`. The strip happens in the caller. After startup sanitization, all-`#` folders will be all-plain-stem folders, so `rawBasename === safeBasename` and no `title:` is written for new items anyway.

---

## Rename hook: `sanitizeItemOnRename`

New function in `actions.ts`. Called from the vault `rename` event already registered in `main.ts`.

```typescript
export async function sanitizeItemOnRename(app: App, file: TFile): Promise<void> {
    if (file.extension !== "md") return;
    const stem = markdownStem(file);           // uses file.name, not file.basename
    if (!stem.includes("#")) return;
    if (stem === COVER_NOTE_STEM) return;      // never touch Cover.md
    const parent = file.parent;
    if (parent && isFolderNote(file, parent)) return; // never touch {folder}.md
    const safeStem = stem.replace(/#/g, "");
    const safePath = file.path.replace(/[^/]+\.md$/i, `${safeStem}.md`);
    if (safePath === file.path) return;
    await mutateFrontmatter(app, file, (fm) => { fm.title = stem; });
    await app.fileManager.renameFile(file, safePath);
}
```

**ninja:** `app.fileManager.renameFile` updates wikilinks vault-wide. `mutateFrontmatter` is called first — the frontmatter write happens on the `#`-named file, then the file is renamed. The card label is preserved even if the view re-renders during the rename.

`main.ts` rename handler becomes:

```typescript
this.registerEvent(
    this.app.vault.on("rename", (file, oldPath) => {
        if (file instanceof TFolder) void syncFolderNoteOnRename(this.app, file, oldPath);
        if (file instanceof TFile) void sanitizeItemOnRename(this.app, file);
    }),
);
```

---

## Startup scan: auto-rename existing `#` files

**Decision: auto-rename, not README.**

Reasons:
- Silent continued breakage (files that never reach Android) is a worse user experience than a transparent rename.
- `title:` is written before the rename — the card looks identical before and after. The user observes nothing alarming.
- `app.fileManager.renameFile` keeps wikilinks consistent.
- The `relocateRootImages` pattern (same startup scan shape) proves this works.
- A README asks the user to find it, understand it, and manually rename every file. That is not least resistance.

New function in `actions.ts`, same shape as `relocateRootImages`:

```typescript
export async function sanitizeHashFilesInLibrary(app: App, libraryFolder: string): Promise<void> {
    const root = getFolderByPath(app, normalizeFolderPath(libraryFolder)) ?? app.vault.getRoot();
    await sanitizeHashFilesRecursive(app, root);
}

async function sanitizeHashFilesRecursive(app: App, folder: TFolder): Promise<void> {
    for (const child of folder.children) {
        if (child instanceof TFolder) await sanitizeHashFilesRecursive(app, child);
        if (child instanceof TFile) await sanitizeItemOnRename(app, child); // reuses same guard
    }
}
```

`sanitizeItemOnRename` already guards against Cover.md and folder notes, so this is safe to call on every `.md` file in the library tree.

In `main.ts`, call alongside `relocateRootImages` (already called in `ensureRootCoversRelocated`, triggered by `onLayoutReady` via the view):

```typescript
async ensureRootCoversRelocated(): Promise<void> {
    if (this.coversRelocated) return;
    this.coversRelocated = true;
    await relocateRootImages(this.app);
    await sanitizeHashFilesInLibrary(this.app, this.settings.libraryFolder); // new
}
```

**ninja:** `coversRelocated` acts as a once-per-session gate, so the scan does not repeat on every view open.

---

## Cover.md stays `Cover.md`

`sanitizeItemOnRename` checks `stem === COVER_NOTE_STEM` and returns early. `isFolderNote` also guards the legacy `{folder}.md` note. Neither is touched.

---

## `listItemBasenames` / `nextNoteBasename` parsing after migration

After startup sanitize, disk files are `She-Hulk 6.md`. `markdownStem` returns `She-Hulk 6`. `parseIssue("She-Hulk 6")` → `{n: 6, prefix: "She-Hulk ", width: 1}`. Next Add Next produces `She-Hulk 7`. No regression. `prefersPrefix` still prefers no-`#` if any mixed state exists during a partial sanitize window.

---

## The `numbering:` scheme is not needed

The numbering-scheme-vs-action-label analysis assumed the user must configure how `#` appears on the card. Under Path R, the user types `#` and it is preserved in `title:` — the card shows it without configuration. The `numbering:` Cover.md key, `readNumberingScheme` helper, `numberingScheme` setting, and card-label formatter are all superseded. Lucas does not need to choose Option A vs B from that analysis; Path R makes `title:` the mechanism, and the formatter never needs to exist.

---

## Files that change

| File | What changes |
|------|-------------|
| `src/library.ts` | Add `readItemTitle(app, file): string`; use it in `listChildren` for item `name` |
| `src/actions.ts` | `createNextNote` strips `#`, writes `title:` when stripped; add `sanitizeItemOnRename`; add `sanitizeHashFilesInLibrary` + recursive helper |
| `src/main.ts` | Rename event calls `sanitizeItemOnRename`; `ensureRootCoversRelocated` calls `sanitizeHashFilesInLibrary` |

No new files. No new settings. No new settings UI. `naming.ts` is **not changed**.

---

## What is NOT done

- `title:` is NOT added to items that were never named with `#`. A plain `Saga 1.md` shows `Saga 1` on the card — no decoration. If the user wants `#1`, they rename the file to include `#` and the hook handles it.
- `numbering:` Cover.md key is NOT added.
- `action:` / `actionLabel` are NOT reused for this.
- `#` is NOT restored to any on-disk filename.
- No new community dependencies.
- No plugin command for manual batch rename (superseded by startup scan).
