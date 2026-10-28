// The README's quickstart, how many commands it asks a newcomer to type, and whether translated READMEs still give
// the same commands. Port of Flisk's steps-to-first-healthy and translation-drift scorers: the quickstart there is the
// first shell block that runs `flisk up`; here it is the first shell block that installs the project.
import { installsProject } from "./first-screen";
import { type CodeBlock, codeBlocks } from "./markdown";

/** A quickstart with more commands than this loses its points. `a && b` is two commands. */
export const MAX_QUICKSTART_COMMANDS = 6;
/**
 * Translated READMEs: README.<lang>.md, README-<lang>.md or README_<lang>.md, next to the README or in one of these
 * folders at the root. A README-fr.md deeper down translates another README.
 */
export const TRANSLATION_FOLDERS = [
	"docs",
	"i18n",
	"translations",
	"locales",
	"l10n",
	"readme",
];
export const TRANSLATION =
	/(?:^|\/)README[._-]([a-z]{2}(?:[_-][a-z0-9]{2,4})?)\.(?:md|markdown)$/i;

/** Languages of code blocks that hold terminal commands; a block with no language counts when it installs. */
export const SHELLS = [
	"bash",
	"sh",
	"shell",
	"zsh",
	"fish",
	"console",
	"terminal",
	"shell-session",
	"shellsession",
	"powershell",
	"pwsh",
	"ps1",
	"cmd",
	"bat",
];
/** Commands a translation may change on purpose: the folder it makes and enters may have a translated name. */
export const FOLDER_COMMANDS = ["cd", "mkdir", "pushd", "popd"];

/**
 * The commands of a shell block in order: continuation lines joined, blank and comment lines and a `$ ` prompt dropped,
 * `a && b` and `a; b` split into two, trailing comments and repeated spaces removed. When some lines carry a `$ `
 * prompt, the others are output, not commands.
 */
export function shellCommands(body: string): string[] {
	const joined = String(body).replace(/\\\n/g, " ").split("\n");
	const prompted = joined.some((l) => /^\s*\$\s/.test(l));
	return joined
		.filter((l) => !prompted || /^\s*\$\s/.test(l))
		.map((l) => l.trim().replace(/^\$\s+/, ""))
		.filter((l) => l && !l.startsWith("#"))
		.flatMap((l) => l.split(/\s*(?:&&|;)\s*/))
		.map((c) =>
			c
				.replace(/\s+#.*$/, "")
				.replace(/\s+/g, " ")
				.trim(),
		)
		.filter(Boolean);
}

/** A README's quickstart: its first shell code block with a command that installs the project, or null. */
export function quickstart(
	markdown: string,
	names: string[] = [],
): CodeBlock | null {
	return (
		codeBlocks(markdown).find(
			(b) =>
				(SHELLS.includes(b.lang) || b.lang === "") &&
				shellCommands(b.body).some((c) => installsProject(c, names)),
		) ?? null
	);
}

const compared = (body: string) =>
	shellCommands(body).filter((c) => !FOLDER_COMMANDS.includes(c.split(" ")[0]));

/** Multiset difference: the items of a that b does not have. */
function without(a: string[], b: string[]): string[] {
	const left = [...b];
	return a.filter((x) => {
		const i = left.indexOf(x);
		if (i < 0) return true;
		left.splice(i, 1);
		return false;
	});
}

/** How a translation's quickstart differs from the README's; [] when the compared commands match. */
export function drift(
	englishBody: string,
	translatedBody: string | null | undefined,
): string[] {
	if (translatedBody === null || translatedBody === undefined)
		return ["no quickstart (no shell block installs the project)"];
	const want = compared(englishBody);
	const got = compared(translatedBody);
	if (want.join("\n") === got.join("\n")) return [];
	const out = [
		...without(want, got).map((c) => `missing "${c}"`),
		...without(got, want).map((c) => `extra "${c}"`),
	];
	return out.length ? out : ["same commands in a different order"];
}

const folderOf = (p: string) =>
	p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";

/** Translated READMEs in a list of repository paths, sorted, leaving out the README itself. */
export function translationPaths(
	paths: Iterable<string>,
	readme: string,
): string[] {
	const folders = new Set([folderOf(readme), ...TRANSLATION_FOLDERS]);
	return [...paths]
		.filter(
			(p) => p !== readme && TRANSLATION.test(p) && folders.has(folderOf(p)),
		)
		.sort();
}
