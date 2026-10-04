# Plan: Slug `#` out of item note filenames

**Goal:** Stop the plugin from inserting `#` into item note filenames so Self-hosted LiveSync can write them to Android.

---

## 1. Does this need to be built? (YAGNI)

Yes. The plugin is the agent inserting `#` into filenames. `LiveSync`'s `isValidFilenameInAndroid` treats `#` as illegal and will not write the file on Android. The user cannot work around this on the LiveSync or Android side — path obfuscation does not rewrite the on-disk filename, and `%23` encoding was rejected upstream. The fix must be in Pegasus.

*Scope clarification:* This is an end-user plugin change. All new files created by **Add Next** must never have `#` in the filename. Existing files with `#` are addressed separately (§6). No LiveSync internals are touched.

---

## 2. Root cause

Two lines in `src/naming.ts`, one line in `src/actions.ts`:

**`src/naming.ts` — the generator**

```
35|  const prefix = best?.prefix ?? `${collectionTitle} #`;
```
When a series folder is empty, the default prefix is `"<folder> #"`, producing `Attack on Titan #1.md` as the first file. This is the primary source.

```
47|  function prefersPrefix(candidate: ParsedIssue, current: ParsedIssue): boolean {
48|      const candidateHash = candidate.prefix.includes("#");
49|      const currentHash = current.prefix.includes("#");
50|      return candidateHash && !currentHash;
51|  }
```
When a mixed folder contains both `Saga #5.md` and `Saga 5.md` (e.g., a partially-migrated vault), the tiebreaker currently *prefers* the `#` prefix. This keeps generating `#` names even after a partial migration.

**`src/actions.ts` — `folderSlug`**

```
163|  .replace(/[\\/:*?"<>|]/g, "-")
```
`#` is absent from this character class. A collection titled `Comics #1` would create a folder `Comics #1/` — the same LiveSync failure for collection folders (rare but consistent bug).

Note: `createNextNote` passes `folder.name` (already a slug) as `collectionTitle`. The root cause is not in `createNextNote` itself, only in the two constants above.

---

## 3. Reuse `folderSlug` vs. a second slugger

**ninja: Fix the two root-cause lines in `naming.ts` directly. Do NOT pipe item basenames through `folderSlug`.**

Reasoning:
- `folderSlug` is a user-input → folder-path transformer. It has `:` → `" - "` logic specifically tuned for the display/storage split of collection titles (`:` has semantic meaning in subtitles and must survive as a visible label). Item basenames are *computed* from the folder prefix — we are not slugging user input, we are changing what prefix the algorithm generates by default.
- The fix is two constant changes, not a data transformation. Using `folderSlug` here would be the wrong abstraction.
- **Separately**, `folderSlug` itself should have `#` added to its illegal-char catch-all (see §7). That is one character in an existing regex, not a new slugger.

---

## 4. New file naming — default prefix and `prefersPrefix`

**Default prefix change (`naming.ts` line 35):**

| Before | After |
|--------|-------|
| `` `${collectionTitle} #` `` | `` `${collectionTitle} ` `` |

`formatIssue("Saga ", 1, 1)` → `"Saga 1"`. The trailing space in the prefix is intentional: `formatIssue` concatenates `prefix + body`, so `"Saga " + "1"` = `"Saga 1"`. This matches the format Lucas confirmed syncs to Android (`Saga 1.md`…`Saga 5.md`).

`folder.name` is already trimmed by `folderSlug`, so no double-space edge case for plugin-created folders. Manually-renamed folder names with trailing spaces are a pre-existing edge case outside this scope.

**`prefersPrefix` flip:**

| Before | After |
|--------|-------|
| `return candidateHash && !currentHash` | `return !candidateHash && currentHash` |

In a mixed folder (partially migrated vault contains both `Saga #5.md` and `Saga 5.md`), the tiebreaker now selects the no-`#` prefix. The next note will be `Saga 6.md`, not `Saga #6.md`.

Folders that are *entirely* `#`-prefixed (e.g., `Saga #1.md` through `Saga #5.md`, not yet migrated) will still generate `Saga #6.md` — `prefersPrefix` is only a tiebreaker when two files share the same issue number. This is correct: the plugin respects the user's existing convention for untouched folders and stops propagating `#` only when there is a clear no-`#` signal.

---

## 5. Display: `title:` frontmatter on item notes?

Today: item cards use `markdownStem(file)` = `file.name.replace(/\.md$/i, "")`. No `title:` field is read for items.

**ninja: Do NOT add `title:` to item notes. YAGNI.**

Why the collection pattern is not the right analogy here:
- Collections need `title:` because `folderSlug` transforms `Supergirl: Woman of Tomorrow` into `Supergirl - Woman of Tomorrow` — information that would otherwise be irretrievably lost from the label. The folder path and the card label diverge meaningfully.
- For items, the change is `Saga #1` → `Saga 1`. The `#` is a numbering decoration, not semantic content. `Saga 1` is unambiguous; `1` is still the correct issue number.
- Adding `title: "Saga #1"` per note would: add 3–4 frontmatter lines to every new note, require `createNextNote` to compute a separate display string, and require a `readItemTitle` helper in `library.ts` — all for a cosmetic preference.

After this change, new items created by **Add Next** show as `Saga 1`, `Saga 2`, etc. on the card. Existing items with `#` in the filename continue to show their actual filename stem on desktop (e.g., `Saga #1`). The two coexist without confusion.

---

## 6. Existing vault files (`Attack on Titan #1.md` etc.)

These files are not renamed by this change. They continue to:
- Appear in the desktop grid (`markdownStem` already uses `file.name`, not `file.basename`, so `#` in the stem does not break the card title — the comment in `library.ts` line 179 confirms this).
- Fail to sync to Android via LiveSync until renamed on the desktop.

**Migration plan: document in README, no plugin command now.**

Instructions to add to README:
> **Migrating existing `#` filenames:** Files created before this version (e.g., `Saga #1.md`) will not sync to Android via Self-hosted LiveSync. Rename them on desktop by pressing F2 on each file and removing the `#` (e.g., `Saga 1.md`). Obsidian will update wikilinks automatically. A bulk rename community plugin can batch this across a collection.

ninja: A plugin command for batch rename is a valid follow-up but is YAGNI for this release. It would require: iterating `listItemBasenames`, calling `vault.rename` on each `#`-containing file, and handling the case where the target name already exists. That is a separate, self-contained feature. Do not add it here.

---

## 7. Collection folder names that contain `#`

`folderSlug` in `src/actions.ts` currently catches `[\\/:*?"<>|]` but not `#`. A user who creates a collection titled `Comics #1` via Add New would get a folder named `Comics #1/`, which LiveSync cannot write to Android.

**Fix:** Add `#` to the catch-all character class in `folderSlug`:

```
Before: .replace(/[\\/:*?"<>|]/g, "-")
After:  .replace(/[\\/:*?"<>|#]/g, "-")
```

ninja: `#` does not need the `:` → `" - "` special treatment. `:` receives it because it carries structural meaning in English subtitles. `#` in a collection title (e.g., `Issue #1 Collection`) can safely become a `-` without losing semantic content. One character added to an existing regex; the `title:` on Cover.md retains the original `#`.

---

## 8. Tests / validation

Manual steps in this order:

1. **Empty series (primary fix):** Create a new collection. Click Add Next. Confirm basename is `{folder name} 1.md` — no `#`.
2. **All-`#` folder (no regression):** Open a folder that has only `Saga #1.md` through `Saga #3.md`. Click Add Next. Confirm `Saga #4.md` is created — existing convention still cloned.
3. **Mixed folder (migration tiebreaker):** Folder has `Saga #5.md` AND `Saga 5.md`. Click Add Next. Confirm `Saga 6.md` is created, not `Saga #6.md`.
4. **Collection title with `#` (folderSlug fix):** Open Add New at the library root. Type `X-Men #1 Collection` as name. Confirm folder created is `X-Men -1 Collection` (or `X-Men 1 Collection` depending on regex ordering — verify). Confirm Cover.md `title:` is `X-Men #1 Collection` (original preserved).
5. **LiveSync Android:** Create one new item via Add Next in an empty series. Sync. Confirm note appears on Android.
6. **Desktop display of existing `#` files:** Existing `Attack on Titan #1.md` still shows as a card titled `Attack on Titan #1` on desktop. No regression.

---

## 9. Files to touch (fewest)

**`src/naming.ts`** — 2 lines changed:
- Line 35: change default prefix from `` `${collectionTitle} #` `` to `` `${collectionTitle} ` ``
- `prefersPrefix` return: flip `candidateHash && !currentHash` → `!candidateHash && currentHash`

**`src/actions.ts`** — 1 character changed:
- `folderSlug` line 163: `[\\/:*?"<>|]` → `[\\/:*?"<>|#]`

**`README.md`** — 3 locations:
- Line 94: `"you get {folder name} #1"` → `"you get {folder name} 1"`
- Line 22: `#16 → #17` example — *leave unchanged*. This example correctly describes cloning an existing `#` prefix, which still works. Changing it would be misleading.
- Vault layout (lines 110–118): optionally update `X-Men #1.md` / `X-Men #16.md` examples to `X-Men 1.md` / `X-Men 16.md` to reflect what Add Next now generates. Keep as-is if the intent is to show legacy layout compatibility.
- Add migration note (see §6).

No changes to: `src/library.ts`, `src/commands.ts`, `src/ui/cards.ts`, `src/cover.ts`, `src/settings.ts`, `src/types.ts`, `src/ui/grid-view.ts`.

---

## 10. Out of scope

- LiveSync settings, path obfuscation, `%23` encoding, LiveSync ignore rules
- iOS / Darwin filename behavior (Darwin does not forbid `#`; irrelevant)
- `title:` frontmatter on item notes
- Plugin command for batch rename of existing `#` files (follow-up if requested)
- Any change to how item notes are opened, read, or displayed beyond the card title stem
