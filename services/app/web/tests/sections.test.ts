import { describe, expect, it } from "bun:test";
import { score } from "../src/readme/score";
import {
	headingParts,
	matchSynonym,
	normaliseHeading,
	PROJECT_TYPES,
	SECTION_IDS,
	SECTIONS,
	sections,
	typeFromFiles,
	typeFromReadme,
	WEIGHTS,
} from "../src/readme/sections";
import { fixture } from "./helpers";

const found = (readme: string, type: (typeof PROJECT_TYPES)[number] = "cli") =>
	Object.fromEntries(
		sections(readme, type).map((s) => [s.id, s.found ? s.found.text : null]),
	);

describe("sections", () => {
	it("normalises heading text and splits combined headings", () => {
		expect(normaliseHeading("🚀 1. What's next?")).toBe("whats next");
		expect(normaliseHeading("Prerequisites (install once)")).toBe(
			"prerequisites install once",
		);
		expect(headingParts("Contributing and License")).toEqual([
			"contributing",
			"license",
		]);
		expect(headingParts("Install & Setup / Usage")).toEqual([
			"install",
			"setup",
			"usage",
		]);
	});

	it("matches a synonym exactly or as the first whole words, not inside a word", () => {
		expect(matchSynonym("Usage notes", SECTIONS.usage.synonyms)).toBe("usage");
		expect(
			matchSynonym("Licensed fonts", SECTIONS.license.synonyms),
		).toBeUndefined();
		expect(matchSynonym("What is Rowcount?", SECTIONS.overview.synonyms)).toBe(
			"what is",
		);
		expect(matchSynonym("Why Rowcount", SECTIONS.features.synonyms)).toBe(
			"why",
		);
		expect(matchSynonym("FAQ", SECTIONS.troubleshooting.synonyms)).toBe("faq");
	});

	it("finds every section of the complete CLI fixture at its heading", () => {
		const r = sections(fixture("cli-complete.md"), "cli");
		expect(r.every((s) => s.found)).toBe(true);
		expect(r.find((s) => s.id === "license")?.found?.line).toBe(56);
	});

	it("prefers the heading that matches the strongest synonym", () => {
		const md = "# T\n\n## Use it with your editor\n\n## Commands\n";
		expect(found(md).usage).toBe("Commands");
		expect(found("# T\n\n## Use it with your editor\n").usage).toBe(
			"Use it with your editor",
		);
	});

	it("does not count the title, and counts a combined heading for both sections", () => {
		expect(
			found("# Installation guide\n\n## Contributing and license\n"),
		).toMatchObject({
			installation: null,
			contributing: "Contributing and license",
			license: "Contributing and license",
		});
	});

	it("says where a missing section goes: after the nearest earlier section it has, else before the first section", () => {
		const md = [
			"# T",
			"",
			"Intro.",
			"",
			"## Installation",
			"",
			"npm i t",
			"",
			"### Details",
			"",
			"More.",
			"",
			"## License",
			"",
			"MIT",
		].join("\n");
		const r = Object.fromEntries(sections(md, "cli").map((s) => [s.id, s]));
		expect(r.usage.insertAt).toEqual({ line: 13, before: "License" });
		expect(r.overview.insertAt).toEqual({ line: 5, before: "Installation" });
		expect(r.roadmap.insertAt).toEqual({ line: 13, before: "License" });
		expect(sections("# T\n\nNo sections.\n", "cli")[0].insertAt).toEqual({
			line: 4,
			before: null,
		});
	});

	it("weights each section by project type and has a weight for every section", () => {
		for (const t of PROJECT_TYPES)
			for (const id of SECTION_IDS)
				expect([1, 2, 3]).toContain(WEIGHTS[t].weights[id]);
		expect(WEIGHTS.app.weights.configuration).toBe(3);
		expect(WEIGHTS.library.weights.prerequisites).toBe(1);
	});

	it("scores 40 for every section and names the line and heading to add for each miss", () => {
		const full = score({
			readme: fixture("cli-complete.md"),
			readmePath: "README.md",
			type: "cli",
		}).groups[0];
		expect([full.points, full.max]).toEqual([40, 40]);
		const lib = score({
			readme: fixture("library.md"),
			readmePath: "README.md",
			type: "library",
		}).groups[0];
		const missing = lib.checks.filter((c) => !c.pass).map((c) => c.title);
		expect(missing).toEqual([
			"Overview",
			"Key features",
			"Prerequisites",
			"Installation",
			"Configuration",
			"Troubleshooting",
			"Roadmap",
			"Contributing",
		]);
		const overview = lib.checks.find((c) => c.id === "section.overview");
		expect(overview?.fix).toBe(
			'Add "## What is slugkit?" at line 15, before "API". Two or three sentences: what slugkit does, who it is for, and what it replaces.',
		);
		expect(overview?.snippet?.startsWith("## What is slugkit?\n\n")).toBe(true);
		expect(lib.points).toBeLessThan(40);
	});
});

describe("project type", () => {
	const pkg = (o: object) => ({
		path: "package.json",
		text: JSON.stringify(o),
	});

	it("reads it from package.json: bin, web frameworks, then main", () => {
		const none = new Set<string>();
		expect(typeFromFiles([pkg({ bin: { x: "x.js" } })], none)).toEqual({
			type: "cli",
			reason: 'package.json has a "bin" field',
		});
		expect(
			typeFromFiles([pkg({ dependencies: { next: "15" } })], none)?.type,
		).toBe("app");
		expect(
			typeFromFiles(
				[pkg({ dependencies: { react: "19", express: "5" } })],
				none,
			)?.type,
		).toBe("app");
		expect(
			typeFromFiles([pkg({ dependencies: { hono: "4" } })], none)?.type,
		).toBe("api");
		expect(
			typeFromFiles(
				[pkg({ main: "index.js", devDependencies: { react: "19" } })],
				none,
			)?.type,
		).toBe("library");
		expect(
			typeFromFiles([pkg({ dependencies: { vue: "3" } })], none)?.type,
		).toBe("app");
	});

	it("asks a workspace's package one folder down when the root has no answer", () => {
		const root = pkg({ private: true, workspaces: ["cli"] });
		const cli = {
			path: "cli/package.json",
			text: JSON.stringify({ bin: { flisk: "dist/cli.js" } }),
		};
		expect(typeFromFiles([cli, root], new Set())).toEqual({
			type: "cli",
			reason: 'cli/package.json has a "bin" field',
		});
	});

	it("reads pyproject.toml, Cargo.toml, go.mod and a Compose file", () => {
		const toml = (path: string, text: string) => [{ path, text }];
		expect(
			typeFromFiles(
				toml(
					"pyproject.toml",
					'[project]\nname = "x"\n[project.scripts]\nx = "x:main"\n',
				),
				new Set(),
			)?.type,
		).toBe("cli");
		expect(
			typeFromFiles(
				toml(
					"pyproject.toml",
					'[project]\ndependencies = ["fastapi>=0.110"]\n',
				),
				new Set(),
			)?.type,
		).toBe("api");
		expect(
			typeFromFiles(
				toml("pyproject.toml", '[project]\ndependencies = ["django"]\n'),
				new Set(),
			)?.type,
		).toBe("app");
		expect(
			typeFromFiles(
				toml("pyproject.toml", '[project]\nname = "x"\n'),
				new Set(),
			)?.type,
		).toBe("library");
		expect(
			typeFromFiles(
				toml("Cargo.toml", '[package]\nname = "x"\n'),
				new Set(["src/main.rs"]),
			)?.type,
		).toBe("cli");
		expect(
			typeFromFiles(
				toml(
					"Cargo.toml",
					'[package]\nname = "x"\n[dependencies]\naxum = "0.7"\n',
				),
				new Set(),
			)?.type,
		).toBe("api");
		expect(typeFromFiles([], new Set(["go.mod", "cmd/x/main.go"]))?.type).toBe(
			"cli",
		);
		expect(typeFromFiles([], new Set(["go.mod", "x.go"]))?.type).toBe(
			"library",
		);
		expect(typeFromFiles([], new Set(["compose.yaml"]))?.type).toBe("app");
		expect(typeFromFiles([], new Set(["README.md"]))).toBeNull();
	});

	it("reads a pasted README for signals, with ties going to the earlier type and none to a CLI", () => {
		expect(typeFromReadme(fixture("cli-complete.md")).type).toBe("cli");
		expect(typeFromReadme(fixture("library.md")).type).toBe("library");
		expect(typeFromReadme(fixture("app.md")).type).toBe("app");
		expect(typeFromReadme(fixture("api.md")).type).toBe("api");
		expect(typeFromReadme(fixture("bare.md"))).toEqual({
			type: "cli",
			reason: "nothing in the README says otherwise",
		});
	});

	it("uses the type chosen over the detected one", () => {
		const r = score({
			readme: fixture("api.md"),
			readmePath: "README.md",
			type: "library",
		});
		expect([r.type.type, r.type.chosen, r.type.reason]).toEqual([
			"library",
			true,
			"chosen",
		]);
		expect(
			score({ readme: fixture("api.md"), readmePath: "README.md" }).type,
		).toMatchObject({ type: "api", chosen: false });
	});
});
