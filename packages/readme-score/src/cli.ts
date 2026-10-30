// readme-score on the command line: the checks behind readme.flisk.si, run on a folder or a GitHub repository. No
// model and no account: the same files always give the same score, so a README can be gated in CI like a lint error.
import { parseArgs } from "node:util";
import {
	GitHubError,
	homepageOf,
	loadRepo,
	parseRepo,
} from "../../../services/app/web/src/github";
import {
	type Check,
	type ReadmeInput,
	type Report,
	score,
} from "../../../services/app/web/src/readme/score";
import {
	isProjectType,
	PROJECT_TYPES,
} from "../../../services/app/web/src/readme/sections";
import { fetchWebsite } from "../../../services/app/web/src/website";
import { loadLocal, NoReadme } from "./local";

export const VERSION = "0.1.0";

export const USAGE = `Usage: readme-score [folder | owner/repo]... [options]

Scores a README out of 100: sections, first screen, readability, quickstart, links, tagline and website. The same
checks as https://readme.flisk.si. With no argument, the current folder.

Options:
  --min-score <n>   Exit 1 when a README scores below n (0-100)
  --type <type>     Score as: ${PROJECT_TYPES.join(", ")} (default: detected)
  --no-website      Do not read the product's website (the checks that compare with it are left out)
  --json            Print the reports as JSON
  --markdown        Print Markdown, for $GITHUB_STEP_SUMMARY
  -v, --version     Print the version
  -h, --help        Print this help

An owner/repo is read from GitHub; GITHUB_TOKEN raises the API limit from 60 to 5,000 calls an hour.

Exit codes: 0 every README passed, 1 one scored below --min-score, 2 a README could not be read or the usage is wrong.`;

export interface Io {
	out(text: string): void;
	err(text: string): void;
	/** Replaces how a folder or a repository is read; tests pass their own. */
	load?: (target: string) => Promise<ReadmeInput>;
}

const glyph = (c: Check) =>
	c.pass === null ? "-" : c.pass ? "✓" : c.points > 0 ? "!" : "✕";
const pts = (c: Check) =>
	c.pass === null ? "" : `${round(c.points)}/${c.max}`;
const round = (n: number) => Math.round(n * 10) / 10;
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const failing = (r: Report) =>
	r.groups.flatMap((g) => g.checks).filter((c) => c.pass === false);

function text(name: string, r: Report): string {
	const lines = [
		`${name}  ${r.score}/100 (grade ${r.grade})  ${r.type.title}${r.type.chosen ? "" : " (detected)"}`,
	];
	if (r.note) lines.push(`  Note: ${r.note}`);
	for (const g of r.groups) {
		lines.push("", `  ${g.title}  ${round(g.points)}/${g.max}`);
		for (const c of g.checks) {
			lines.push(
				`    ${glyph(c)} ${c.title.padEnd(44)} ${pts(c).padStart(6)}  ${c.measured}`,
			);
			if (c.pass === false) {
				if (c.line) lines.push(`        Line ${c.line}`);
				if (c.fix)
					lines.push(`        Fix: ${c.fix.replace(/\n/g, "\n        ")}`);
			}
		}
	}
	return lines.join("\n");
}

function markdown(name: string, r: Report): string {
	const lines = [
		`### README of ${name}: ${r.score}/100 (grade ${r.grade})`,
		"",
		"| Group | Points |",
		"| --- | --- |",
		...r.groups.map(
			(g) => `| ${cell(g.title)} | ${round(g.points)}/${g.max} |`,
		),
	];
	const miss = failing(r);
	if (miss.length)
		lines.push(
			"",
			"**How to fix**, the costliest first",
			"",
			...miss
				.sort((a, b) => b.max - b.points - (a.max - a.points))
				.map(
					(c) =>
						`- **${cell(c.title)}** (${round(c.max - c.points)} points${c.line ? `, line ${c.line}` : ""}): ${cell(c.fix ?? c.measured)}`,
				),
		);
	return lines.join("\n");
}

async function loadTarget(
	target: string,
	website: boolean,
): Promise<ReadmeInput> {
	const spec = !/^[./~]/.test(target) ? parseRepo(target) : undefined;
	const input = spec
		? await loadRepo(spec, {
				token: process.env.GITHUB_TOKEN,
				website: website ? {} : false,
			})
		: loadLocal(target);
	if (spec || !website) return input;
	const homepage = homepageOf(null, input.manifests ?? []);
	return homepage ? { ...input, website: await fetchWebsite(homepage) } : input;
}

/** Runs the command line; returns the exit code. */
export async function main(argv: string[], io: Io): Promise<number> {
	let args: ReturnType<typeof parse>;
	try {
		args = parse(argv);
	} catch (error) {
		io.err(`${(error as Error).message}\n\n${USAGE}`);
		return 2;
	}
	const { values, positionals } = args;
	if (values.help) {
		io.out(USAGE);
		return 0;
	}
	if (values.version) {
		io.out(VERSION);
		return 0;
	}
	const usage = (message: string) => {
		io.err(`${message}\n\n${USAGE}`);
		return 2;
	};
	const minScore =
		values["min-score"] === undefined ? undefined : Number(values["min-score"]);
	if (minScore !== undefined && !(minScore >= 0 && minScore <= 100))
		return usage("--min-score takes a number from 0 to 100.");
	if (values.type !== undefined && !isProjectType(values.type))
		return usage(`--type is one of ${PROJECT_TYPES.join(", ")}.`);
	const type = isProjectType(values.type) ? values.type : undefined;
	const targets = positionals.length ? positionals : ["."];
	const load = io.load ?? ((t: string) => loadTarget(t, !values["no-website"]));

	const reports: { name: string; report: Report }[] = [];
	let unreadable = false;
	for (const target of targets) {
		try {
			const input = await load(target);
			reports.push({
				name: target,
				report: score(type ? { ...input, type } : input),
			});
		} catch (e) {
			if (!(e instanceof GitHubError || e instanceof NoReadme)) throw e;
			io.err(`${target}: ${e.message}`);
			unreadable = true;
		}
	}

	if (values.json) {
		const list = reports.map((r) => ({ target: r.name, ...r.report }));
		io.out(JSON.stringify(list.length === 1 ? list[0] : list, null, 2));
	} else
		io.out(
			reports
				.map((r) => (values.markdown ? markdown : text)(r.name, r.report))
				.join("\n\n"),
		);

	if (unreadable) return 2;
	if (minScore !== undefined) {
		const low = reports.filter((r) => r.report.score < minScore);
		for (const r of low)
			io.err(
				`${r.name} scored ${r.report.score}, below --min-score ${minScore}.`,
			);
		if (low.length) return 1;
	}
	return 0;
}

function parse(argv: string[]) {
	return parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			"min-score": { type: "string" },
			type: { type: "string" },
			"no-website": { type: "boolean" },
			json: { type: "boolean" },
			markdown: { type: "boolean" },
			version: { type: "boolean", short: "v" },
			help: { type: "boolean", short: "h" },
		},
	});
}
