# Analysis: Numbering Scheme vs Action Label Integration

**Recommendation:** Add a `numbering:` key to Cover.md that follows the exact same global-default + per-collection-override shape as `action:` / `actionLabel`. A global `numberingScheme` setting (values: `plain`, `#`, `v`) provides the default; a collection's Cover.md can override with `numbering: "#"` or `numbering: "v"`. The scheme drives two independent jobs: (1) how the card *displays* the issue number for every item in that collection, and (2) what prefix Add Next uses when the folder is empty. `#` is the only scheme where those two jobs diverge — the card shows `Saga #1` but the file stays `Saga 1.md`. For every other scheme (`v`, plain) the display and the filename are identical. One user-facing control, one internal path-safe mapping for the `#` case.

---

## 1 · Two jobs, not one

| Job | What it controls | Touches filenames? |
|-----|------------------|--------------------|
| **Job 1 — display** | How the card label renders the issue suffix. `Saga 1.md` → card shows `Saga #1` (scheme `#`) or `Saga v1` (scheme `v`) or `Saga 1` (plain). | **No.** Pure read-time formatting. |
| **Job 2 — Add Next default** | The prefix used by `nextNoteBasename` when the folder is empty and there are no siblings to clone. | **Yes** — but only for newly created files in empty folders. |

These are separate concerns. Do not collapse them into one mechanism. What makes the feature feel unified to Lucas is that one setting drives both, not that the code mixes them.

---

## 2 · Feature B compatibility (the clone-existing behavior)

`nextNoteBasename` already clones whatever prefix is in the folder (`#16` → `#17`, `v6` → `v7`, `5` → `6`). A global scheme setting must not fight that. The scheme **only fills the `best?.prefix ?? default` branch** — when there are no existing siblings to clone. Once the folder has at least one item, `nextNoteBasename` reads the prefix from that item, not from the scheme.

```
35|  const prefix = best?.prefix ?? `${collectionTitle} `;   // ← scheme replaces this default only
```

A per-collection `numbering: "v"` on Cover.md would make the first Add Next in an empty folder produce `Saga v1.md`. After that, `v2`, `v3`, … are cloned naturally — no scheme read required. This means the scheme is only consulted once per collection lifetime (first item).

---

## 3 · The `#` special case — display yes, path no

`#` is the only value where Jobs 1 and 2 diverge:

| Scheme | Add Next creates | Card displays |
|--------|-----------------|---------------|
| `plain` (default) | `Saga 1.md` | `Saga 1` |
| `v` | `Saga v1.md` | `Saga v1` |
| `#` | `Saga 1.md` ← **no `#`** | `Saga #1` ← **`#` lives here only** |

For the card display, a small formatter in `library.ts` reads the stem, and if the collection's scheme is `#`, transforms `{prefix}{n}` → `{prefix}#{n}` for stems that end in a plain space-then-digits pattern. Stems that already contain `#` (legacy files) or `v` display as-is; no double-transform.

This is the `:` analog: `folderSlug` stores `Supergirl - Woman of Tomorrow` on disk; `title:` on Cover.md stores `Supergirl: Woman of Tomorrow` for display. Here: disk stores `Saga 1`, scheme says `#` on Cover.md, card shows `Saga #1`.

**ninja:** The display transform touches only `listChildren` / the card label read path. It does not touch `listItemBasenames` (used by Add Next for sibling detection) — those must stay as raw stems so `nextNoteBasename` parses real filenames.

---

## 4 · Shape: `numbering:` on Cover.md + global default

Mirrors `action:` / `actionLabel` exactly:

```
settings.ts:    numberingScheme: "plain" | "#" | "v"   default: "plain"
Cover.md:       numbering: "#"                           per-collection override
library.ts:     readNumberingScheme(app, folder, fallback): string   (same shape as readActionLabel)
```

**Key name — `numbering:` not `scheme:`:**
`scheme:` is vague and could mean anything. `numbering:` is self-documenting in frontmatter and matches the user's vocabulary ("how issues are numbered"). It does not collide with `action:` (the Read button) or `title:` (display name).

Settings UI: a dropdown (not a text field) with three options — **Plain (1, 2, 3)**, **Hash (#1, #2, #3)**, **Volume (v1, v2, v3)** — so typos in the scheme value are impossible. This also avoids the `normalizeActionLabel` fallback-to-default pattern that text fields require.

---

## 5 · YAGNI check

Does this need to be built now?

Yes. `feat/sharp-slug` already ships and solves the LiveSync Android write problem (no `#` in new filenames). But Lucas's original motivation was to *use* `#` for issue numbers — the `:` pattern only pays off if the character is visible on the card. Without a display scheme, `#` is gone from both filename and card. The feature is the other half of what sharp-slug started.

The minimum viable increment on top of the current branch:
1. `numberingScheme` global setting (dropdown, default `plain`).
2. `numbering:` Cover.md key read by a new `readNumberingScheme` helper.
3. Card label formatter that applies scheme to the stem.
4. `nextNoteBasename` reads scheme for the empty-folder default (the one `?? default` line).

No new files. Four small edits across `settings.ts`, `library.ts` (one helper), `naming.ts` (one parameter), and the card render path.

---

## 6 · What NOT to do

- **Do not reuse `actionLabel` / `action:` for numbering.** They are different keys with different jobs. Mashing them would require either a compound value (`"Read|#"`) or a second key anyway.
- **Do not put `#` back into default filenames.** Android LiveSync will not write them.
- **Do not apply the scheme to the `listItemBasenames` result** used by `nextNoteBasename` for sibling detection. Those paths must stay as raw disk stems.
- **Do not build a vault-wide rename watcher or batch migrator** as part of this. Existing `#` files continue to display their stem as-is (no regression; `markdownStem` already uses `file.name` not `file.basename`).
- **Do not add a `title:` field to item notes.** Already ruled out in `slug-hash-in-item-filenames.md` §5. The scheme formatter on the card is sufficient.
- **Do not add more scheme values speculatively** (`Vol.`, `Issue`, `Ch.`, …). Manga users can use `v`; if more are needed they're additive later.

---

## 7 · Product question — stop here

**One decision Lucas must make before implementation begins:**

> When scheme is `#` and the folder has existing files named `Saga 1.md`, `Saga 2.md`, … does the card display transform them retroactively as `Saga #1`, `Saga #2`, … — or does the transform only apply to files created by Add Next under that scheme?

**Option A (retroactive display):** Every item in the collection renders with the scheme. `Saga 1.md` shows as `Saga #1`. This is the "slug option that wouldn't touch filenames" Lucas described — the full `:` analog. Requires the display formatter to run on every card render.

**Option B (Add Next only):** The scheme only controls what prefix Add Next uses for the first file in an empty folder. Existing filenames display as their raw stems. Simpler, but `Saga 1.md` will never show `#1` no matter the setting.

The analysis above assumes **Option A**. If Lucas wants Option B, drop the card display formatter entirely and the feature reduces to "Add Next empty-folder default" with a per-collection override — still worth building, but smaller.

---

## 8 · Files that change (Option A)

| File | Change |
|------|--------|
| `src/settings.ts` | Add `numberingScheme: "plain" \| "#" \| "v"` to `MediaTrackerSettings`; add dropdown to `getSettingDefinitions` |
| `src/library.ts` | Add `readNumberingScheme(app, folder, fallback)` helper (mirrors `readActionLabel`) |
| `src/naming.ts` | Accept optional `scheme` param in `nextNoteBasename`; use it as the empty-folder default prefix |
| `src/ui/` (card label) | Apply scheme formatter when rendering item card titles |
| `README.md` | Document `numbering:` in frontmatter table; add `numberingScheme` to settings table |

No new files. No new dependencies.
