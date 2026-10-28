import { describe, expect, it } from "bun:test";
import {
	firstInstall,
	firstScreen,
	IMAGE_WITHIN_LINES,
	INSTALL_WITHIN_LINES,
	installsProject,
	MAX_BADGES_BEFORE_CODE,
	MAX_PROSE_WORDS_BEFORE_CODE,
	proseWords,
} from "../src/readme/first-screen";
import { score } from "../src/readme/score";
import { fixture } from "./helpers";

const shield = (n: number) =>
	`[![b${n}](https://img.shields.io/badge/b-${n}-blue)](https://x)`;
const firstScreenChecks = (readme: string) =>
	score({ readme, readmePath: "README.md", type: "cli" }).groups.find(
		(g) => g.id === "first-screen",
	)?.checks ?? [];

describe("first screen", () => {
	it("passes all five for a title, picture, few badges, short pitch and install command", () => {
		const readme = [
			'<div align="center">',
			"",
			"# Flisk: your stack, locally",
			"",
			'<img src="docs/assets/demo.svg" alt="demo">',
			"",
			`${shield(1)} ${shield(2)}`,
			"",
			"</div>",
			"",
			"```bash",
			"npm install -g @flisk-sh/flisk",
			"```",
		].join("\n");
		const checks = firstScreenChecks(readme);
		expect(checks.map((c) => c.pass)).toEqual([true, true, true, true, true]);
		expect(checks.every((c) => c.fix === undefined)).toBe(true);
	});

	it("reports each failing check with what was measured, the limit and a fix that names the line", () => {
		const readme = [
			"intro",
			"",
			"more intro",
			"",
			"text",
			"",
			"text",
			"",
			"text",
			"",
			"# Flisk",
			Array.from({ length: MAX_BADGES_BEFORE_CODE + 1 }, (_, i) =>
				shield(i),
			).join(" "),
			"word ".repeat(MAX_PROSE_WORDS_BEFORE_CODE),
			...Array.from(
				{ length: Math.max(IMAGE_WITHIN_LINES, INSTALL_WITHIN_LINES) },
				() => "",
			),
			"![late](docs/assets/demo.svg)",
			"```bash",
			"npm install -g @flisk-sh/flisk",
			"```",
		].join("\n");
		const checks = firstScreenChecks(readme);
		expect(checks.map((c) => [c.pass, c.measured, c.limit])).toEqual([
			[false, "non-empty line 6", "within 5 non-empty lines"],
			[false, "line 56", "within 40 lines"],
			[false, "line 54", "within 20 lines; badges do not count"],
			[false, "7", "at most 6"],
			[false, "257", "at most 250"],
		]);
		expect(checks[0].fix).toContain("line 11");
		expect(checks[1].fix).toContain("line 56 (npm install -g @flisk-sh/flisk)");
		expect(checks[2].fix).toContain("line 54");
		expect(checks[3].fix).toContain("Drop 1 of the 7 badges on line 12");
		expect(checks[4].fix).toContain(
			"Cut 7 words before the first code block at line 55",
		);
		expect(checks.every((c) => c.points === 0)).toBe(true);
	});

	it("suggests a title, an install block and a picture when there are none", () => {
		const checks = firstScreenChecks(fixture("bare.md"));
		expect(checks[0].fix).toBe(
			'Add a title as the first line: "# your project: what it does, in one line".',
		);
		expect(checks[1].snippet).toBe("```bash\nnpm install -g <package>\n```");
		expect(checks[2].snippet).toBe("![your project in action](docs/demo.gif)");
	});

	it("does not count a badge as the picture, or another tool's curl installer as the install command", () => {
		const readme = [
			"# Flisk",
			shield(1),
			"```bash",
			"curl -fsSL https://claude.ai/install.sh | bash",
			"```",
			"",
			"```bash",
			"curl -fsSL https://flisk.sh/install.sh | sh",
			"```",
		].join("\n");
		const s = firstScreen(readme, ["flisk"]);
		expect(s.image).toBe(0);
		expect(s.install?.line).toBe(8);
	});

	it("counts a project's curl installer whichever shell it pipes into, and not a pipe into another program", () => {
		for (const shell of ["sh", "bash", "zsh"])
			expect(
				firstInstall(
					`# Flisk\n\n\`\`\`bash\ncurl -fsSL https://flisk.sh/install.sh | ${shell}\n\`\`\`\n`,
					["flisk"],
				)?.line,
			).toBe(4);
		expect(
			firstInstall(
				"```bash\ncurl -fsSL https://flisk.sh/install.sh | shellcheck\n```\n",
				["flisk"],
			),
		).toBeNull();
	});

	it("recognises the install commands of the common package managers", () => {
		const yes = [
			"npm install -g rowcount",
			"npm i rowcount",
			"pnpm add rowcount",
			"yarn add rowcount",
			"bun add rowcount",
			"npx create-rowcount",
			"npm create vite@latest",
			"pip install rowcount",
			"pipx install rowcount",
			"uv tool install rowcount",
			"cargo install rowcount",
			"go install github.com/acme/rowcount@latest",
			"brew install rowcount",
			"gem install rowcount",
			"composer require acme/rowcount",
			"dotnet tool install -g rowcount",
			"sudo apt install rowcount",
			"winget install rowcount",
			"docker run acme/rowcount",
			"docker compose up",
			"git clone https://github.com/acme/rowcount",
			"$ deno add jsr:@acme/rowcount",
		];
		for (const line of yes)
			expect([line, installsProject(line, ["rowcount"])]).toEqual([line, true]);
		for (const line of [
			"npm init",
			"npm test",
			"rowcount --help",
			"cd rowcount",
			"brew update",
		])
			expect([line, installsProject(line, ["rowcount"])]).toEqual([
				line,
				false,
			]);
	});

	it("finds the install command in inline code but not in plain prose", () => {
		expect(
			firstInstall("Install it with `npm install rowcount`.\n", [])?.command,
		).toBe("npm install rowcount");
		expect(firstInstall("Use npm install to get it.\n", [])).toBeNull();
	});

	it("does not take a # comment inside a code block for the title", () => {
		expect(
			firstScreen(
				"```bash\n# install\nnpm install -g @flisk-sh/flisk\n```\n\n# Flisk\n![demo](demo.svg)\n",
			).h1,
		).toBe(5);
		const late = firstScreen(
			"```bash\n# install\n```\n\n## A\n\n## B\n\n# Flisk\n",
		);
		expect([late.h1, late.h1Line]).toEqual([6, 9]);
	});

	it("takes a line underlined with === for the title too", () => {
		expect(
			firstScreen("![logo](logo.png)\n\nRowcount\n========\n\nCounts rows.\n"),
		).toMatchObject({ h1: 2, h1Line: 3 });
		expect(firstScreen("Rowcount\n--------\n").h1).toBe(0);
	});

	it("counts prose words without HTML tags, images, badges and link targets, keeping link text", () => {
		const md = `<p align="center"><sub>Two words</sub></p>\n${shield(1)} ![alt text](x.png)\nSee [the docs](https://flisk.sh/docs) · now <!-- hidden words -->`;
		expect(proseWords(md)).toBe(6);
	});

	it("passes the complete CLI fixture", () => {
		const s = firstScreen(fixture("cli-complete.md"), ["rowcount"]);
		expect(s).toMatchObject({
			h1: 1,
			h1Line: 1,
			image: 3,
			badges: { count: 2, lines: [5] },
			install: { line: 10 },
		});
		expect(s.words).toBeLessThanOrEqual(MAX_PROSE_WORDS_BEFORE_CODE);
	});
});
