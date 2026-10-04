# Mobile Back Gesture — Folder Navigation Analysis

> **Context:** On Android, swiping in from the left or right screen edge while inside a
> collection (e.g. `Library / Comics / TMNT`) shows Obsidian's *"swipe again to leave the app"*
> prompt instead of going back to `Comics`. On desktop, the extra mouse buttons already move
> back/forward between folders. The goal is for the mobile back gesture to behave exactly like
> the mouse back button.

---

## 1. Root Cause

### What the swipe actually is

The Android edge swipe is **not a touch event the plugin can see**. With gesture navigation,
Android consumes edge swipes at the OS level and converts them into the system **Back** action.
Obsidian (a Capacitor app) receives that as a `backButton` event and runs its own handler,
roughly:

1. Close an open modal / menu, if any.
2. Close an open sidebar drawer, if any.
3. Otherwise, go back in the **active leaf's navigation history** (the same history the
   desktop tab header `←` / `→` arrows and the *Navigate back* / *Navigate forward* commands use).
4. If that history is empty → show *"swipe again to leave the app"*, exit on the second Back.

Both edges trigger Back — there is no "forward" system gesture on Android.

### Why the grid view falls through to step 4

Folder navigation lives in a **private, in-view stack** that Obsidian knows nothing about:

```ts
// src/ui/grid-view.ts
// ninja: library root is the same snapping grid as every other folder. History is in-view only.

const MIN_CARD_PX = 110;
const HISTORY_CAP = 50;

export class MediaTrackerView extends ItemView {
	plugin: MediaTrackerPluginApi;
	currentFolderPath: string;
	private debounceHandle: number | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private past: string[] = [];
	private future: string[] = [];
```

The only thing that reads `past` / `future` is the mouse handler:

```ts
// src/ui/grid-view.ts
	private registerHistoryListeners(): void {
		const onMouseDown = (event: MouseEvent) => {
			if (event.button === 3 || event.button === 4) event.preventDefault();
		};
		const onMouseUp = (event: MouseEvent) => {
			if (event.button === 3) {
				event.preventDefault();
				this.goBack();
				return;
			}
			if (event.button === 4) {
				event.preventDefault();
				this.goForward();
			}
		};
		// ...
	}
```

From Obsidian's point of view the leaf has been showing *one* view state the whole time, so
its history is empty and Back means "leave the app". The `preventDefault()` calls exist
precisely because Obsidian *does* react to mouse back/forward natively — they suppress
Obsidian's leaf history so it doesn't fight the in-view stack.

**The mouse buttons and the Android Back gesture are the same intent routed through two
different history systems.** That is the bug; the swipe is the symptom.

---

## 2. Options

### Option A — Detect swipes ourselves (`touchstart` / `touchmove` on `contentEl`) ❌

Track horizontal pointer movement in the grid and call `goBack()` / `goForward()`.

| | |
|-|-|
| ❌ Edge swipes never reach the WebView under Android gesture nav — the OS takes them | |
| ❌ Mid-screen swipes collide with Obsidian's own swipe-to-open-sidebar gestures | |
| ❌ Introduces a second gesture vocabulary that differs from every other Obsidian view | |

**Verdict:** Cannot fix the reported case at all. Rejected.

---

### Option B — Intercept Obsidian's back handler ❌

Register our own Capacitor `App.addListener("backButton", …)`, or monkey-patch Obsidian's
internal back handler, and call `goBack()` while the grid is active.

| | |
|-|-|
| ❌ Private API — Obsidian's handler and ours both fire; ordering is undefined | |
| ❌ Breaks silently on any Obsidian mobile update | |
| ❌ Still leaves two history systems (mouse/tab arrows/hotkeys vs. ours) | |

**Verdict:** Fragile, treats the symptom. Rejected.

---

### Option C — Browser history (`history.pushState` + `popstate`) ❌

Push a WebView history entry per folder and listen for `popstate`.

| | |
|-|-|
| ❌ Obsidian registers its own `backButton` listener, so Capacitor never falls back to WebView history — `popstate` does not fire | |
| ❌ Desktop Electron would accumulate meaningless history entries | |

**Verdict:** Does not hook the path the gesture actually takes. Rejected.

---

### Option D — Record folder changes in Obsidian's leaf history ⭐ (recommended)

Obsidian exposes a public, documented hook for exactly this. From `obsidian.d.ts`:

```ts
export interface ViewStateResult {
    /**
     * Set this to true to indicate that there is a state change which should be recorded
     * in the navigation history.
     */
    history: boolean;
}
```

A view that implements `getState()` / `setState()` and sets `result.history = true` when its
state changes gets its previous state pushed onto the leaf's history — the same mechanism
`MarkdownView` uses when a different file opens in the same tab.

> ninja: this is the best design because the plugin stops owning a history system and reuses
> the one every Obsidian input already drives. One source of truth, zero private API, net
> negative lines of code.

| | |
|-|-|
| ✅ Android Back gesture: `TMNT → Comics → Library → exit prompt` | |
| ✅ Mouse back/forward keep working — now via Obsidian's native handling | |
| ✅ Desktop tab header `←` / `→` arrows and *Navigate back / forward* hotkeys start working for folders too | |
| ✅ Obsidian mobile's back/forward buttons and commands give a "forward" on mobile for free | |
| ✅ Public API only, stable across Obsidian updates | |
| ✅ Deletes `past`, `future`, `HISTORY_CAP`, `goBack`, `goForward`, `registerHistoryListeners`, `dropHistoryUnder`, `rewriteHistory` | |
| ⚠️ Behaviour changes listed in §4 need a conscious yes | |

---

## 3. Implementation Sketch (Option D)

All changes are in `src/ui/grid-view.ts`. `library.ts`, `main.ts`, and `commands.ts` call
`openFolder()` / `openHomepage()` / `render()` and keep working unchanged.

### 3.1 Mark the view as navigable and expose its state

```ts
import { ItemView, Notice, TAbstractFile, TFile, ViewStateResult, WorkspaceLeaf } from "obsidian";
import { /* ...existing... */ normalizeFolderPath } from "../library";

export class MediaTrackerView extends ItemView {
	// ninja: navigation views get leaf history; that history is what Android's Back gesture walks.
	navigation = true;
	plugin: MediaTrackerPluginApi;
	currentFolderPath: string;
	// ...past / future / HISTORY_CAP removed

	getState(): Record<string, unknown> {
		return { folder: this.currentFolderPath };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const folder = this.resolveFolder(readFolder(state) ?? this.plugin.settings.libraryFolder);
		if (normalizeFolderPath(folder) !== normalizeFolderPath(this.currentFolderPath)) {
			result.history = true;
			this.currentFolderPath = folder;
		}
		this.render();
		await super.setState(state, result);
	}
```

```ts
function readFolder(state: unknown): string | null {
	if (typeof state !== "object" || state === null) return null;
	const folder = (state as Record<string, unknown>).folder;
	return typeof folder === "string" ? folder : null;
}
```

### 3.2 Navigate through the leaf instead of mutating state directly

```ts
	openFolder(path: string): void {
		void this.leaf.setViewState({ type: VIEW_TYPE_MEDIA_TRACKER, state: { folder: path } });
	}

	openHomepage(): void {
		this.openFolder(this.plugin.settings.libraryFolder);
	}
```

`navigate()`, `goBack()`, and `goForward()` are removed. `setViewState` with the same view type
reuses the existing view and calls `setState`; Obsidian records the previous state when
`result.history` comes back `true`. When Back/Forward is pressed, Obsidian replays a stored
state through the same `setState` — there is only one code path that changes folders.

### 3.3 Survive stale history entries

History entries are plain `{ folder }` snapshots. A folder can be deleted or renamed after its
entry was recorded, so `setState` must never trust the path blindly. Today `render()` would show
*"Library folder … was not found"* for a missing **sub**-folder, which is the wrong message.

```ts
	// ninja: history can point at a folder deleted or renamed since; land on the nearest ancestor that still exists.
	private resolveFolder(path: string): string {
		const libraryPath = this.plugin.settings.libraryFolder;
		let candidate = normalizeFolderPath(path);
		if (!isPathInLibrary(candidate, libraryPath)) return libraryPath;
		while (!isLibraryRoot(candidate, libraryPath) && !getFolderByPath(this.app, candidate)) {
			candidate = candidate.includes("/") ? candidate.slice(0, candidate.lastIndexOf("/")) : "";
		}
		return candidate;
	}
```

The loop terminates because `candidate` is inside the library and each step moves one level up,
ending at the library root at worst.

### 3.4 Simplify the vault listeners

- **`delete`:** replace the "reset to library root" branch with
  `this.currentFolderPath = this.resolveFolder(this.currentFolderPath)` so deleting `TMNT`
  lands on `Comics`, not the root. Drop `dropHistoryUnder`.
- **`rename`:** keep the existing `currentFolderPath` rewrite. Drop `rewriteHistory`; stale
  entries are handled by §3.3.

### 3.5 Remove the mouse handler

Delete `registerHistoryListeners()` and its call in `onOpen()`. Obsidian's native mouse
back/forward handling now drives the same leaf history, so keeping the handler would make one
click move **two** steps.

---

## 4. Behaviour Changes to Decide On

| Change | Before | After | Recommendation |
|--------|--------|-------|----------------|
| Back past the library root | Mouse back did nothing | Goes to whatever the tab showed before the grid (e.g. a note), or exit prompt on mobile | Accept — matches every other Obsidian view |
| Opening an item note | Opens wherever `getLeaf(false)` decides; on a non-navigation view that is usually a different tab | Opens **in the same tab**; Back returns to the grid at the same folder | Accept — this is what makes "open issue → swipe back → still in TMNT" work on mobile |
| Ribbon / *Open library* | Jumps to root without recording a step | Jumps to root **as a history step** (Back returns to `TMNT`) | Accept — behaves like a browser Home button; avoids a special-case flag in state |
| Restart / reload | Always opens at the library root | Obsidian restores the last folder from `workspace.json` (because `getState` is persisted) | Accept — "resume where I was"; see edge case below |
| Deleted / renamed folder in history | History rewritten precisely | Lands on nearest existing ancestor | Accept — simpler, and never shows a wrong error |

### Edge case: restored into a sub-folder with empty history

After a restart, if the grid restores directly into `TMNT`, the leaf's back history is empty, so
the first Back on Android shows the exit prompt instead of going to `Comics`. Breadcrumbs still
work. If this turns out to matter in practice, the fix is to seed the ancestor chain once on
restore (root → `Comics` → `TMNT` via successive `setViewState` calls). Not worth building until
it is actually felt. (YAGNI)

### Not in scope: a "swipe forward" gesture

Android has no forward system gesture, and a custom in-content swipe runs into the problems in
Option A. Forward on mobile comes from Obsidian's own *Navigate forward* button/command, which
Option D enables for free.

---

## 5. Verification Plan

No automated test harness exists for view behaviour, so this is a manual checklist.

**Android (gesture navigation)**
1. `Library → Comics → TMNT`, swipe from either edge → `Comics` → `Library` → exit prompt.
2. In `TMNT`, open an item note, swipe back → grid at `TMNT`.
3. Obsidian's *Navigate forward* (toolbar or command palette) → returns to the folder you came back from.
4. Open a modal or sidebar inside `TMNT`, swipe → closes the modal/sidebar only; folder unchanged.

**Desktop**
5. Mouse back/forward moves **exactly one** folder per click (no double step, no jump to a previous note).
6. Tab header `←` / `→` and the *Navigate back / forward* hotkeys move between folders.
7. Breadcrumb from `TMNT` to `Library`, then Back → `TMNT`.

**Robustness**
8. Navigate `Comics → TMNT → Comics`, delete `TMNT`, press Forward → lands on `Comics`, no error message.
9. Rename `TMNT` while inside it → grid stays on the renamed folder.
10. Change the library folder in settings while deep inside a collection → grid falls back to the new root.
11. Restart Obsidian → grid restores to the last folder without errors.

---

## 6. Summary

The back gesture and the mouse buttons are the same "go back" intent, but today they feed two
different history systems: Obsidian's leaf history (which Android Back uses) and a private
in-view stack (which only the mouse handler uses). Making the grid a navigation view that
records folder changes through the public `getState` / `setState` + `ViewStateResult.history`
API merges them. One mechanism then handles the Android swipe, mouse buttons, tab arrows, and
hotkeys, and the custom history code gets deleted rather than extended.

---

*Generated: 2026-10-04 — pegasus-media-tracker / dev*
