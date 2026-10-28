// A report in plain text, for the MCP tool and the result page's description: the score, then the failing checks
// that cost the most points, each with its line and its fix.
import type { Check, Report } from "./score";
import { WEIGHTS } from "./sections";

/** Failing checks, the ones that cost the most points first; ties in report order. */
export function fixFirst(report: Report): (Check & { group: string })[] {
	return report.groups
		.flatMap((g) => g.checks.map((c) => ({ ...c, group: g.title })))
		.filter((c) => c.pass === false)
		.sort((a, b) => b.max - b.points - (a.max - a.points));
}

export const subject = (r: Report) =>
	r.repo
		? `${r.repo.owner}/${r.repo.name} at ${r.repo.sha.slice(0, 7)}`
		: `The pasted ${r.readme.path}`;

/** One line: "flisk-sh/flisk at 0889b99: 92/100 (A) as a CLI tool; 20 checks pass, 3 fail." */
export const headline = (r: Report) =>
	`${subject(r)}: ${r.score}/100 (${r.grade}) as a ${WEIGHTS[r.type.type].noun}; ${r.counts.passed} checks pass, ${r.counts.failed} fail.`;

export function summarize(report: Report, url?: string): string {
	const lines = [
		headline(report),
		`Project type: ${report.type.title} (${report.type.reason}).`,
	];
	const fails = fixFirst(report);
	if (fails.length) {
		lines.push("", "Fix first:");
		for (const c of fails)
			lines.push(
				`- ${c.group} / ${c.title}${c.line ? ` (line ${c.line})` : ""}: ${c.measured}, limit ${c.limit}. ${c.fix ?? ""}`.trim(),
			);
	}
	const skipped = report.groups
		.flatMap((g) => g.checks)
		.filter((c) => c.pass === null);
	if (skipped.length)
		lines.push(
			"",
			`Not checked: ${skipped.map((c) => `${c.title} (${c.measured})`).join("; ")}.`,
		);
	if (url) lines.push("", `Full report: ${url}`);
	return lines.join("\n");
}
