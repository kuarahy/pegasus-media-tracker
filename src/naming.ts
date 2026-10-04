const TRAILING_NUMBER = /(\d+)\s*$/;

interface ParsedIssue {
	n: number;
	prefix: string;
	width: number;
}

// ninja: trailing digits plus the text in front is the user's scheme (space, ., v, Volume, …). A # prefix is cloned only when all existing files already use it.
export function parseIssueNumber(basename: string): number | null {
	return parseIssue(basename)?.n ?? null;
}

export function nextIssueNumber(basenames: string[]): number {
	let max = 0;
	for (const name of basenames) {
		const n = parseIssueNumber(name);
		if (n !== null && n > max) max = n;
	}
	return max + 1;
}

export function nextNoteBasename(existingBasenames: string[], collectionTitle: string): string {
	const taken = new Set(existingBasenames);
	const occupied = new Set<number>();
	let best: ParsedIssue | null = null;
	for (const name of existingBasenames) {
		const parsed = parseIssue(name);
		if (!parsed) continue;
		occupied.add(parsed.n);
		if (!best || parsed.n > best.n || (parsed.n === best.n && prefersPrefix(parsed, best))) {
			best = parsed;
		}
	}
	const prefix = best?.prefix ?? `${collectionTitle} `;
	const width = best?.width ?? 1;
	let n = (best?.n ?? 0) + 1;
	let candidate = formatIssue(prefix, n, width);
	while (occupied.has(n) || taken.has(candidate)) {
		n += 1;
		candidate = formatIssue(prefix, n, width);
	}
	return candidate;
}

// ninja: in a mixed folder (partial migration), prefer the no-# prefix so Add Next stops propagating #.
function prefersPrefix(candidate: ParsedIssue, current: ParsedIssue): boolean {
	const candidateHash = candidate.prefix.includes("#");
	const currentHash = current.prefix.includes("#");
	return !candidateHash && currentHash;
}

function parseIssue(basename: string): ParsedIssue | null {
	const match = basename.match(TRAILING_NUMBER);
	if (!match || match.index === undefined) return null;
	const digits = match[1];
	if (digits === undefined) return null;
	const n = Number(digits);
	if (!Number.isFinite(n)) return null;
	return { n, prefix: basename.slice(0, match.index), width: digits.length };
}

function formatIssue(prefix: string, n: number, width: number): string {
	const body = width > 1 ? String(n).padStart(width, "0") : String(n);
	return `${prefix}${body}`;
}
