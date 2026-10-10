export function createCollectionCard(
	parent: HTMLElement,
	opts: {
		name: string;
		coverSrc: string | null;
		onOpen: () => void;
	},
): HTMLElement {
	const card = parent.createDiv({ cls: "media-tracker-card media-tracker-card-collection" });
	card.addEventListener("click", opts.onOpen);
	renderCover(card, opts.name, opts.coverSrc);
	card.createDiv({ cls: "media-tracker-card-title", text: opts.name, attr: { title: opts.name } });
	return card;
}

// ninja: anchors to a digit immediately before ` - ` so series names that contain a
// hyphen (e.g., "Spider-Man 5") are never split — only "{series} {n} - {variant}" matches.
const VARIANT_SPLIT = /^(.*\d)\s+-\s+(.+)$/;

function parseTitleParts(name: string): { primary: string; secondary: string } | null {
	const match = name.match(VARIANT_SPLIT);
	// ninja: groups 1 and 2 are always present when the regex matches (both are non-optional
	// capture groups), so the non-null assertions are safe.
	if (!match || !match[1] || !match[2]) return null;
	return { primary: match[1].trimEnd(), secondary: match[2].trimStart() };
}

export function createItemCard(
	parent: HTMLElement,
	opts: {
		name: string;
		path: string;
		coverSrc: string | null;
		done: boolean;
		own: boolean;
		/** null = not set; falls back to parseTitleParts heuristic. */
		subtitle: string | null;
		actionLabel: string;
		onOpen: () => void;
		onToggle: (card: HTMLElement) => void;
		showAction?: boolean;
	},
): HTMLElement {
	const card = parent.createDiv({ cls: "media-tracker-card media-tracker-card-item" });
	card.dataset.path = opts.path;
	card.classList.toggle("is-owned", opts.own);
	card.addEventListener("click", opts.onOpen);
	renderCover(card, opts.name, opts.coverSrc);

	const titleEl = card.createDiv({ cls: "media-tracker-card-title", attr: { title: opts.name } });

	// ninja: explicit subtitle takes priority over the regex fallback. When subtitle is
	// set, primary is the full filename (the user opted out of the heuristic entirely).
	// When subtitle is null, parseTitleParts runs as before — no existing card changes.
	// en dash (\u2013) replaces the hyphen-minus from the filename; tooltip carries the
	// raw filename string for screen readers and hover.
	const secondary = opts.subtitle ?? parseTitleParts(opts.name)?.secondary ?? null;
	const primary = opts.subtitle !== null ? opts.name : (parseTitleParts(opts.name)?.primary ?? null);

	if (secondary !== null && primary !== null) {
		titleEl.createSpan({ cls: "media-tracker-card-title-primary", text: primary });
		titleEl.createSpan({ cls: "media-tracker-card-title-secondary", text: ` \u2013 ${secondary}` });
	} else {
		titleEl.setText(opts.name);
	}
	titleEl.addEventListener("click", (event) => {
		event.stopPropagation();
		opts.onOpen();
	});

	if (opts.showAction === false) return card;

	const button = card.createEl("button", { cls: "media-tracker-card-action" });
	button.addEventListener("click", (event) => {
		event.stopPropagation();
		opts.onToggle(card);
	});

	applyItemDoneState(card, opts.done, opts.actionLabel);
	return card;
}

export function applyItemDoneState(card: HTMLElement, done: boolean, actionLabel: string): void {
	card.classList.toggle("is-done", done);
	const button = card.querySelector(".media-tracker-card-action");
	if (button instanceof HTMLButtonElement) {
		button.setText(actionLabel);
	}
}

function renderCover(card: HTMLElement, name: string, coverSrc: string | null): void {
	const cover = card.createDiv({ cls: "media-tracker-card-cover" });
	if (coverSrc) {
		// ninja: blur layer fills dead space for non-2:3 covers (square, landscape, etc.)
		// without cropping the actual artwork — see styles.css .media-tracker-card-cover-blur
		const blur = cover.createDiv({ cls: "media-tracker-card-cover-blur" });
		blur.style.backgroundImage = `url("${coverSrc}")`;
		cover.createEl("img", { attr: { src: coverSrc, alt: name } });
		return;
	}
	cover.createDiv({ cls: "media-tracker-card-placeholder", text: initials(name) });
}

function initials(name: string): string {
	const parts = name.split(/\s+/).filter(Boolean);
	const first = parts[0]?.[0];
	if (!first) return "?";
	const second = parts.length > 1 ? parts[1]?.[0] : parts[0]?.[1];
	return `${first}${second ?? ""}`.toUpperCase();
}
