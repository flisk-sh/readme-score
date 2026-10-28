// Checks the port against the original: scores flisk-sh/flisk's README here, runs Flisk's own scoreboard
// (scripts/scores/run.mjs in a flisk checkout) on the same commit's files, and compares the first-screen, readability
// and tagline results. Exits 1 when they differ.
//   bun scripts/parity.ts --flisk ../flisk [--ref main]
// --ref defaults to the checkout's current branch, which must be pushed. The scoreboard runs from the checkout on a
// copy of the commit's files (git archive into a temporary folder, --root), so the checkout itself is not touched.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadRepo } from "../src/github";
import { firstScreen } from "../src/readme/first-screen";
import { jargon, prose, readingEase, words } from "../src/readme/readability";
import { projectNames } from "../src/readme/score";
import { groups, taglines } from "../src/readme/tagline";

const { values } = parseArgs({
	options: { flisk: { type: "string" }, ref: { type: "string" } },
});
if (!values.flisk) {
	console.error(
		"Usage: bun scripts/parity.ts --flisk <path to a flisk checkout> [--ref <branch>]",
	);
	process.exit(2);
}
const checkout = path.resolve(values.flisk);
const git = (...args: string[]) =>
	execFileSync("git", ["-C", checkout, ...args], { encoding: "utf8" }).trim();
const ref = values.ref ?? git("rev-parse", "--abbrev-ref", "HEAD");

const input = await loadRepo(
	{ owner: "flisk-sh", name: "flisk", ref },
	{ token: process.env.GITHUB_TOKEN },
);
const sha = input.repo?.sha as string;
console.log(`flisk-sh/flisk ${ref} at ${sha.slice(0, 7)}`);

// The scoreboard, on exactly that commit's files.
try {
	git("cat-file", "-e", sha);
} catch {
	git("fetch", "--quiet", "origin", sha);
}
const root = mkdtempSync(path.join(tmpdir(), "readme-score-parity-"));
let rows: { id: string; value: number; summary: string; findings?: string[] }[];
try {
	// Only the files these three scorers read: the README, the two package.json files, the llms files, launch posts.
	const files = git(
		"ls-tree",
		"-r",
		"--name-only",
		sha,
		"--",
		"README.md",
		"package.json",
		"cli/package.json",
		"docs/agents",
		"docs/launch",
	)
		.split("\n")
		.filter((f) =>
			/^(?:README\.md|package\.json|cli\/package\.json|docs\/agents\/llms(?:-full)?\.txt|docs\/launch\/[^/]+\.md)$/.test(
				f,
			),
		);
	const tar = path.join(root, "files.tar");
	git("archive", `--output=${tar}`, sha, "--", ...files);
	execFileSync("tar", ["-x", "-f", tar, "-C", root]);
	rows = JSON.parse(
		execFileSync(
			"bun",
			[
				path.join(checkout, "scripts/scores/run.mjs"),
				"--only",
				"readme-first-screen,readme-readability,tagline-consistency",
				"--json",
				"--root",
				root,
			],
			{ encoding: "utf8" },
		),
	);
} finally {
	rmSync(root, { recursive: true, force: true });
}
const row = (id: string) => {
	const r = rows.find((x) => x.id === id);
	if (!r) throw new Error(`the scoreboard has no ${id} row`);
	return r;
};

// The same numbers, from this port, in the scoreboard's words.
const s = firstScreen(input.readme, projectNames(input));
const ours = {
	"readme-first-screen": {
		value: [
			s.h1 > 0 && s.h1 <= 5,
			s.install !== null && s.install.line <= 40,
			s.image > 0 && s.image <= 20,
			s.badges.count <= 6,
			s.words <= 250,
		].filter(Boolean).length,
		summary: [
			`H1 near the top: ${s.h1 ? `non-empty line ${s.h1}` : "none"}`,
			`install command: ${s.install ? `line ${s.install.line}` : "none"}`,
			`image: ${s.image ? `line ${s.image}` : "none"}`,
			`badges before the first code block: ${s.badges.count}`,
			`prose words before the first code block: ${s.words}`,
		].join("; "),
	},
	"readme-readability": {
		value: readingEase(input.readme),
		summary: `${words(prose(input.readme)).length} words; ${jargon(input.readme).share}% infrastructure words`,
	},
	"tagline-consistency": (() => {
		// The scoreboard reads files; the GitHub About description is this tool's extra source, compared separately.
		const files = taglines({
			readme: input.readme,
			readmePath: input.readmePath,
			manifests: input.manifests,
			llms: input.llms,
		});
		const distinct = groups(files, projectNames(input)).length;
		return {
			value: distinct,
			summary: `${distinct} distinct across ${files.filter((t) => t.text).length} sources`,
		};
	})(),
};

let failed = 0;
for (const id of [
	"readme-first-screen",
	"readme-readability",
	"tagline-consistency",
] as const) {
	const theirs = row(id);
	const mine = ours[id];
	// The scoreboard's tagline summary ends with the sources it found empty ("; none in …"); the rest must match.
	const same =
		theirs.value === mine.value &&
		theirs.summary.split("; none in")[0] === mine.summary;
	if (!same) failed++;
	console.log(
		`${same ? "same" : "DIFFERENT"}  ${id}\n  scoreboard:   ${theirs.value}  ${theirs.summary}\n  readme-score: ${mine.value}  ${mine.summary}`,
	);
}
const all = taglines({
	readme: input.readme,
	readmePath: input.readmePath,
	manifests: input.manifests,
	llms: input.llms,
	githubDescription: input.repo?.description ?? null,
});
console.log(
	`\nWith the GitHub About description as one more source: ${groups(all, projectNames(input)).length} wording(s) across ${all.filter((t) => t.text).length} sources.`,
);
process.exit(failed ? 1 : 0);
