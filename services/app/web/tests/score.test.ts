import { describe, expect, it } from "bun:test";
import {
	gradeOf,
	POINTS,
	projectNames,
	type ReadmeInput,
	score,
} from "../src/readme/score";
import { fixFirst } from "../src/readme/summary";
import { fixture, ROWCOUNT } from "./helpers";

const complete: ReadmeInput = {
	readme: fixture("cli-complete.md"),
	readmePath: "README.md",
	repo: {
		owner: "acme",
		name: "rowcount",
		ref: "main",
		sha: "a".repeat(40),
		description: ROWCOUNT.description ?? null,
	},
	paths: new Set([...Object.keys(ROWCOUNT.files), "docs", "examples"]),
	manifests: [{ path: "package.json", text: ROWCOUNT.files["package.json"] }],
	llms: [],
	translations: [],
};

describe("score", () => {
	it("adds up to 100 points when every check applies", () => {
		const total =
			POINTS.sections +
			POINTS.firstScreenEach * 5 +
			POINTS.readability +
			POINTS.quickstartFound +
			POINTS.quickstartLength +
			POINTS.translations +
			POINTS.fileLinks +
			POINTS.anchors +
			POINTS.tagline;
		expect(total).toBe(100);
	});

	it("gives the complete CLI fixture 100, grade A, with no fixes", () => {
		const r = score(complete);
		expect([r.score, r.grade, r.type.type]).toEqual([100, "A", "cli"]);
		expect(r.counts).toEqual({ passed: 22, failed: 0, skipped: 1 });
		expect(r.groups.flatMap((g) => g.checks).filter((c) => c.fix)).toEqual([]);
		// Translations are the one check with nothing to look at; its 5 points leave the total.
		expect(r.available).toBe(95);
	});

	it("gives the same report for the same input, every time", () => {
		expect(JSON.stringify(score(complete))).toBe(
			JSON.stringify(score({ ...complete })),
		);
		const bare = { readme: fixture("bare.md"), readmePath: "README.md" };
		expect(score(bare)).toEqual(score(bare));
	});

	it("scores a bare README low, with a fix for every failing check", () => {
		const r = score({ readme: fixture("bare.md"), readmePath: "README.md" });
		expect(r.score).toBeLessThan(40);
		expect(r.grade).toBe("F");
		const failing = r.groups
			.flatMap((g) => g.checks)
			.filter((c) => c.pass === false);
		expect(failing.length).toBeGreaterThan(10);
		for (const c of failing)
			expect([c.id, typeof c.fix, (c.fix ?? "").length > 10]).toEqual([
				c.id,
				"string",
				true,
			]);
	});

	it("leaves out the checks a pasted README cannot have, and says why", () => {
		const r = score({
			readme: fixture("cli-complete.md"),
			readmePath: "README.md",
		});
		const skipped = r.groups
			.flatMap((g) => g.checks)
			.filter((c) => c.pass === null);
		expect(skipped.map((c) => [c.id, c.measured])).toEqual([
			["quickstart.translations", "not checked: needs the repository"],
			["links.files", "not checked: needs the repository"],
			["tagline.distinct", "1 source: nothing to compare"],
		]);
		expect(r.available).toBe(80);
		expect(r.score).toBe(100);
	});

	it("points each check at a line in the README", () => {
		const r = score({
			readme: fixture("library.md"),
			readmePath: "README.md",
			type: "library",
		});
		const byId = Object.fromEntries(
			r.groups.flatMap((g) => g.checks).map((c) => [c.id, c]),
		);
		expect(byId["section.usage"].line).toBe(15);
		expect(byId["section.license"].line).toBe(25);
		expect(byId["first-screen.install"].line).toBe(6);
		expect(byId["quickstart.found"].line).toBe(6);
	});

	it("orders the failing checks by the points they cost", () => {
		const r = score({ readme: fixture("bare.md"), readmePath: "README.md" });
		const lost = fixFirst(r).map((c) => c.max - c.points);
		expect(lost).toEqual([...lost].sort((a, b) => b - a));
	});

	it("grades by fixed boundaries", () => {
		expect([100, 90, 89, 80, 79, 65, 64, 50, 49, 0].map(gradeOf)).toEqual([
			"A",
			"A",
			"B",
			"B",
			"C",
			"C",
			"D",
			"D",
			"F",
			"F",
		]);
	});

	it("knows the project by its repository, package and title names", () => {
		expect(projectNames(complete)).toEqual(["rowcount"]);
		expect(
			projectNames({
				readme: "# Flisk: your stack\n",
				readmePath: "README.md",
				manifests: [
					{ path: "package.json", text: '{"name":"@flisk-sh/flisk-cli"}' },
				],
			}),
		).toEqual(["flisk-cli", "flisk"]);
	});
});
