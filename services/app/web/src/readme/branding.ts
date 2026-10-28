// Whether the project presents itself the same way everywhere: its name spelled one way, and the README and the
// website leading with the same command and the same install command. Deterministic: patterns and string compares.
import { installsProject } from "./first-screen";
import { fencedLines, lines } from "./markdown";
import { shellCommands } from "./quickstart";

/** The name as the H1 spells it: its first word, kept as written. */
export const brandName = (h1: string | null) =>
	/^[\p{L}\p{N}][\p{L}\p{N}._-]*/u.exec(h1 ?? "")?.[0] ?? null;

export interface Spelling {
	spelling: string;
	count: number;
	/** The first line it is on. */
	line: number;
}

/**
 * Spellings of the name in the README's prose that differ from the H1's: other capitalisations of the same word.
 * Code, link targets, URLs, paths and all-lowercase uses (the command, `npm i x`) are left out, and so are words
 * that only start with the name (Flisk's, Flisk-powered still count as Flisk).
 */
export function nameSpellings(markdown: string, name: string): Spelling[] {
	const fenced = fencedLines(markdown);
	const lower = name.toLowerCase();
	const found = new Map<string, Spelling>();
	lines(markdown).forEach((raw, i) => {
		if (fenced[i]) return;
		const text = raw
			.replace(/`[^`]*`/g, " ")
			.replace(/\]\([^)]*\)/g, "] ")
			.replace(/<[^>]+>/g, " ")
			.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, " ")
			.replace(/\S*[/\\]\S*/g, " ");
		for (const m of text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}_-]*/gu)) {
			const w = m[0].replace(/[-_].*$/, "");
			if (w.toLowerCase() !== lower || w === name || w === lower) continue;
			const s = found.get(w) ?? { spelling: w, count: 0, line: i + 1 };
			s.count++;
			found.set(w, s);
		}
	});
	return [...found.values()].sort(
		(a, b) => b.count - a.count || a.line - b.line,
	);
}

/** The commands in a list of code texts, in order, with a `$ ` prompt dropped. */
export const commandsIn = (code: string[]) =>
	code.flatMap((c) => shellCommands(c));

/**
 * The command a surface leads with: the first `<name> <subcommand>` it shows (flisk project, flisk import), else its
 * first command that is not an install, a cd or a mkdir. Null when it shows none.
 */
export function leadCommand(
	commands: string[],
	name: string,
	names: string[] = [],
): string | null {
	const n = name.toLowerCase();
	const own = commands.find((c) =>
		new RegExp(
			`^${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+[a-z][\\w-]*`,
			"i",
		).test(c),
	);
	if (own) return own.split(/\s+/).slice(0, 2).join(" ").toLowerCase();
	const other = commands.find(
		(c) =>
			!installsProject(c, names) &&
			!/^(?:cd|mkdir|pushd|ls|echo|export)\b/.test(c),
	);
	return other ? other.split(/\s+/).slice(0, 2).join(" ") : null;
}

/** The first install command a surface shows, without a `$ ` prompt and repeated spaces. */
export const installCommand = (commands: string[], names: string[] = []) =>
	commands
		.find((c) => installsProject(c, names))
		?.replace(/\s+/g, " ")
		.trim() ?? null;
