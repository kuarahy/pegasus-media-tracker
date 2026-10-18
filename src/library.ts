import { App, TFile, TFolder } from "obsidian";
import type { BreadcrumbSegment, ItemNode, LibraryNode } from "./types";

export function getFolderByPath(app: App, path: string): TFolder | null {
	const normalized = normalizeFolderPath(path);
	if (normalized === "") return app.vault.getRoot();
	const found = app.vault.getAbstractFileByPath(normalized);
	return found instanceof TFolder ? found : null;
}

export function normalizeFolderPath(path: string): string {
	if (path === "/" || path === "") return "";
	return path.replace(/^\/+|\/+$/g, "");
}

export function isPathInLibrary(path: string, libraryFolder: string): boolean {
	const root = normalizeFolderPath(libraryFolder);
	const target = normalizeFolderPath(path);
	if (root === "") return true;
	return target === root || target.startsWith(`${root}/`);
}

// ninja: library root is the same path as settings.libraryFolder (startup lands here).
export function isLibraryRoot(folderPath: string, libraryFolder: string): boolean {
	return normalizeFolderPath(folderPath) === normalizeFolderPath(libraryFolder);
}

export const COVER_FOLDER = "assets/covers";
export const COVER_NOTE_STEM = "Cover";

const HIDDEN_COLLECTION_FOLDERS = new Set(["assets", "covers"]);

export function isHiddenCollectionFolder(name: string): boolean {
	return HIDDEN_COLLECTION_FOLDERS.has(name.toLowerCase());
}

export function isFolderNote(file: TFile, folder: TFolder): boolean {
	if (file.extension !== "md") return false;
	const stem = markdownStem(file);
	// ninja: Cover.md is the cover note; {folder}.md is the old name and still hides as metadata.
	return stem === COVER_NOTE_STEM || stem === folder.name;
}

export function isParentCollection(folder: TFolder): boolean {
	return folder.children.some(
		(child) => child instanceof TFolder && !isHiddenCollectionFolder(child.name),
	);
}

export function addToolbarMode(
	folder: TFolder | null,
	libraryFolder: string,
): "create-folder" | "add-new" | "add-next" {
	if (!folder) return "create-folder";
	if (isParentCollection(folder)) return "add-new";
	const folderPath = normalizeFolderPath(folder.path === "/" ? "" : folder.path);
	if (isLibraryRoot(folderPath, libraryFolder)) return "add-new";
	// ninja: Comics, Covers Collection, etc. are libraries even when they only contain notes.
	if (isImmediateLibraryChild(folderPath, libraryFolder)) return "add-new";
	return "add-next";
}

function isImmediateLibraryChild(folderPath: string, libraryFolder: string): boolean {
	const root = normalizeFolderPath(libraryFolder);
	const path = normalizeFolderPath(folderPath);
	if (path === "" || path === root) return false;
	if (root === "") return !path.includes("/");
	if (!path.startsWith(`${root}/`)) return false;
	return !path.slice(root.length + 1).includes("/");
}

export function findFolderNote(folder: TFolder): TFile | null {
	let legacy: TFile | null = null;
	for (const child of folder.children) {
		if (!(child instanceof TFile) || child.extension !== "md") continue;
		const stem = markdownStem(child);
		if (stem === COVER_NOTE_STEM) return child;
		if (stem === folder.name) legacy = child;
	}
	if (legacy) return legacy;
	const parent = folder.parent;
	if (!parent) return null;
	for (const child of parent.children) {
		if (child instanceof TFile && child.extension === "md" && markdownStem(child) === folder.name) {
			return child;
		}
	}
	return null;
}

export function readDone(app: App, file: TFile): boolean {
	const done = readFrontmatterField(app, file, "done");
	return done === true || done === "true";
}

// ninja: mirrors readDone exactly — truthy-check on true and "true" so both YAML
// boolean true and any serialiser that quotes booleans work without extra guards.
export function readOwn(app: App, file: TFile): boolean {
	const own = readFrontmatterField(app, file, "own");
	return own === true || own === "true";
}

// ninja: normalises whitespace and treats blank strings as absent, consistent with
// readCollectionTitle's empty-string guard. typeof guard covers numbers, booleans,
// arrays, and objects safely — no additional assertion needed.
export function readSubtitle(app: App, file: TFile): string | null {
	const subtitle = readFrontmatterField(app, file, "subtitle");
	if (typeof subtitle !== "string") return null;
	const trimmed = subtitle.trim();
	return trimmed === "" ? null : trimmed;
}

export function readActionLabel(app: App, folder: TFolder, fallback: string): string {
	const note = findFolderNote(folder);
	if (!note) return fallback;
	const action = readFrontmatterField(app, note, "action");
	if (typeof action !== "string") return fallback;
	const trimmed = action.trim();
	return trimmed === "" ? fallback : trimmed;
}

// ninja: Cover.md `title` is the card label; folder.name is only the path slug.
export function readCollectionTitle(app: App, folder: TFolder): string {
	const note = findFolderNote(folder);
	if (!note) return folder.name;
	const title = readFrontmatterField(app, note, "title");
	if (typeof title !== "string") return folder.name;
	const trimmed = title.trim();
	return trimmed === "" ? folder.name : trimmed;
}

// ninja: FrontMatterCache values are any; Record<string, unknown> is the shape the review scanner accepts.
export function readFrontmatterField(app: App, file: TFile, key: string): unknown {
	const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
	if (frontmatter === undefined) return undefined;
	return (frontmatter as Record<string, unknown>)[key];
}

export function listItemBasenames(folder: TFolder): string[] {
	const names: string[] = [];
	for (const child of folder.children) {
		if (child instanceof TFile && child.extension === "md" && !isFolderNote(child, folder)) {
			// ninja: stem from `name`, not `basename` — Obsidian splits wikilinks on `#`.
			names.push(markdownStem(child));
		}
	}
	return names;
}

export function listChildren(app: App, folder: TFolder): LibraryNode[] {
	const nodes: LibraryNode[] = [];
	const children = [...folder.children].sort((a, b) =>
		a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
	);

	for (const child of children) {
		if (child instanceof TFolder) {
			if (isHiddenCollectionFolder(child.name)) continue;
			nodes.push({ kind: "collection", name: readCollectionTitle(app, child), path: child.path });
			continue;
		}
		if (child instanceof TFile && child.extension === "md" && !isFolderNote(child, folder)) {
			nodes.push({
				kind: "item",
				name: markdownStem(child),
				path: child.path,
				done: readDone(app, child),
				own: readOwn(app, child),
				subtitle: readSubtitle(app, child),
			} satisfies ItemNode);
		}
	}

	return nodes;
}

export function breadcrumbSegments(app: App, folderPath: string, libraryFolder: string): BreadcrumbSegment[] {
	const root = normalizeFolderPath(libraryFolder);
	const current = normalizeFolderPath(folderPath);
	const rootFolder = getFolderByPath(app, root);
	const rootName =
		root === "" ? "Library" : rootFolder ? readCollectionTitle(app, rootFolder) : (root.split("/").pop() ?? root);
	const segments: BreadcrumbSegment[] = [{ name: rootName, path: root }];

	if (current === root) return segments;

	const rest = root === "" ? current : current.startsWith(`${root}/`) ? current.slice(root.length + 1) : current;
	let acc = root;
	for (const part of rest.split("/").filter(Boolean)) {
		acc = acc === "" ? part : `${acc}/${part}`;
		const folder = getFolderByPath(app, acc);
		segments.push({ name: folder ? readCollectionTitle(app, folder) : part, path: acc });
	}
	return segments;
}

function markdownStem(file: TFile): string {
	// ninja: `name` minus .md — TFile.basename splits on `#`, so Saga #5 would look like Saga.
	return file.name.replace(/\.md$/i, "");
}
