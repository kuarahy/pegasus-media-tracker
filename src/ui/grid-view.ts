import { ItemView, Notice, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import { createCollection, createNextNote, ensureCoverNote, ensureFolder, setCollectionTitle, setCoverOnNote, toggleItemDone } from "../actions";
import { resolveCollectionCover, resolveItemCover } from "../cover";
import {
	addToolbarMode,
	breadcrumbSegments,
	getFolderByPath,
	isLibraryRoot,
	isPathInLibrary,
	listChildren,
	readActionLabel,
	readCollectionTitle,
} from "../library";
import type { MediaTrackerPluginApi } from "../settings";
import type { ItemNode, LibraryNode } from "../types";
import { VIEW_TYPE_MEDIA_TRACKER } from "../types";
import { applyItemDoneState, createCollectionCard, createItemCard } from "./cards";
import { promptForCover, promptForName } from "./name-modal";

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

	constructor(leaf: WorkspaceLeaf, plugin: MediaTrackerPluginApi) {
		super(leaf);
		this.plugin = plugin;
		this.currentFolderPath = plugin.settings.libraryFolder;
	}

	getViewType(): string {
		return VIEW_TYPE_MEDIA_TRACKER;
	}

	getDisplayText(): string {
		return "Pegasus Media Tracker";
	}

	getIcon(): string {
		return "layout-grid";
	}

	async onOpen(): Promise<void> {
		this.registerLibraryListeners();
		this.registerZoomListeners();
		this.registerHistoryListeners();
		await this.plugin.ensureRootCoversRelocated();
		this.render();
	}

	async onClose(): Promise<void> {
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		this.clearDebounce();
	}

	openFolder(path: string): void {
		this.navigate(path, true);
	}

	openHomepage(): void {
		this.navigate(this.plugin.settings.libraryFolder, false);
	}

	// ninja: in-view stack, not workspace leaf history. Opening a note is not a step.
	private navigate(path: string, record: boolean): void {
		if (path === this.currentFolderPath) {
			this.render();
			return;
		}
		if (record) {
			this.past.push(this.currentFolderPath);
			if (this.past.length > HISTORY_CAP) this.past.shift();
			this.future = [];
		}
		this.currentFolderPath = path;
		this.render();
	}

	private goBack(): void {
		const prev = this.past.pop();
		if (prev === undefined) return;
		this.future.push(this.currentFolderPath);
		if (this.future.length > HISTORY_CAP) this.future.shift();
		this.currentFolderPath = prev;
		this.render();
	}

	private goForward(): void {
		const next = this.future.pop();
		if (next === undefined) return;
		this.past.push(this.currentFolderPath);
		if (this.past.length > HISTORY_CAP) this.past.shift();
		this.currentFolderPath = next;
		this.render();
	}

	private async openItemNote(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	async addFromToolbar(): Promise<void> {
		try {
			const existed = getFolderByPath(this.app, this.currentFolderPath);
			const folder = await ensureFolder(this.app, this.currentFolderPath);
			const folderPath = folder.path === "/" ? "" : folder.path;
			if (!existed) {
				this.openFolder(folderPath);
				return;
			}

			const mode = addToolbarMode(folder, this.plugin.settings.libraryFolder);
			if (mode === "add-new") {
				const name = await promptForName(this.app, {
					title: "New collection",
					placeholder: "Collection name",
					confirm: "Create",
				});
				if (name === null) return;
				await createCollection(this.app, folder, name);
			} else {
				await createNextNote(this.app, folder);
			}
			this.openFolder(folderPath);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Could not add to this collection.";
			new Notice(message);
		}
	}

	render(): void {
		const libraryPath = this.plugin.settings.libraryFolder;
		if (!isPathInLibrary(this.currentFolderPath, libraryPath)) {
			this.currentFolderPath = libraryPath;
		}

		const root = this.contentEl;
		root.empty();
		root.addClass("media-tracker-view");

		const folder = getFolderByPath(this.app, this.currentFolderPath);
		const mode = addToolbarMode(folder, libraryPath);
		this.renderToolbar(root, mode, folder !== null);

		if (!folder) {
			this.renderMessage(
				root,
				`Library folder ${libraryLabel(libraryPath)} was not found.`,
				"Create it with Create folder, or pick another folder in settings.",
			);
			return;
		}

		const nodes = listChildren(this.app, folder);
		if (nodes.length === 0) {
			this.renderMessage(
				root,
				"This collection is empty.",
				mode === "add-new"
					? "Add New creates a collection folder and a Cover note."
					: "Add Next creates the first numbered note.",
			);
			this.applyGridColumns();
			return;
		}

		const actionLabel = readActionLabel(this.app, folder, this.plugin.settings.actionLabel);
		const grid = root.createDiv({ cls: "media-tracker-grid" });
		this.renderCards(grid, nodes, actionLabel, mode === "add-next");
		this.applyGridColumns();
	}

	private renderCards(
		parent: HTMLElement,
		nodes: LibraryNode[],
		actionLabel: string,
		showAction: boolean,
	): void {
		for (const node of nodes) {
			if (node.kind === "collection") {
				createCollectionCard(parent, {
					name: node.name,
					coverSrc: resolveCollectionCover(this.app, node.path),
					onOpen: () => this.openFolder(node.path),
				});
				continue;
			}
			createItemCard(parent, {
				name: node.name,
				path: node.path,
				coverSrc: resolveItemCover(this.app, node.path),
				done: node.done,
				own: node.own,
				subtitle: node.subtitle,
				actionLabel,
				showAction,
				onOpen: () => void this.openItemNote(node.path),
				onToggle: (card) => void this.onToggleDone(node, card, actionLabel),
			});
		}
	}

	private async onToggleDone(node: ItemNode, card: HTMLElement, actionLabel: string): Promise<void> {
		const next = await toggleItemDone(this.app, node.path);
		if (next === null) return;
		node.done = next;
		applyItemDoneState(card, next, actionLabel);
	}

	private async onChangeTitle(): Promise<void> {
		if (isLibraryRoot(this.currentFolderPath, this.plugin.settings.libraryFolder)) return;
		const folder = getFolderByPath(this.app, this.currentFolderPath);
		if (!folder) return;
		try {
			const note = await ensureCoverNote(this.app, folder);
			const name = await promptForName(this.app, {
				title: "Change title",
				placeholder: "Collection title",
				confirm: "Save",
				value: readCollectionTitle(this.app, folder),
			});
			if (name === null) return;
			await setCollectionTitle(this.app, note, name);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Could not change the title.";
			new Notice(message);
		}
	}

	private async onChangeCover(): Promise<void> {
		const folder = getFolderByPath(this.app, this.currentFolderPath);
		if (!folder) return;
		try {
			const note = await ensureCoverNote(this.app, folder);
			const result = await promptForCover(this.app);
			if (result === null) return;
			if (result.action === "set") {
				await setCoverOnNote(this.app, note, result.value);
			}
			await this.openItemNote(note.path);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Could not change the cover.";
			new Notice(message);
		}
	}

	private renderToolbar(
		root: HTMLElement,
		mode: ReturnType<typeof addToolbarMode>,
		folderExists: boolean,
	): void {
		const toolbar = root.createDiv({ cls: "media-tracker-toolbar" });
		const crumbs = toolbar.createDiv({ cls: "media-tracker-breadcrumb" });
		const segments = breadcrumbSegments(this.app, this.currentFolderPath, this.plugin.settings.libraryFolder);

		segments.forEach((segment, index) => {
			if (index > 0) {
				crumbs.createSpan({ cls: "media-tracker-breadcrumb-sep", text: "/" });
			}
			const isLast = index === segments.length - 1;
			if (isLast) {
				crumbs.createSpan({ cls: "media-tracker-breadcrumb-current", text: segment.name });
				return;
			}
			const link = crumbs.createEl("button", {
				cls: "media-tracker-breadcrumb-link",
				text: segment.name,
			});
			link.addEventListener("click", () => this.openFolder(segment.path));
		});

		// ninja: grouped so the pair wraps to a new line together instead of splitting apart.
		const zoomGroup = toolbar.createDiv({ cls: "media-tracker-zoom-group" });
		const zoomOut = zoomGroup.createEl("button", {
			cls: "media-tracker-zoom",
			text: "−",
			attr: { "aria-label": "Zoom out" },
		});
		zoomOut.addEventListener("click", () => void this.zoom(1));
		const zoomIn = zoomGroup.createEl("button", {
			cls: "media-tracker-zoom",
			text: "+",
			attr: { "aria-label": "Zoom in" },
		});
		zoomIn.addEventListener("click", () => void this.zoom(-1));

		if (folderExists) {
			// ninja: title labels a collection; library root is the scan root, not a child with a parent folder.
			if (!isLibraryRoot(this.currentFolderPath, this.plugin.settings.libraryFolder)) {
				const title = toolbar.createEl("button", {
					cls: "media-tracker-title",
					text: "Change Title",
				});
				title.addEventListener("click", () => void this.onChangeTitle());
			}
			const cover = toolbar.createEl("button", {
				cls: "media-tracker-cover",
				text: "Change Cover",
			});
			cover.addEventListener("click", () => void this.onChangeCover());
		}

		const add = toolbar.createEl("button", {
			cls: "media-tracker-add",
			text: toolbarLabel(mode),
		});
		add.addEventListener("click", () => void this.addFromToolbar());
	}

	private renderMessage(root: HTMLElement, title: string, detail: string): void {
		const empty = root.createDiv({ cls: "media-tracker-empty" });
		empty.createEl("p", { text: title });
		empty.createEl("p", { cls: "media-tracker-empty-detail", text: detail });
	}

	private async zoom(delta: number): Promise<void> {
		const current = this.displayedColumns();
		const next = current + delta;
		if (next < 1) return;
		const max = this.maxColumns();
		if (next > max) return;
		this.plugin.settings.gridColumns = next;
		this.applyGridColumns();
		await this.plugin.persistSettings();
	}

	private applyGridColumns(): void {
		const columns = this.displayedColumns();
		this.contentEl.style.setProperty("--media-tracker-columns", String(columns));
	}

	private displayedColumns(): number {
		const max = this.maxColumns();
		return Math.min(Math.max(this.plugin.settings.gridColumns, 1), max);
	}

	private maxColumns(): number {
		const sample = this.contentEl.querySelector(".media-tracker-grid");
		const width =
			sample instanceof HTMLElement && sample.clientWidth > 0
				? sample.clientWidth
				: this.contentEl.clientWidth;
		if (width <= 0) return Math.max(1, this.plugin.settings.gridColumns);
		const gap = sample instanceof HTMLElement ? parseGap(sample) : 16;
		return Math.max(1, Math.floor((width + gap) / (MIN_CARD_PX + gap)));
	}

	private registerZoomListeners(): void {
		this.resizeObserver = new ResizeObserver(() => this.applyGridColumns());
		this.resizeObserver.observe(this.contentEl);
		const onWheel = (event: WheelEvent) => {
			if (!event.ctrlKey && !event.metaKey) return;
			event.preventDefault();
			void this.zoom(event.deltaY > 0 ? 1 : -1);
		};
		this.contentEl.addEventListener("wheel", onWheel, { passive: false });
		this.register(() => this.contentEl.removeEventListener("wheel", onWheel));
	}

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
		this.contentEl.addEventListener("mousedown", onMouseDown);
		this.contentEl.addEventListener("mouseup", onMouseUp);
		this.register(() => {
			this.contentEl.removeEventListener("mousedown", onMouseDown);
			this.contentEl.removeEventListener("mouseup", onMouseUp);
		});
	}

	private registerLibraryListeners(): void {
		const onFile = (file: TAbstractFile) => this.scheduleRenderFor(file.path);
		this.registerEvent(this.app.vault.on("create", onFile));
		this.registerEvent(this.app.vault.on("modify", onFile));
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (
					file.path === this.currentFolderPath ||
					this.currentFolderPath.startsWith(`${file.path}/`)
				) {
					this.currentFolderPath = this.plugin.settings.libraryFolder;
				}
				this.dropHistoryUnder(file.path);
				this.scheduleRenderFor(file.path);
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				const nextPath = file.path === "/" ? "" : file.path;
				if (this.currentFolderPath === oldPath) {
					this.currentFolderPath = nextPath;
				} else if (this.currentFolderPath.startsWith(`${oldPath}/`)) {
					this.currentFolderPath = `${nextPath}${this.currentFolderPath.slice(oldPath.length)}`;
				}
				this.rewriteHistory(oldPath, nextPath);
				this.scheduleRenderFor(file.path);
				this.scheduleRenderFor(oldPath);
			}),
		);
		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => this.scheduleRenderFor(file.path)),
		);
	}

	private dropHistoryUnder(path: string): void {
		const gone = (entry: string) => entry === path || entry.startsWith(`${path}/`);
		this.past = this.past.filter((entry) => !gone(entry));
		this.future = this.future.filter((entry) => !gone(entry));
	}

	private rewriteHistory(oldPath: string, newPath: string): void {
		const rewrite = (entry: string): string => {
			if (entry === oldPath) return newPath;
			if (entry.startsWith(`${oldPath}/`)) return `${newPath}${entry.slice(oldPath.length)}`;
			return entry;
		};
		this.past = this.past.map(rewrite);
		this.future = this.future.map(rewrite);
	}

	private scheduleRenderFor(path: string): void {
		if (!isPathInLibrary(path, this.plugin.settings.libraryFolder)) return;
		this.scheduleRender();
	}

	private scheduleRender(): void {
		this.clearDebounce();
		this.debounceHandle = window.setTimeout(() => {
			this.debounceHandle = null;
			this.render();
		}, 200);
	}

	private clearDebounce(): void {
		if (this.debounceHandle === null) return;
		window.clearTimeout(this.debounceHandle);
		this.debounceHandle = null;
	}
}

function toolbarLabel(mode: ReturnType<typeof addToolbarMode>): string {
	if (mode === "create-folder") return "Create folder";
	if (mode === "add-new") return "Add New";
	return "Add Next";
}

function libraryLabel(libraryFolder: string): string {
	return libraryFolder === "" ? "vault root" : libraryFolder;
}

function parseGap(grid: HTMLElement): number {
	const raw = window.getComputedStyle(grid).columnGap;
	const gap = Number.parseFloat(raw);
	return Number.isFinite(gap) ? gap : 16;
}
