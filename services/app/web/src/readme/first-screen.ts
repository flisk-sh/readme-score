// What a visitor sees at the top of a README before scrolling: a title, an install command, a picture, few badges and
// a short pitch before the first code block. Five checks. Port of Flisk's readme-first-screen scorer, with the install
// command generalised from Flisk's own installer to any package manager or installer.
import { fencedLines, isSetextH1, lines } from "./markdown";

export const H1_WITHIN_NONEMPTY_LINES = 5;
export const INSTALL_WITHIN_LINES = 40;
export const IMAGE_WITHIN_LINES = 20;
export const MAX_BADGES_BEFORE_CODE = 6;
export const MAX_PROSE_WORDS_BEFORE_CODE = 250;

/**
 * Commands that install or start a project, in a code block or an inline code span. `curl … | sh` and the other
 * download-and-run installers count only when the line names the project, so another tool's installer (a
 * prerequisite) is not this project's install command.
 */
export const INSTALL_COMMAND =
	/(?:^|[\s;&|(`$])(?:(?:npm|pnpm|yarn|bun)\s+(?:install|i|add|create)\b|npm\s+init\s+\S|(?:npx|pnpx|bunx)\s+\S|(?:pnpm|yarn)\s+dlx\s+\S|(?:pip3?|pipx|poetry|pdm|conda|mamba|uv\s+pip|uv\s+tool)\s+(?:install|add)\b|uvx?\s+(?:add|run)\b|uvx\s+\S|cargo\s+(?:install|add|binstall)\b|go\s+(?:install|get)\b|brew\s+install\b|(?:gem|bundle)\s+(?:install|add)\b|composer\s+(?:require|create-project|global\s+require)\b|dotnet\s+(?:add\s+package|tool\s+install)\b|(?:sudo\s+)?(?:apt|apt-get|dnf|yum|pacman|apk|zypper|snap|flatpak|winget|scoop|choco|nix-env|port)\s+(?:install|add|-S)\b|nix\s+(?:profile\s+install|run)\b|deno\s+(?:install|add)\b|docker\s+(?:run|pull)\b|docker[\s-]compose\s+up\b|git\s+clone\b|helm\s+install\b|mix\s+archive\.install\b|cabal\s+install\b|opam\s+install\b|luarocks\s+install\b)/i;
export const DOWNLOAD_AND_RUN =
	/\b(?:curl|wget)\s[^\n]*\|\s*(?:sudo\s+)?(?:bash|zsh|sh|fish)\b|\b(?:iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^\n]*\|\s*iex\b/i;

const IMAGE =
	/!\[[^\]]*\]\(\s*<?([^)\s>]+)[^)]*\)|<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;
/** shields.io and the services that copy its style: badgen, badge.fury.io, GitHub's workflow badge.svg, any /badge path. */
export const BADGE =
	/shields\.io|badgen\.net|badge\.fury\.io|[/.]badges?(?=[/.?#]|$)/i;

export const imageUrls = (line: string) =>
	[...line.matchAll(IMAGE)].map((m) => m[1] ?? m[2]);

/**
 * Words a reader reads in a piece of markdown: comments, images (badges included) and HTML tags removed, links
 * reduced to their text, and only tokens with a letter or digit counted.
 */
export function proseWords(markdown: string): number {
	return String(markdown)
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/<[^>]+>/g, " ")
		.replace(/&#?\w+;/g, " ")
		.split(/\s+/)
		.filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Whether a line installs the project. `names` are the project's names, lower case; empty when none is known. */
export function installsProject(line: string, names: string[]): boolean {
	if (INSTALL_COMMAND.test(line)) return true;
	if (!DOWNLOAD_AND_RUN.test(line)) return false;
	const lower = line.toLowerCase();
	return !names.length || names.some((n) => lower.includes(n));
}

/** The first line (1-based) in code that installs the project, and the command; null when there is none. */
export function firstInstall(
	markdown: string,
	names: string[],
): { line: number; command: string } | null {
	const all = lines(markdown);
	const fenced = fencedLines(markdown);
	for (let i = 0; i < all.length; i++) {
		const code = fenced[i]
			? [all[i]]
			: [...all[i].matchAll(/(`+)((?:(?!\1).)+?)\1/g)].map((m) => m[2]);
		const hit = code.find(
			(c) => !/^\s*(```|~~~)/.test(c) && installsProject(c, names),
		);
		if (hit) return { line: i + 1, command: hit.trim().replace(/^\$\s+/, "") };
	}
	return null;
}

export interface FirstScreen {
	/** Which non-empty line the H1 is (1-based), 0 when there is none: the number the check compares. */
	h1: number;
	/** The H1's line in the file, 0 when there is none. */
	h1Line: number;
	install: { line: number; command: string } | null;
	image: number;
	badges: { count: number; lines: number[] };
	words: number;
	/** The line of the first code block's fence, or the line after the end when there is none. */
	firstCode: number;
}

export function firstScreen(
	markdown: string,
	names: string[] = [],
): FirstScreen {
	const all = lines(markdown);
	let firstCode = all.findIndex((l) => /^\s*(```|~~~)/.test(l));
	if (firstCode < 0) firstCode = all.length;
	const head = all.slice(0, firstCode);
	// A `# comment` inside a code block is not a heading.
	let fenced = false;
	const nonEmpty = all
		.map((l, i) => {
			const fence = /^\s*(```|~~~)/.test(l);
			if (fence) fenced = !fenced;
			return {
				l,
				line: i + 1,
				heading: !fence && !fenced,
				setext: isSetextH1(l, all[i + 1]),
			};
		})
		.filter(({ l }) => l.trim());
	// `# Title`, <h1>, or a line underlined with === (Flisk's scorer reads the first two).
	const h1 =
		nonEmpty.findIndex(
			({ l, heading, setext }) =>
				heading && (/^#\s+\S/.test(l) || /<h1[\s>]/i.test(l) || setext),
		) + 1;
	const h1Line = h1 ? nonEmpty[h1 - 1].line : 0;
	const image =
		all.findIndex((l) => imageUrls(l).some((u) => !BADGE.test(u))) + 1;
	const badgeLines: number[] = [];
	let count = 0;
	head.forEach((l, i) => {
		const n = imageUrls(l).filter((u) => BADGE.test(u)).length;
		if (n) badgeLines.push(i + 1);
		count += n;
	});
	return {
		h1,
		h1Line,
		install: firstInstall(markdown, names),
		image,
		badges: { count, lines: badgeLines },
		words: proseWords(head.join("\n")),
		firstCode: firstCode + 1,
	};
}
