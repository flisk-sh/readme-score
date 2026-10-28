// Markdown reading shared by the checks: fenced code, headings with GitHub's anchors, and link targets. Line numbers
// are 1-based, the way an editor and GitHub's #L links count them. Ported from Flisk's scoreboard (scripts/scores/ in
// flisk-sh/flisk), so the same README gives the same numbers here and there.
import path from "node:path";

export const lines = (markdown: string) => String(markdown).split("\n");

export interface CodeBlock {
	lang: string;
	/** The line the body starts on (the line after the opening fence). */
	line: number;
	body: string;
}

/** Fenced code blocks, with the line their body starts on. A fence left open at the end is not a block. */
export function codeBlocks(markdown: string): CodeBlock[] {
	const blocks: CodeBlock[] = [];
	const all = lines(markdown);
	let open: {
		fence: string;
		lang: string;
		line: number;
		body: string[];
	} | null = null;
	for (let i = 0; i < all.length; i++) {
		const fence = /^\s*(```+|~~~+)\s*([\w-]*)/.exec(all[i]);
		if (!open && fence)
			open = {
				fence: fence[1],
				lang: fence[2].toLowerCase(),
				line: i + 2,
				body: [],
			};
		else if (open && all[i].trim().startsWith(open.fence)) {
			blocks.push({
				lang: open.lang,
				line: open.line,
				body: open.body.join("\n"),
			});
			open = null;
		} else if (open) open.body.push(all[i]);
	}
	return blocks;
}

/** For each line, whether it is inside a fenced code block or is a fence itself. */
export function fencedLines(markdown: string): boolean[] {
	let fence: string | null = null;
	return lines(markdown).map((line) => {
		const f = /^\s*(```+|~~~+)/.exec(line);
		if (f) {
			if (!fence) fence = f[1];
			else if (line.trim().startsWith(fence)) fence = null;
			return true;
		}
		return fence !== null;
	});
}

/** A line of text that the next line, `===`, underlines into a level-1 heading (Setext). */
export const isSetextH1 = (line: string, next: string | undefined) =>
	next !== undefined &&
	/^ {0,3}=+\s*$/.test(next) &&
	line.trim() !== "" &&
	!NOT_PARAGRAPH.test(line);

/** The first level-1 heading outside code fences (`# Title`, Title over ===, or <h1>), or null. */
export function firstH1(markdown: string): string | null {
	const fenced = fencedLines(markdown);
	const all = lines(markdown);
	for (let i = 0; i < all.length; i++) {
		if (fenced[i]) continue;
		const h =
			/^#\s+(.+?)(?:\s+#+)?\s*$/.exec(all[i]) ??
			/<h1\b[^>]*>(.*?)<\/h1>/i.exec(all[i]);
		if (h) return h[1].trim();
		if (!fenced[i + 1] && isSetextH1(all[i], all[i + 1])) return all[i].trim();
	}
	return null;
}

/** The text a heading shows: images and HTML tags dropped, links reduced to their text, code and emphasis marks gone. */
export function plainText(markdown: string): string {
	return String(markdown)
		.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
		.replace(/<[^>]+>/g, "")
		.replace(/`+/g, "")
		.replace(/(\*\*|__)(.+?)\1/g, "$2")
		.replace(/(^|\W)[*_](\S(?:.*?\S)?)[*_](?=\W|$)/g, "$1$2")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&nbsp;/g, " ")
		.trim();
}

/** GitHub's anchor for a heading's text (github-slugger): lower case, punctuation and emoji dropped, spaces to hyphens. */
export const slugBase = (text: string) =>
	text
		.toLowerCase()
		.replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "")
		.replace(/ /g, "-");

/** Numbers repeated anchors the way GitHub does: intro, intro-1, intro-2. */
export class Slugger {
	private occurrences = new Map<string, number>();

	slug(text: string): string {
		const original = slugBase(text);
		let result = original;
		while (this.occurrences.has(result)) {
			const n = (this.occurrences.get(original) ?? 0) + 1;
			this.occurrences.set(original, n);
			result = `${original}-${n}`;
		}
		this.occurrences.set(result, 0);
		return result;
	}
}

export interface Heading {
	line: number;
	level: number;
	/** The text it shows. */
	text: string;
	/** GitHub's anchor for it, without the #. */
	slug: string;
}

const SETEXT = /^ {0,3}(=+|-+)\s*$/;
const NOT_PARAGRAPH = /^\s*(?:[-*+]\s|\d+[.)]\s|>|\||#|<|```|~~~)/;

/** Every heading outside code: `# ATX`, Setext (a line underlined with === or ---) and <h1>…<h6> on one line. */
export function headings(markdown: string): Heading[] {
	const all = lines(markdown);
	const fenced = fencedLines(markdown);
	const slugger = new Slugger();
	const out: Heading[] = [];
	for (let i = 0; i < all.length; i++) {
		if (fenced[i]) continue;
		const line = all[i];
		const atx = /^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(line);
		const html = /<h([1-6])\b[^>]*>(.*?)<\/h\1>/i.exec(line);
		const next = all[i + 1];
		let level = 0;
		let raw = "";
		if (atx) [level, raw] = [atx[1].length, atx[2]];
		else if (html) [level, raw] = [Number(html[1]), html[2]];
		else if (
			next !== undefined &&
			!fenced[i + 1] &&
			SETEXT.test(next) &&
			line.trim() &&
			!NOT_PARAGRAPH.test(line) &&
			(i === 0 ||
				!all[i - 1].trim() ||
				/^#|^ {0,3}(=+|-+)\s*$/.test(all[i - 1]))
		)
			[level, raw] = [next.trim().startsWith("=") ? 1 : 2, line.trim()];
		if (!level) continue;
		const text = plainText(raw);
		out.push({ line: i + 1, level, text, slug: slugger.slug(text) });
		if (!atx && !html) i++;
	}
	return out;
}

/**
 * The text with fenced code blocks and inline code spans blanked out, so offsets and line numbers stay where they were.
 * Links inside code are examples, not links.
 */
export function withoutCode(markdown: string): string {
	const fenced = fencedLines(markdown);
	return lines(markdown)
		.map((line, i) =>
			fenced[i]
				? ""
				: line.replace(/(`+)(?:(?!\1).)+?\1/g, (span) =>
						" ".repeat(span.length),
					),
		)
		.join("\n");
}

const LINK_FORMS = [
	// [text](target) and ![alt](target), the target bare or in <angle brackets>, an optional "title" after it.
	/\]\(\s*(<[^>\n]*>|[^)\s]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*\)/g,
	// [id]: target, a reference definition at the start of a line.
	/^ {0,3}\[[^\]\n]+\]:\s*(<[^>\n]*>|\S+)/gm,
	// <a href="target"> and <img src="target">.
	/<(?:a|img)\b[^>]*?\s(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
];

export interface Link {
	line: number;
	target: string;
}

/** Every link target in a document, in document order. */
export function links(markdown: string): Link[] {
	const text = withoutCode(markdown);
	const out: (Link & { at: number })[] = [];
	for (const re of LINK_FORMS)
		for (const m of text.matchAll(re)) {
			const target = (m[1] ?? m[2] ?? "").replace(/^<|>$/g, "");
			const at = m.index ?? 0;
			out.push({ at, line: text.slice(0, at).split("\n").length, target });
		}
	return out
		.sort((a, b) => a.at - b.at)
		.map(({ line, target }) => ({ line, target }));
}

/** Ids a link can jump to besides headings: <a id>, <a name> and any id="" on an HTML tag outside code. */
export function htmlAnchors(markdown: string): Set<string> {
	const text = withoutCode(markdown);
	return new Set(
		[
			...text.matchAll(
				/<[a-z][^>]*?\s(?:id|name)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi,
			),
		].map((m) => (m[1] ?? m[2]).toLowerCase()),
	);
}

/**
 * The repo path a link points at, or null when it is not a relative link: a URL with a scheme (https:, mailto:, ...)
 * or a //host, an #anchor alone, or a template ({{ }}, <placeholder>, ${var}). The path resolves against the file's
 * folder, or the repo root when it starts with `/`, the way GitHub renders it.
 */
export function linkPath(file: string, target: string): string | null {
	const t = target.trim();
	if (
		!t ||
		t.startsWith("#") ||
		/^[a-z][a-z0-9+.-]*:/i.test(t) ||
		t.startsWith("//")
	)
		return null;
	if (/\{\{|<|>|\$\{/.test(t)) return null;
	let p = t.replace(/[?#].*$/, "");
	if (!p) return null;
	try {
		p = decodeURIComponent(p);
	} catch {
		// A stray % stays as written.
	}
	return p.startsWith("/")
		? path.posix.normalize(p.slice(1))
		: path.posix.join(path.posix.dirname(file), p);
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
