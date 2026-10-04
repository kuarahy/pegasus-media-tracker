import { Plugin, TFile, TFolder } from "obsidian";
import { relocateImageToCoversIfRoot, relocateRootImages, syncFolderNoteOnRename } from "./actions";
import { registerCommands } from "./commands";
import { DEFAULT_SETTINGS, MediaTrackerSettingTab, type MediaTrackerSettings } from "./settings";
import { VIEW_TYPE_MEDIA_TRACKER } from "./types";
import { MediaTrackerView } from "./ui/grid-view";
import { registerHomepageButton, removeHomepageButtons } from "./ui/homepage-button";

export default class MediaTrackerPlugin extends Plugin {
	settings!: MediaTrackerSettings;
	private coversRelocated = false;

	async onload(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<MediaTrackerSettings>,
		);

		this.registerView(VIEW_TYPE_MEDIA_TRACKER, (leaf) => new MediaTrackerView(leaf, this));
		this.addRibbonIcon("layout-grid", "Open Pegasus Media Tracker", () => {
			void this.activateHomepage();
		});
		this.addSettingTab(new MediaTrackerSettingTab(this.app, this));
		registerCommands(this);
		registerHomepageButton(this);
		// ninja: opt-in — do not steal the active tab unless they asked.
		this.app.workspace.onLayoutReady(() => {
			if (!this.settings.openOnStartup) return;
			void this.activateHomepage();
		});
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (file instanceof TFolder) {
					void syncFolderNoteOnRename(this.app, file, oldPath);
				}
			}),
		);
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (file instanceof TFile) {
					void relocateImageToCoversIfRoot(this.app, file);
				}
			}),
		);
	}

	async ensureRootCoversRelocated(): Promise<void> {
		if (this.coversRelocated) return;
		this.coversRelocated = true;
		await relocateRootImages(this.app);
	}

	onunload(): void {
		removeHomepageButtons(this);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.refreshViews();
	}

	async persistSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async activateView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_MEDIA_TRACKER);
		const existingLeaf = existing[0];
		if (existingLeaf) {
			await this.app.workspace.revealLeaf(existingLeaf);
			return;
		}

		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE_MEDIA_TRACKER, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	async activateHomepage(): Promise<void> {
		await this.activateView();
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MEDIA_TRACKER)) {
			const view = leaf.view;
			if (view instanceof MediaTrackerView) view.openHomepage();
		}
	}

	private refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_MEDIA_TRACKER)) {
			const view = leaf.view;
			if (view instanceof MediaTrackerView) {
				view.render();
			}
		}
	}
}
