import type { View, WorkspaceLeaf } from "obsidian";
import type { MediaTrackerPluginApi } from "../settings";

const HOMEPAGE_BUTTON_CLASS = "media-tracker-homepage-button";
// ninja: Obsidian's built-in blank-tab view type; undocumented but stable across releases.
const EMPTY_VIEW_TYPE = "empty";

export function registerHomepageButton(plugin: MediaTrackerPluginApi): void {
	plugin.registerEvent(
		plugin.app.workspace.on("active-leaf-change", (leaf) => injectButton(plugin, leaf)),
	);
	plugin.app.workspace.onLayoutReady(() =>
		injectButton(plugin, plugin.app.workspace.getMostRecentLeaf()),
	);
}

export function removeHomepageButtons(plugin: MediaTrackerPluginApi): void {
	for (const leaf of plugin.app.workspace.getLeavesOfType(EMPTY_VIEW_TYPE)) {
		contentElement(leaf.view).querySelector(`.${HOMEPAGE_BUTTON_CLASS}`)?.remove();
	}
}

function injectButton(plugin: MediaTrackerPluginApi, leaf: WorkspaceLeaf | null): void {
	if (!leaf || leaf.view.getViewType() !== EMPTY_VIEW_TYPE) return;
	const container = contentElement(leaf.view);
	const existing = container.querySelector(`.${HOMEPAGE_BUTTON_CLASS}`);
	if (!plugin.settings.showHomepageButtonOnNewTab) {
		existing?.remove();
		return;
	}
	if (existing) return;

	const button = container.createEl("button", {
		cls: HOMEPAGE_BUTTON_CLASS,
		text: "Open Pegasus homepage",
	});
	button.addEventListener("click", () => void plugin.activateHomepage());
}

// ninja: EmptyView is a bare View, not an ItemView, so it has no typed contentEl — same header/content split, one index over.
function contentElement(view: View): HTMLElement {
	const content = view.containerEl.children[1];
	return content instanceof HTMLElement ? content : view.containerEl;
}
