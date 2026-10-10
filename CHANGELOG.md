# Changelog

All notable changes to Pegasus Media Tracker are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/).

---

## [1.3.0] — 2026-10-10

### Added

- **Drag-drop cover** — drop an image from your OS file manager or from the Obsidian file tree directly onto any card to set its cover. Works on both item cards and collection cards. OS drops import the image into the vault beside the item note (items) or into `assets/covers/` (collections); vault drags only update `cover:` frontmatter, no copy.
- **Own indicator** — add `own: true` to an item note's frontmatter to show a small green pip in the top-right corner of the card cover. **Add Next** now writes `own: false` into every new note so the field is present and queryable from day one.
- **Subtitle** — add `subtitle:` to an item note to set an explicit secondary label on the card. When absent the plugin continues to auto-detect variant names from the filename (digit-anchored `{primary} - {secondary}` split). An explicit subtitle overrides the heuristic for that note only.
- **Sticky toolbar** — the breadcrumb, zoom buttons, and action buttons now stay pinned to the top of the view while the card grid scrolls beneath them.
- **Variant title split** — item filenames that match `{title with digit} - {variant}` (e.g. `X-Men 13 - Coello Variant`) automatically render as a primary title span and a muted secondary span. No frontmatter needed.

### Fixed

- Sticky toolbar painted behind the card grid on scroll because `z-index: 1` on the toolbar matched the `z-index: 1` on card-cover `<img>` elements; later DOM order gave cards the win. Raised toolbar to `z-index: 10`.
- Card images showed through the view's `padding-top` strip above the sticky toolbar while scrolling. Applied the same negative-margin + matching-padding treatment to the top axis that already existed for left/right gutters.
- Collection card titles that overflow the two-line clamp now fade out with a gradient rather than hard-clipping.
- Read button aligns to the bottom of the card regardless of title height.

---

## [1.2.1] — 2026-10-04

### Fixed

- Cover resolution order: folder image now checked before `assets/covers/` slug-match, so a local image always wins.

---

## [1.2.0] — 2026-10-04

### Added

- `assets/covers/` slug-matching for collection covers. Images dropped at the vault root are relocated into `assets/covers/` automatically.
- Ambient blur backdrop on card covers: non-2∶3 artwork (square, landscape) gets a blurred, darkened background instead of dead space.

---

## [1.1.4] — 2026-09-10

### Fixed

- Ownership pip z-index conflict with drag-drop overlay resolved.

---

## [1.1.0] — 2026-09-08

### Added

- Mouse back / forward navigation (buttons 3 and 4) for in-view history.
- Zoom with Ctrl/Cmd + scroll wheel.

---

## [1.0.1] — 2026-09-08

### Fixed

- Homepage-by-default now waits for Obsidian layout-ready before opening the view.

---

## [1.0.0] — 2026-09-07

Initial release.
