// How easy a README is to read, by the Flesch reading ease formula over its prose (code, HTML, tables, link targets
// and images removed). 60 to 70 is plain English; below 30 reads like a research paper. A proxy for how easy the page
// is, not a usability score. Port of Flisk's readme-readability scorer: same prose, same syllable count, same number.
// The findings add what the scorer leaves out: the longest sentences and the first line each jargon word is on.
import { fencedLines, lines, round1 } from "./markdown";

/** Full points at or above this reading ease. */
export const READING_EASE_FULL_MARKS = 60;
/** No points at or below this reading ease; linear in between. */
export const READING_EASE_ZERO = 30;
/** A sentence longer than this many words is listed as one to split. */
export const LONG_SENTENCE_WORDS = 25;
/** How many of the longest sentences a report lists. */
export const LONGEST_SENTENCES_LISTED = 3;

/** Words a newcomer to running software usually does not know. Matched case-insensitively as whole words. */
export const JARGON = [
	"docker",
	"compose",
	"tilt",
	"kubernetes",
	"k8s",
	"helm",
	"traefik",
	"container",
	"containers",
	"cluster",
	"ingress",
	"manifest",
	"yaml",
	"orchestration",
];

const inline = (line: string) =>
	line
		.replace(/`[^`\n]*`/g, " ")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/<[^>]+>/g, " ")
		.replace(/&#?\w+;/g, " ");

const sentenceLine = (l: string) =>
	l
		.replace(/^\s*(#+|[-*+]|\d+\.|>)\s+/, "")
		.replace(/\s+/g, " ")
		.trim();

/**
 * The prose of a markdown document: fenced and inline code, comments, HTML tags, table rows and images removed, links
 * reduced to their text. Each line that does not end in punctuation (a heading, a list item) ends a sentence.
 */
export function prose(markdown: string): string {
	return String(markdown)
		.replace(/^\s*(```+|~~~+)[\s\S]*?^\s*\1\s*$/gm, " ")
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/`[^`\n]*`/g, " ")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/<[^>]+>/g, " ")
		.replace(/&#?\w+;/g, " ")
		.split("\n")
		.filter((l) => !/^\s*\|/.test(l))
		.map(sentenceLine)
		.filter((l) => /[\p{L}]/u.test(l))
		.map((l) => (/[.!?:]$/.test(l) ? l : `${l}.`))
		.join(" ");
}

export const words = (text: string) =>
	text.split(/\s+/).filter((w) => /\p{L}/u.test(w));

/** Syllables of an English word by vowel groups, with a silent final "e" dropped; at least one. */
export function syllables(word: string): number {
	const w = word.toLowerCase().replace(/[^a-z]/g, "");
	if (!w) return 1;
	const groups = w
		.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, "")
		.match(/[aeiouy]+/g);
	return Math.max(1, groups ? groups.length : 0);
}

/** Flesch reading ease of markdown, rounded to one decimal, clamped to 0..100; null when there is no prose. */
export function readingEase(markdown: string): number | null {
	const text = prose(markdown);
	const w = words(text);
	if (!w.length) return null;
	const sentences = Math.max(1, (text.match(/[.!?:]+(?=\s|$)/g) ?? []).length);
	const syl = w.reduce((n, x) => n + syllables(x), 0);
	const ease =
		206.835 - 1.015 * (w.length / sentences) - 84.6 * (syl / w.length);
	return round1(Math.min(100, Math.max(0, ease)));
}

const bare = (w: string) => w.toLowerCase().replace(/[^\p{L}\d]/gu, "");

/** Jargon words in the prose, most frequent first, and their share of all words in percent. */
export function jargon(markdown: string): {
	share: number;
	counts: [string, number][];
} {
	const w = words(prose(markdown)).map(bare);
	const counts = new Map<string, number>();
	for (const x of w)
		if (JARGON.includes(x)) counts.set(x, (counts.get(x) ?? 0) + 1);
	const total = [...counts.values()].reduce((a, b) => a + b, 0);
	return {
		share: w.length ? round1((total / w.length) * 100) : 0,
		counts: [...counts.entries()].sort(
			([a, x], [b, y]) => y - x || a.localeCompare(b),
		),
	};
}

export interface Sentence {
	line: number;
	words: number;
	text: string;
}

/**
 * The prose line by line, for findings that point at a line. Code fences, comments that open and close on one line,
 * and table rows are skipped, as prose() skips them. Each line is one or more sentences, as in prose().
 */
export function proseLines(markdown: string): { line: number; text: string }[] {
	const fenced = fencedLines(markdown);
	let comment = false;
	const out: { line: number; text: string }[] = [];
	lines(markdown).forEach((raw, i) => {
		if (fenced[i]) return;
		let l = raw.replace(/<!--[\s\S]*?-->/g, " ");
		if (comment) {
			if (!l.includes("-->")) return;
			l = l.slice(l.indexOf("-->") + 3);
			comment = false;
		}
		if (l.includes("<!--")) {
			l = l.slice(0, l.indexOf("<!--"));
			comment = true;
		}
		if (/^\s*\|/.test(l)) return;
		const text = sentenceLine(inline(l));
		if (/\p{L}/u.test(text)) out.push({ line: i + 1, text });
	});
	return out;
}

/** The longest sentences over LONG_SENTENCE_WORDS words, longest first, ties in document order. */
export function longSentences(markdown: string): Sentence[] {
	const all: Sentence[] = [];
	for (const { line, text } of proseLines(markdown))
		for (const s of text.split(/(?<=[.!?:])\s+/)) {
			const n = words(s).length;
			if (n > LONG_SENTENCE_WORDS) all.push({ line, words: n, text: s });
		}
	return all
		.sort((a, b) => b.words - a.words || a.line - b.line)
		.slice(0, LONGEST_SENTENCES_LISTED);
}

/** The first prose line each jargon word appears on. */
export function jargonLines(markdown: string): Map<string, number> {
	const first = new Map<string, number>();
	for (const { line, text } of proseLines(markdown))
		for (const w of words(text).map(bare))
			if (JARGON.includes(w) && !first.has(w)) first.set(w, line);
	return first;
}
