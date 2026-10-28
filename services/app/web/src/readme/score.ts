// The score out of 100: every check below, its points, and a fix for each one that fails. Pure: the same README and
// files always give the same report. A check with nothing to look at (a pasted README has no file tree, a repository
// with no translations has none to compare) is skipped, and its points leave the total, so the score is
// 100 × points earned / points available.
import {
	firstScreen,
	H1_WITHIN_NONEMPTY_LINES,
	IMAGE_WITHIN_LINES,
	INSTALL_WITHIN_LINES,
	MAX_BADGES_BEFORE_CODE,
	MAX_PROSE_WORDS_BEFORE_CODE,
} from "./first-screen";
import {
	brokenAnchors,
	brokenFileLinks,
	POINTS_LOST_PER_BROKEN_LINK,
} from "./links";
import { firstH1, round1 } from "./markdown";
import {
	drift,
	MAX_QUICKSTART_COMMANDS,
	quickstart,
	shellCommands,
} from "./quickstart";
import {
	jargon,
	jargonLines,
	LONG_SENTENCE_WORDS,
	longSentences,
	READING_EASE_FULL_MARKS,
	READING_EASE_ZERO,
	readingEase,
} from "./readability";
import {
	type ProjectType,
	SECTIONS,
	sections,
	type TypeGuess,
	typeFromFiles,
	typeFromReadme,
	WEIGHT_LABELS,
	WEIGHTS,
} from "./sections";
import { type TextFile, groups as taglineGroups, taglines } from "./tagline";

/** Points per check. With every check applicable they add up to 100. */
export const POINTS = {
	/** Shared by the sections in proportion to their weight for the project type. */
	sections: 40,
	/** Each of the five first-screen checks. */
	firstScreenEach: 4,
	readability: 10,
	quickstartFound: 2,
	quickstartLength: 3,
	translations: 5,
	fileLinks: 5,
	anchors: 5,
	tagline: 10,
} as const;
/** Tagline points by how many different wordings there are: one, two, three or more. */
export const TAGLINE_POINTS_BY_DISTINCT = [10, 5, 0] as const;
/** The lowest score for each grade. */
export const GRADES: [number, string][] = [
	[90, "A"],
	[80, "B"],
	[65, "C"],
	[50, "D"],
	[0, "F"],
];

export interface Finding {
	/** The line in `file` (the README when there is no file). */
	line?: number;
	file?: string;
	text: string;
}

export interface Check {
	id: string;
	title: string;
	/** null when there is nothing to check; the check's points then leave the total. */
	pass: boolean | null;
	points: number;
	max: number;
	measured: string;
	limit: string;
	/** The README line the check points at. */
	line?: number;
	/** For a failing check: what to change. */
	fix?: string;
	/** Text to paste for the fix. */
	snippet?: string;
	findings?: Finding[];
}

export interface Group {
	id: string;
	title: string;
	checks: Check[];
	points: number;
	max: number;
}

export interface RepoInfo {
	owner: string;
	name: string;
	/** The branch, tag or commit asked for. */
	ref: string;
	/** The commit the files were read at. */
	sha: string;
	description: string | null;
}

export interface ReadmeInput {
	readme: string;
	/** The README's path in the repository, for links and findings. */
	readmePath: string;
	repo?: RepoInfo;
	/** Every file and folder in the repository; unknown for a pasted README. */
	paths?: Set<string>;
	/** True when GitHub returned only part of the tree. */
	truncated?: boolean;
	/** Why there is no file tree although the README came from a repository; the checks that need it say so. */
	withoutTree?: string;
	/** package.json, pyproject.toml, Cargo.toml and composer.json files whose description and type count. */
	manifests?: TextFile[];
	llms?: TextFile[];
	translations?: TextFile[];
	/** Overrides the detected project type. */
	type?: ProjectType;
}

export interface Report {
	score: number;
	grade: string;
	earned: number;
	available: number;
	type: TypeGuess & { title: string; chosen: boolean };
	groups: Group[];
	counts: { passed: number; failed: number; skipped: number };
	readme: { path: string; lines: number };
	repo?: RepoInfo;
	/** Why some checks were skipped although the README came from a repository. */
	note?: string;
}

export const gradeOf = (score: number) =>
	(GRADES.find(([min]) => score >= min) ?? GRADES[GRADES.length - 1])[1];

const plural = (n: number, one: string, many = `${one}s`) =>
	`${n} ${n === 1 ? one : many}`;

/** The project's names, lower case: the repository, the packages (scope dropped) and the H1's first word. */
export function projectNames(input: ReadmeInput): string[] {
	const names = new Set<string>();
	if (input.repo) names.add(input.repo.name.toLowerCase());
	for (const m of input.manifests ?? []) {
		let name: string | undefined;
		if (m.path.endsWith(".json"))
			try {
				const n = (JSON.parse(m.text) as { name?: unknown }).name;
				if (typeof n === "string") name = n;
			} catch {
				// Not JSON: no name.
			}
		else name = /^name\s*=\s*["']([^"']+)["']/m.exec(m.text)?.[1];
		if (name) names.add(name.replace(/^@[^/]+\//, "").toLowerCase());
	}
	const h1Word = /^[\p{L}\p{N}][\p{L}\p{N}._-]*/u.exec(
		firstH1(input.readme) ?? "",
	)?.[0];
	if (h1Word) names.add(h1Word.toLowerCase());
	return [...names].filter((n) => n.length >= 2);
}

const knownName = (input: ReadmeInput) =>
	input.repo?.name ??
	/^[\p{L}\p{N}][\p{L}\p{N}._-]*/u.exec(firstH1(input.readme) ?? "")?.[0];

/** The name fixes use in prose: the repository's, else the H1's first word, else "your project". */
const displayName = (input: ReadmeInput) => knownName(input) ?? "your project";

/** The install command a fix suggests, from the manifests and the type. */
export function suggestedInstall(
	input: ReadmeInput,
	type: ProjectType,
): string {
	const name = knownName(input) ?? "<package>";
	const find = (file: string) => input.manifests?.find((m) => m.path === file);
	const pkg = (input.manifests ?? [])
		.filter((m) => m.path.endsWith("package.json"))
		.map((m) => {
			try {
				return JSON.parse(m.text) as {
					name?: string;
					bin?: unknown;
					private?: boolean;
				};
			} catch {
				return {};
			}
		})
		.find((p) => p.name && !p.private);
	const repoUrl = input.repo
		? `https://github.com/${input.repo.owner}/${input.repo.name}`
		: `https://github.com/<you>/${name}`;
	if (type === "app" || type === "api")
		return `git clone ${repoUrl}\ncd ${input.repo?.name ?? name}`;
	if (pkg?.name)
		return type === "cli"
			? `npm install -g ${pkg.name}`
			: `npm install ${pkg.name}`;
	if (find("pyproject.toml"))
		return type === "cli" ? `pipx install ${name}` : `pip install ${name}`;
	if (find("Cargo.toml"))
		return type === "cli" ? `cargo install ${name}` : `cargo add ${name}`;
	if (input.paths?.has("go.mod"))
		return type === "cli"
			? `go install ${repoUrl.replace("https://", "")}@latest`
			: `go get ${repoUrl.replace("https://", "")}`;
	return type === "cli" ? `npm install -g ${name}` : `npm install ${name}`;
}

const check = (c: Omit<Check, "points"> & { points?: number }): Check => ({
	...c,
	max: round1(c.max),
	points: c.pass === null ? 0 : round1(c.points ?? (c.pass ? c.max : 0)),
});

function sectionGroup(input: ReadmeInput, type: ProjectType): Group {
	const results = sections(input.readme, type);
	const total = results.reduce((n, r) => n + r.weight, 0);
	const name = displayName(input);
	const checks = results.map((r) => {
		const spec = SECTIONS[r.id];
		const max = (POINTS.sections * r.weight) / total;
		const heading = spec.heading.replace("{name}", name);
		const at = r.insertAt;
		return check({
			id: `section.${r.id}`,
			title: spec.title,
			pass: r.found !== null,
			max,
			measured: r.found ? `"${r.found.text}"` : "missing",
			limit: `${WEIGHT_LABELS[r.weight]} for a ${WEIGHTS[type].noun}`,
			line: r.found?.line ?? at?.line,
			...(r.found
				? {}
				: {
						fix: `Add "${heading}" at line ${at?.line}${at?.before ? `, before "${at.before}"` : ", at the end"}. ${spec.body.replace("{name}", name)}`,
						snippet: `${heading}\n\n${spec.body.replace("{name}", name)}`,
					}),
		});
	});
	return finish("sections", "Sections", checks);
}

function firstScreenGroup(
	input: ReadmeInput,
	names: string[],
	type: ProjectType,
): Group {
	const s = firstScreen(input.readme, names);
	const name = displayName(input);
	const each = POINTS.firstScreenEach;
	const checks: Check[] = [
		check({
			id: "first-screen.h1",
			title: "Title near the top",
			pass: s.h1 > 0 && s.h1 <= H1_WITHIN_NONEMPTY_LINES,
			max: each,
			measured: s.h1 ? `non-empty line ${s.h1}` : "none",
			limit: `within ${H1_WITHIN_NONEMPTY_LINES} non-empty lines`,
			...(s.h1Line ? { line: s.h1Line } : {}),
			fix: s.h1
				? `Move the title at line ${s.h1Line} up: at most ${H1_WITHIN_NONEMPTY_LINES - 1} non-empty lines (a logo, badges) before it.`
				: `Add a title as the first line: "# ${name}: what it does, in one line".`,
		}),
		check({
			id: "first-screen.install",
			title: "Install command",
			pass: s.install !== null && s.install.line <= INSTALL_WITHIN_LINES,
			max: each,
			measured: s.install ? `line ${s.install.line}` : "none",
			limit: `within ${INSTALL_WITHIN_LINES} lines`,
			...(s.install ? { line: s.install.line } : {}),
			...(s.install
				? {
						fix: `Move the install command at line ${s.install.line} (${s.install.command}) into the first ${INSTALL_WITHIN_LINES} lines, under the pitch.`,
					}
				: {
						fix: `Add a shell block with the install command under the pitch, within the first ${INSTALL_WITHIN_LINES} lines.`,
						snippet: `\`\`\`bash\n${suggestedInstall(input, type)}\n\`\`\``,
					}),
		}),
		check({
			id: "first-screen.image",
			title: "Picture of it working",
			pass: s.image > 0 && s.image <= IMAGE_WITHIN_LINES,
			max: each,
			measured: s.image ? `line ${s.image}` : "none",
			limit: `within ${IMAGE_WITHIN_LINES} lines; badges do not count`,
			...(s.image ? { line: s.image } : {}),
			...(s.image
				? {
						fix: `Move the image at line ${s.image} into the first ${IMAGE_WITHIN_LINES} lines.`,
					}
				: {
						fix: `Add a screenshot, GIF or diagram of ${name} at work within the first ${IMAGE_WITHIN_LINES} lines.`,
						snippet: `![${name} in action](docs/demo.gif)`,
					}),
		}),
		check({
			id: "first-screen.badges",
			title: "Badges before the first code block",
			pass: s.badges.count <= MAX_BADGES_BEFORE_CODE,
			max: each,
			measured: String(s.badges.count),
			limit: `at most ${MAX_BADGES_BEFORE_CODE}`,
			...(s.badges.lines.length ? { line: s.badges.lines[0] } : {}),
			fix: `Drop ${s.badges.count - MAX_BADGES_BEFORE_CODE} of the ${s.badges.count} badges on line${s.badges.lines.length === 1 ? "" : "s"} ${s.badges.lines.join(", ")}, or move them below the first code block.`,
		}),
		check({
			id: "first-screen.words",
			title: "Words before the first code block",
			pass: s.words <= MAX_PROSE_WORDS_BEFORE_CODE,
			max: each,
			measured: String(s.words),
			limit: `at most ${MAX_PROSE_WORDS_BEFORE_CODE}`,
			line: s.firstCode,
			fix: `Cut ${s.words - MAX_PROSE_WORDS_BEFORE_CODE} words before the first code block at line ${s.firstCode}, or move that block up.`,
		}),
	];
	return finish("first-screen", "First screen", checks);
}

function readabilityGroup(input: ReadmeInput): Group {
	const ease = readingEase(input.readme);
	const j = jargon(input.readme);
	const firstLines = jargonLines(input.readme);
	const long = longSentences(input.readme);
	const span = READING_EASE_FULL_MARKS - READING_EASE_ZERO;
	const findings: Finding[] = [
		...long.map((s) => ({
			line: s.line,
			text: `${s.words} words: "${s.text.length > 140 ? `${s.text.slice(0, 137)}…` : s.text}"`,
		})),
		...j.counts.map(([word, n]) => ({
			...(firstLines.has(word) ? { line: firstLines.get(word) } : {}),
			text: `"${word}" ${n}× (infrastructure word; say what it is the first time)`,
		})),
	];
	return finish("readability", "Readability", [
		check({
			id: "readability.flesch",
			title: "Flesch reading ease",
			pass: ease === null ? null : ease >= READING_EASE_FULL_MARKS,
			max: POINTS.readability,
			points:
				ease === null
					? 0
					: (POINTS.readability *
							Math.min(span, Math.max(0, ease - READING_EASE_ZERO))) /
						span,
			measured:
				ease === null
					? "no prose"
					: `${ease} (${j.share}% infrastructure words)`,
			limit: `${READING_EASE_FULL_MARKS}+ for full points, ${READING_EASE_ZERO} or below for none`,
			fix: `Shorter sentences and shorter words raise it.${long.length ? ` Split the sentences over ${LONG_SENTENCE_WORDS} words first; the longest are listed.` : ""}`,
			...(findings.length ? { findings } : {}),
		}),
	]);
}

function quickstartGroup(
	input: ReadmeInput,
	names: string[],
	type: ProjectType,
): Group {
	const block = quickstart(input.readme, names);
	const commands = block ? shellCommands(block.body) : [];
	const checks: Check[] = [
		check({
			id: "quickstart.found",
			title: "Quickstart block",
			pass: block !== null,
			max: POINTS.quickstartFound,
			measured: block ? `line ${block.line}` : "none",
			limit: "a shell block that installs the project",
			...(block ? { line: block.line } : {}),
			fix: "Add one shell block with every command from install to a first result, in order.",
			snippet: `\`\`\`bash\n${suggestedInstall(input, type)}\n\`\`\``,
		}),
		check({
			id: "quickstart.length",
			title: "Commands in the quickstart",
			pass: block !== null && commands.length <= MAX_QUICKSTART_COMMANDS,
			max: POINTS.quickstartLength,
			measured: block ? plural(commands.length, "command") : "no quickstart",
			limit: `at most ${MAX_QUICKSTART_COMMANDS}; a && b is two`,
			...(block ? { line: block.line } : {}),
			fix: block
				? `Cut ${commands.length - MAX_QUICKSTART_COMMANDS} of the ${commands.length}: fold setup into one command (a script, a create command, a Makefile target) or move optional steps below.`
				: "Add a quickstart block first.",
			...(block
				? { findings: [{ line: block.line, text: commands.join(" → ") }] }
				: {}),
		}),
	];
	const translations = input.translations ?? [];
	if (block && translations.length) {
		const drifted: Finding[] = [];
		let count = 0;
		for (const t of translations) {
			const problems = drift(
				block.body,
				quickstart(t.text, names)?.body ?? null,
			);
			if (problems.length) count++;
			for (const p of problems) drifted.push({ file: t.path, text: p });
		}
		checks.push(
			check({
				id: "quickstart.translations",
				title: "Translations give the same commands",
				pass: count === 0,
				max: POINTS.translations,
				points: POINTS.translations * (1 - count / translations.length),
				measured: `${count} of ${translations.length} differ`,
				limit: "0; folder names may be translated",
				line: block.line,
				fix: `Copy the commands from line ${block.line} into each translation listed.`,
				...(drifted.length ? { findings: drifted } : {}),
			}),
		);
	} else
		checks.push(
			check({
				id: "quickstart.translations",
				title: "Translations give the same commands",
				pass: null,
				max: POINTS.translations,
				measured: input.paths
					? "no translated READMEs"
					: input.withoutTree
						? `not checked: ${input.withoutTree}`
						: "not checked: needs the repository",
				limit: "0; folder names may be translated",
			}),
		);
	return finish("quickstart", "Quickstart", checks);
}

function linksGroup(input: ReadmeInput): Group {
	const anchors = brokenAnchors(input.readme, input.readmePath);
	const anchorFindings = anchors.broken.map((b) => ({
		line: b.line,
		text: `${b.target}: ${b.why}${b.suggestion ? `; did you mean ${b.suggestion}?` : ""}`,
	}));
	let files: Check;
	if (!input.paths)
		files = check({
			id: "links.files",
			title: "Relative links resolve",
			pass: null,
			max: POINTS.fileLinks,
			measured: input.withoutTree
				? `not checked: ${input.withoutTree}`
				: "not checked: needs the repository",
			limit: "0 broken",
		});
	else if (input.truncated)
		files = check({
			id: "links.files",
			title: "Relative links resolve",
			pass: null,
			max: POINTS.fileLinks,
			measured: "not checked: GitHub sent part of the file tree",
			limit: "0 broken",
		});
	else {
		const r = brokenFileLinks(input.readme, input.readmePath, input.paths);
		files = check({
			id: "links.files",
			title: "Relative links resolve",
			pass: r.checked ? r.broken.length === 0 : null,
			max: POINTS.fileLinks,
			points: Math.max(
				0,
				POINTS.fileLinks - POINTS_LOST_PER_BROKEN_LINK * r.broken.length,
			),
			measured: r.checked
				? `${r.broken.length} of ${plural(r.checked, "link")} broken`
				: "no relative links",
			limit: `0 broken; ${POINTS_LOST_PER_BROKEN_LINK} point off for each`,
			...(r.broken.length ? { line: r.broken[0].line } : {}),
			fix: "Point each link listed at a file that exists, with the same case, or remove it.",
			...(r.broken.length
				? {
						findings: r.broken.map((b) => ({
							line: b.line,
							text: `${b.target}: ${b.why}${b.suggestion ? `; did you mean ${b.suggestion}?` : ""}`,
						})),
					}
				: {}),
		});
	}
	return finish("links", "Links", [
		files,
		check({
			id: "links.anchors",
			title: "#anchors match a heading",
			pass: anchors.checked ? anchors.broken.length === 0 : null,
			max: POINTS.anchors,
			points: Math.max(
				0,
				POINTS.anchors - POINTS_LOST_PER_BROKEN_LINK * anchors.broken.length,
			),
			measured: anchors.checked
				? `${anchors.broken.length} of ${plural(anchors.checked, "anchor")} broken`
				: "no #anchors",
			limit: `0 broken; ${POINTS_LOST_PER_BROKEN_LINK} point off for each`,
			...(anchors.broken.length ? { line: anchors.broken[0].line } : {}),
			fix: "Change each anchor listed to a heading's anchor (lower case, spaces as hyphens, punctuation dropped).",
			...(anchorFindings.length ? { findings: anchorFindings } : {}),
		}),
	]);
}

function taglineGroup(input: ReadmeInput, names: string[]): Group {
	const sources = taglines({
		readme: input.readme,
		readmePath: input.readmePath,
		...(input.manifests ? { manifests: input.manifests } : {}),
		...(input.llms ? { llms: input.llms } : {}),
		...(input.repo && !input.withoutTree
			? { githubDescription: input.repo.description }
			: {}),
	});
	const found = sources.filter((s) => s.text);
	const g = taglineGroups(sources, names);
	const letter = (s: (typeof sources)[number]) => {
		const i = g.findIndex((x) => x.sources.includes(s));
		return i < 0 ? "" : `${String.fromCharCode(65 + i)}: `;
	};
	const findings = sources.map((s) => ({
		...(s.file ? { file: s.file } : {}),
		...(s.line ? { line: s.line } : {}),
		text: `${letter(s)}${s.source}: ${s.text ? `"${s.text}"` : "(none)"}`,
	}));
	const others = g.slice(1).flatMap((x) => x.sources.map((s) => s.source));
	return finish("tagline", "Tagline", [
		check({
			id: "tagline.distinct",
			title: "One tagline everywhere",
			pass: found.length < 2 ? null : g.length === 1,
			max: POINTS.tagline,
			points:
				TAGLINE_POINTS_BY_DISTINCT[
					Math.min(g.length, TAGLINE_POINTS_BY_DISTINCT.length) - 1
				],
			measured:
				found.length < 2
					? `${plural(found.length, "source")}: nothing to compare`
					: `${plural(g.length, "wording")} across ${plural(found.length, "source")}`,
			limit: `1; points by wordings: ${TAGLINE_POINTS_BY_DISTINCT.join(", ")}`,
			fix: g.length
				? `Use one wording everywhere. The most used is "${g[0].sources[0].text}"; change ${others.join(", ")}${others.includes("GitHub About description") ? " (the GitHub About box is edited from the gear next to About)" : ""}.`
				: "",
			findings,
		}),
	]);
}

function finish(id: string, title: string, checks: Check[]): Group {
	const counted = checks.filter((c) => c.pass !== null);
	return {
		id,
		title,
		checks: checks
			.map((c) => (c.pass ? { ...c, fix: undefined, snippet: undefined } : c))
			.map(clean),
		points: round1(counted.reduce((n, c) => n + c.points, 0)),
		max: round1(counted.reduce((n, c) => n + c.max, 0)),
	};
}

/** Drops undefined fields, so a report compares and serialises the same way however it was built. */
const clean = (c: Check): Check =>
	Object.fromEntries(
		Object.entries(c).filter(([, v]) => v !== undefined),
	) as unknown as Check;

export function score(input: ReadmeInput): Report {
	const names = projectNames(input);
	const fromFiles =
		input.manifests || input.paths
			? typeFromFiles(input.manifests ?? [], input.paths ?? new Set())
			: null;
	const guess: TypeGuess = input.type
		? { type: input.type, reason: "chosen" }
		: (fromFiles ?? typeFromReadme(input.readme));
	const type = guess.type;
	const groups = [
		sectionGroup(input, type),
		firstScreenGroup(input, names, type),
		readabilityGroup(input),
		quickstartGroup(input, names, type),
		linksGroup(input),
		taglineGroup(input, names),
	];
	const all = groups.flatMap((g) => g.checks);
	const counted = all.filter((c) => c.pass !== null);
	const earned = counted.reduce((n, c) => n + c.points, 0);
	const available = counted.reduce((n, c) => n + c.max, 0);
	const value = available ? Math.round((100 * earned) / available) : 0;
	return {
		score: value,
		grade: gradeOf(value),
		earned: round1(earned),
		available: round1(available),
		type: { ...guess, title: WEIGHTS[type].title, chosen: Boolean(input.type) },
		groups,
		counts: {
			passed: all.filter((c) => c.pass === true).length,
			failed: all.filter((c) => c.pass === false).length,
			skipped: all.filter((c) => c.pass === null).length,
		},
		readme: { path: input.readmePath, lines: input.readme.split("\n").length },
		...(input.withoutTree ? { note: input.withoutTree } : {}),
		...(input.repo ? { repo: input.repo } : {}),
	};
}
