// Whether the README and the product's website position it the same way: the website's headline (its <title>,
// og:title or first <h1>) should use the README H1's wording, and the website's description should use the words of
// the README's opening paragraph. Pure: the page's HTML comes in, fetched elsewhere (src/website.ts).
import { fencedLines, firstH1, lines, plainText } from "./markdown";
import { normalise } from "./tagline";

/** The share of the website description's key words that the README's pitch must also use, for full points. */
export const WEBSITE_PITCH_MIN_OVERLAP = 0.5;
/** How many words of the README count as its pitch: the opening paragraphs after the H1, before the first section. */
export const README_PITCH_WORDS = 120;
/** Words left out of the comparison: too common to say anything about positioning. */
export const STOPWORDS = new Set(
	"a about after all also an and any are as at be been but by can do does each every for from get gets has have how if in into is it its just like make makes more most no not now of on one only or other our out over so than that the their them then there these they this to too up us use uses using was we what when where which while who why will with without you your yours".split(
		" ",
	),
);

export interface Website {
	/** The address it was read from, after redirects. */
	url: string;
	title: string | null;
	ogTitle: string | null;
	description: string | null;
	ogDescription: string | null;
	h1: string | null;
}

const decode = (s: string) =>
	s
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;|&apos;/g, "'")
		.replace(/&nbsp;/g, " ")
		.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
		.replace(/\s+/g, " ")
		.trim();

function meta(
	html: string,
	attr: "name" | "property",
	key: string,
): string | null {
	for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
		const k = new RegExp(`\\b${attr}\\s*=\\s*["']${key}["']`, "i");
		if (!k.test(tag)) continue;
		const c = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
		if (c) return decode(c[1] ?? c[2]) || null;
	}
	return null;
}

/** The parts of a page's <head> and body that position it. */
export function readWebsite(html: string, url: string): Website {
	const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
	const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
	return {
		url,
		title: title ? decode(title.replace(/<[^>]+>/g, " ")) || null : null,
		ogTitle: meta(html, "property", "og:title"),
		description: meta(html, "name", "description"),
		ogDescription: meta(html, "property", "og:description"),
		h1: h1 ? decode(h1.replace(/<[^>]+>/g, " ")) || null : null,
	};
}

/** A title and its parts around the separators sites put between the product and the pitch: "|", " - ", "—", "·", ":". */
export const titleParts = (title: string) => [
	title,
	...title
		.split(/\s+[|·—–-]\s+|\s*\|\s*|:\s+/)
		.map((p) => p.trim())
		.filter(Boolean),
];

/** The website's headlines to compare, in order: og:title, <title>, <h1>, each whole and in parts. */
export const headlines = (w: Website) =>
	[w.ogTitle, w.title, w.h1]
		.filter((t): t is string => Boolean(t))
		.flatMap(titleParts);

/**
 * Whether the website's headline says what the README H1 says: some headline, normalised the way taglines are, equals
 * the H1's wording, or one holds the other whole when both have at least three words.
 */
export function headlineMatch(
	readmeH1: string,
	website: Website,
	names: string[],
): string | null {
	const want = normalise(readmeH1, names);
	if (!want) return null;
	for (const h of headlines(website)) {
		const got = normalise(h, names);
		if (!got) continue;
		if (got === want) return h;
		const enough = got.split(" ").length >= 3 && want.split(" ").length >= 3;
		if (
			enough &&
			(` ${got} `.includes(` ${want} `) || ` ${want} `.includes(` ${got} `))
		)
			return h;
	}
	return null;
}

const wordCount = (t: string) =>
	t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** A line that is mostly links: a navigation row or a row of language links, not part of the pitch. */
export function isLinkRow(line: string): boolean {
	const all = wordCount(plainText(line.replace(/<[^>]+>/g, " ")));
	const linked = [...line.matchAll(/\[([^\]]*)\]\([^)]*\)/g)].reduce(
		(n, m) => n + wordCount(plainText(m[1])),
		0,
	);
	return all > 0 && linked / all >= LINK_ROW_SHARE;
}

/** A line whose words are at least this share link text is a row of links. */
export const LINK_ROW_SHARE = 0.6;

/**
 * The README's pitch: the H1 and the prose after it, up to the next heading or code block; when there is no prose
 * before the first section, that section's opening prose.
 */
export function readmePitch(markdown: string): { text: string; line: number } {
	const all = lines(markdown);
	const fenced = fencedLines(markdown);
	const out: string[] = [];
	let prose = 0;
	let start = 0;
	let seenH1 = false;
	for (let i = 0; i < all.length; i++) {
		const l = all[i];
		const heading = /^#{1,6}\s/.test(l) || /^ {0,3}(=+|-+)\s*$/.test(l);
		// With no prose before the first section, the pitch is that section's opening ("What is X?").
		if (fenced[i] || heading) {
			if (heading && /^#\s/.test(l) && !seenH1) {
				seenH1 = true;
				out.push(l.replace(/^#\s+/, ""));
				start ||= i + 1;
				continue;
			}
			if (prose) break;
			continue;
		}
		if (!l.trim() || isLinkRow(l)) continue;
		const text = plainText(l.replace(/<[^>]+>/g, " "));
		if (!/\p{L}/u.test(text)) continue;
		start ||= i + 1;
		prose++;
		out.push(text);
		if (out.join(" ").split(/\s+/).length >= README_PITCH_WORDS) break;
	}
	const h1 = firstH1(markdown);
	if (h1 && !seenH1) out.unshift(h1);
	return {
		text: out.join(" ").split(/\s+/).slice(0, README_PITCH_WORDS).join(" "),
		line: start || 1,
	};
}

/** The words that carry meaning: lower case, at least three letters, stopwords and the project's names left out. */
export function keyWords(text: string, names: string[] = []): string[] {
	const drop = new Set(names.flatMap((n) => n.split(/[^\p{L}\p{N}]+/u)));
	const seen = new Set<string>();
	for (const w of String(text)
		.toLowerCase()
		.replace(/https?:\/\/\S+/g, " ")
		.split(/[^\p{L}\p{N}]+/u)) {
		const word = w.replace(/(?<=\p{L}{3})s$/u, "");
		if (
			word.length >= 3 &&
			/\p{L}/u.test(word) &&
			!STOPWORDS.has(w) &&
			!drop.has(word) &&
			!drop.has(w)
		)
			seen.add(word);
	}
	return [...seen];
}

/** How much of the website's description the README's pitch also says, and the words only one side uses. */
export function pitchOverlap(
	readme: string,
	websiteText: string,
	names: string[] = [],
): { share: number; onlyWebsite: string[]; onlyReadme: string[] } {
	const r = new Set(keyWords(readme, names));
	const w = keyWords(websiteText, names);
	const shared = w.filter((x) => r.has(x));
	return {
		share: w.length ? shared.length / w.length : 0,
		onlyWebsite: w.filter((x) => !r.has(x)),
		onlyReadme: [...r].filter((x) => !w.includes(x)),
	};
}
