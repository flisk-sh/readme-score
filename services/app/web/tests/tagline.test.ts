import { describe, expect, it } from "bun:test";
import { firstH1 } from "../src/readme/markdown";
import { score } from "../src/readme/score";
import {
	groups,
	llmsSummary,
	manifestDescription,
	normalise,
	taglines,
} from "../src/readme/tagline";

const pkg = (description: string, extra = {}) =>
	JSON.stringify({ name: "x", description, ...extra }, null, 2);

describe("tagline", () => {
	it("treats the same tagline behind a name prefix, case, punctuation, links and URLs as one", () => {
		expect(normalise("Flisk: Your stack, locally.", ["flisk"])).toBe(
			"your stack locally",
		);
		expect(normalise("Flisk CLI — your stack locally", ["flisk"])).toBe(
			"your stack locally",
		);
		expect(
			normalise("Flisk is [your stack](https://x) locally!", ["flisk"]),
		).toBe("your stack locally");
		expect(
			normalise("Your stack locally. https://flisk.sh 💚", ["flisk"]),
		).toBe("your stack locally");
		expect(normalise("Flisk: your stack", [])).toBe("flisk your stack");
	});

	it("reads descriptions from package.json and TOML manifests, with their line", () => {
		expect(
			manifestDescription({ path: "package.json", text: pkg("Count rows.") }),
		).toEqual({ text: "Count rows.", line: 3 });
		expect(
			manifestDescription({ path: "package.json", text: "{ not json" }),
		).toBeNull();
		const toml =
			'[build-system]\nrequires = []\n\n[project]\nname = "rowcount"\ndescription = "Count rows."\n\n[tool.x]\ndescription = "other"\n';
		expect(manifestDescription({ path: "pyproject.toml", text: toml })).toEqual(
			{ text: "Count rows.", line: 6 },
		);
		expect(
			manifestDescription({
				path: "Cargo.toml",
				text: "[package]\nname = 'rowcount'\ndescription = 'Count rows.'\n",
			}),
		).toEqual({
			text: "Count rows.",
			line: 3,
		});
		expect(llmsSummary("# Rowcount\n\n> Count rows.\n")).toEqual({
			text: "Count rows.",
			line: 3,
		});
	});

	it("skips comments in code fences for the H1 and reads an <h1> element", () => {
		expect(firstH1("```bash\n# install\n```\n# Real title\n")).toBe(
			"Real title",
		);
		expect(firstH1('<h1 align="center">Flisk</h1>\n')).toBe("Flisk");
		expect(firstH1("## Only a subheading\n")).toBeNull();
		expect(firstH1("Rowcount\n===\n")).toBe("Rowcount");
		expect(firstH1("- a list item\n===\n")).toBeNull();
	});

	it("lists every source, a missing one as none, and groups the wordings, largest first", () => {
		const sources = taglines({
			readme: "# Flisk: your stack, locally\n",
			readmePath: "README.md",
			manifests: [
				{
					path: "package.json",
					text: pkg("Flisk CLI — start services on your machine."),
				},
				{ path: "cli/package.json", text: JSON.stringify({ name: "y" }) },
			],
			llms: [
				{ path: "docs/llms.txt", text: "> Flisk is your stack, locally.\n" },
			],
			githubDescription: "Your stack, locally",
		});
		expect(sources.map((s) => [s.source, s.text, s.line])).toEqual([
			["README.md H1", "Flisk: your stack, locally", 1],
			[
				"package.json description",
				"Flisk CLI — start services on your machine.",
				3,
			],
			["cli/package.json description", null, undefined],
			["docs/llms.txt", "Flisk is your stack, locally.", 1],
			["GitHub About description", "Your stack, locally", undefined],
		]);
		const g = groups(sources, ["flisk"]);
		expect(g.map((x) => [x.wording, x.sources.length])).toEqual([
			["your stack locally", 3],
			["start services on your machine", 1],
		]);
	});

	it("scores one wording 5, two 2.5 and three 0, and skips a single source", () => {
		const check = (
			manifests: { path: string; text: string }[],
			description?: string | null,
		) =>
			score({
				readme: "# Rowcount: count rows\n",
				readmePath: "README.md",
				manifests,
				type: "cli",
				...(description !== undefined
					? {
							repo: {
								owner: "acme",
								name: "rowcount",
								ref: "main",
								sha: "a".repeat(40),
								description,
							},
						}
					: {}),
			}).groups.find((g) => g.id === "tagline")?.checks[0];
		expect(
			check([{ path: "package.json", text: pkg("Rowcount: count rows.") }])
				?.points,
		).toBe(5);
		const two = check([{ path: "package.json", text: pkg("Counts lines.") }]);
		expect([two?.pass, two?.points, two?.measured]).toEqual([
			false,
			2.5,
			"2 wordings across 2 sources",
		]);
		expect(two?.fix).toBe(
			'Use one wording everywhere. The most used is "Rowcount: count rows"; change package.json description.',
		);
		const three = check(
			[{ path: "package.json", text: pkg("Counts lines.") }],
			"A CSV tool",
		);
		expect([three?.points, three?.fix?.includes("gear next to About")]).toEqual(
			[0, true],
		);
		const one = check([]);
		expect([one?.pass, one?.measured]).toEqual([
			null,
			"1 source: nothing to compare",
		]);
	});
});
