import { App, Plugin, PluginSettingTab, type SettingDefinitionItem } from "obsidian";

export interface MediaTrackerSettings {
	libraryFolder: string;
	actionLabel: string;
	gridColumns: number;
	openOnStartup: boolean;
	showHomepageButtonOnNewTab: boolean;
}

export const DEFAULT_SETTINGS: MediaTrackerSettings = {
	libraryFolder: "Media",
	actionLabel: "Read",
	gridColumns: 6,
	openOnStartup: false,
	showHomepageButtonOnNewTab: true,
};

export interface MediaTrackerPluginApi extends Plugin {
	settings: MediaTrackerSettings;
	saveSettings(): Promise<void>;
	activateView(): Promise<void>;
	activateHomepage(): Promise<void>;
	ensureRootCoversRelocated(): Promise<void>;
	persistSettings(): Promise<void>;
}

export class MediaTrackerSettingTab extends PluginSettingTab {
	plugin: MediaTrackerPluginApi;

	constructor(app: App, plugin: MediaTrackerPluginApi) {
		super(app, plugin);
		this.plugin = plugin;
	}

	// ninja: minAppVersion is 1.13.0, so Path A is definitions only — display() would be a second UI to keep in sync.
	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: "Library folder",
				desc: "Root folder scanned for collections. Other vault folders are ignored.",
				control: {
					type: "folder" as const,
					key: "libraryFolder",
					placeholder: "Vault root",
					includeRoot: true,
				},
			},
			{
				name: "Homepage by default",
				desc: "When on, open the library grid when Obsidian starts. Off by default.",
				control: { type: "toggle" as const, key: "openOnStartup" },
			},
			{
				name: "Homepage button on new tab",
				desc: "When on, show an Open Pegasus homepage button on empty/new tabs. On by default.",
				control: { type: "toggle" as const, key: "showHomepageButtonOnNewTab" },
			},
			{
				name: "Action label",
				desc: "Button text on item cards. A collection folder note can override this with an action property.",
				control: {
					type: "text" as const,
					key: "actionLabel",
					placeholder: DEFAULT_SETTINGS.actionLabel,
				},
			},
		];
	}

	getControlValue(key: string): unknown {
		// ninja: we store vault root as ""; the 1.13 folder control represents root as "/".
		if (key === "libraryFolder") {
			const path = this.plugin.settings.libraryFolder;
			return path === "" ? "/" : path;
		}
		return this.plugin.settings[key as keyof MediaTrackerSettings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		switch (key) {
			case "libraryFolder":
				this.plugin.settings.libraryFolder = normalizeLibraryFolder(value);
				break;
			case "openOnStartup":
				this.plugin.settings.openOnStartup = value === true;
				break;
			case "showHomepageButtonOnNewTab":
				this.plugin.settings.showHomepageButtonOnNewTab = value === true;
				break;
			case "actionLabel":
				this.plugin.settings.actionLabel = normalizeActionLabel(value);
				break;
			default:
				return;
		}
		await this.plugin.saveSettings();
	}
}

function normalizeLibraryFolder(value: unknown): string {
	if (typeof value !== "string") return "";
	if (value === "/" || value === "") return "";
	return value.replace(/^\/+|\/+$/g, "");
}

function normalizeActionLabel(value: unknown): string {
	if (typeof value !== "string") return DEFAULT_SETTINGS.actionLabel;
	const trimmed = value.trim();
	return trimmed === "" ? DEFAULT_SETTINGS.actionLabel : trimmed;
}
