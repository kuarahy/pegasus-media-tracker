import { Notice, TFile, TFolder } from "obsidian";
import { createCollection, createNextNote, ensureFolder } from "./actions";
import { addToolbarMode, getFolderByPath, isPathInLibrary } from "./library";
import type { MediaTrackerPluginApi } from "./settings";
import { VIEW_TYPE_MEDIA_TRACKER } from "./types";
import { MediaTrackerView } from "./ui/grid-view";
import { promptForName } from "./ui/name-modal";

export function registerCommands(plugin: MediaTrackerPluginApi): void {
	// ninja: palette already shows the plugin name; repeating it in id/name is what the review flags.
	plugin.addCommand({
		id: "open-library",
		name: "Open library",
		callback: () => void plugin.activateHomepage(),
	});

	plugin.addCommand({
		id: "add-next-item",
		name: "Add next item",
		callback: () => void addFromContext(plugin),
	});
}

async function addFromContext(plugin: MediaTrackerPluginApi): Promise<void> {
	const openView = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_MEDIA_TRACKER)[0]?.view;
	if (openView instanceof MediaTrackerView) {
		await openView.addFromToolbar();
		return;
	}

	const folder = folderForActiveFile(plugin) ?? getFolderByPath(plugin.app, plugin.settings.libraryFolder);
	const mode = addToolbarMode(folder, plugin.settings.libraryFolder);

	try {
		if (mode === "create-folder" || !folder) {
			await ensureFolder(plugin.app, plugin.settings.libraryFolder);
			return;
		}
		if (mode === "add-new") {
			const name = await promptForName(plugin.app, {
				title: "New collection",
				placeholder: "Collection name",
				confirm: "Create",
			});
			if (name === null) return;
			await createCollection(plugin.app, folder, name);
			return;
		}
		await createNextNote(plugin.app, folder);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Could not add to this collection.";
		new Notice(message);
	}
}

function folderForActiveFile(plugin: MediaTrackerPluginApi): TFolder | null {
	const file = plugin.app.workspace.getActiveFile();
	if (!file) return null;
	const folder = file instanceof TFile ? file.parent : null;
	if (!folder) return null;
	if (!isPathInLibrary(folder.path === "/" ? "" : folder.path, plugin.settings.libraryFolder)) {
		return null;
	}
	return folder;
}
