// ninja: view type matches plugin id; workspace.json would keep a second identity if we left media-tracker.
export const VIEW_TYPE_MEDIA_TRACKER = "pegasus-media-tracker";

export type LibraryNode = CollectionNode | ItemNode;

export interface CollectionNode {
	kind: "collection";
	/** Card / breadcrumb label (`title` on Cover.md, else folder name). */
	name: string;
	path: string;
}

export interface ItemNode {
	kind: "item";
	name: string;
	path: string;
	done: boolean;
	own: boolean;
	/** null = not set; card falls back to parseTitleParts heuristic on the filename. */
	subtitle: string | null;
}

export interface BreadcrumbSegment {
	name: string;
	path: string;
}
