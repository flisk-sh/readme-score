import { describe, expect, it } from "bun:test";
import {
	drift,
	MAX_QUICKSTART_COMMANDS,
	quickstart,
	shellCommands,
	translationPaths,
} from "../src/readme/quickstart";
import { type ReadmeInput, score } from "../src/readme/score";
import { fixture } from "./helpers";

const block = (...lines: string[]) =>
	`\`\`\`bash\n${lines.join("\n")}\n\`\`\`\n`;
const ENGLISH = `# Flisk\n\nRun it.\n\n${block(
	"npm install -g @flisk-sh/flisk",
	"mkdir my-shop && cd my-shop",
	"flisk project --yes",
	"flisk resource orders-api --type backend --stack shop --yes",
	"flisk resource shop-web --type frontend --stack shop --yes",
	"flisk up shop",
)}`;
const group = (input: Partial<ReadmeInput> & { readme: string }) =>
	score({ readmePath: "README.md", type: "cli", ...input }).groups.find(
		(g) => g.id === "quickstart",
	)?.checks ?? [];

describe("quickstart", () => {
	it("splits && and ;, joins continuations and drops comments and prompts", () => {
		expect(
			shellCommands(
				"mkdir a && cd a; ls\n\n# note\n$ flisk up \\\n  shop  # start\n",
			),
		).toEqual(["flisk up shop"]);
		expect(
			shellCommands(
				"mkdir a && cd a; ls\n\n# note\nflisk up \\\n  shop  # start\n",
			),
		).toEqual(["mkdir a", "cd a", "ls", "flisk up shop"]);
	});

	it("counts only the prompted lines of a block that shows output", () => {
		expect(
			shellCommands(
				"$ rowcount sales.csv\n1204 rows\n$ rowcount --help\nUsage: rowcount <file>",
			),
		).toEqual(["rowcount sales.csv", "rowcount --help"]);
	});

	it("is the first shell block that installs the project, or an unlabelled one, and not a text block", () => {
		expect(quickstart(ENGLISH)?.line).toBe(6);
		expect(quickstart("```text\nnpm install x\n```\n")).toBeNull();
		expect(
			quickstart("```bash\nls\n```\n\n```\nnpm install x\n```\n")?.line,
		).toBe(6);
		expect(
			quickstart(
				"```bash\ncurl -fsSL https://other.dev/install.sh | sh\n```\n",
				["flisk"],
			),
		).toBeNull();
	});

	it("passes with at most the limit of commands and fails with more, listing them in order", () => {
		const [found, length] = group({ readme: ENGLISH });
		expect([found.pass, found.line]).toEqual([true, 6]);
		expect([length.pass, length.measured]).toEqual([false, "7 commands"]);
		expect(length.fix).toContain(`Cut 1 of the 7`);
		expect(length.findings?.[0].text).toBe(
			"npm install -g @flisk-sh/flisk → mkdir my-shop → cd my-shop → flisk project --yes → flisk resource orders-api --type backend --stack shop --yes → flisk resource shop-web --type frontend --stack shop --yes → flisk up shop",
		);
		const short = group({ readme: fixture("cli-complete.md") });
		expect([short[1].pass, short[1].measured]).toEqual([true, "2 commands"]);
		expect(MAX_QUICKSTART_COMMANDS).toBe(6);
	});

	it("fails both checks without a quickstart, and suggests a block", () => {
		const [found, length] = group({ readme: fixture("bare.md") });
		expect([found.pass, length.pass, length.measured]).toEqual([
			false,
			false,
			"no quickstart",
		]);
		expect(found.snippet).toBe("```bash\nnpm install -g <package>\n```");
	});
});

describe("translations", () => {
	it("finds README.<lang>.md next to the README or in docs/, not deeper translations of other READMEs", () => {
		expect(
			translationPaths(
				[
					"README.md",
					"README.zh-CN.md",
					"docs/README-uk.md",
					"docs/README_pt-BR.md",
					"docs/recipes/README-fr.md",
					"docs/README-dev.md",
					"i18n/README.ja.md",
					"README-ci.txt",
				],
				"README.md",
			),
		).toEqual([
			"README.zh-CN.md",
			"docs/README-uk.md",
			"docs/README_pt-BR.md",
			"i18n/README.ja.md",
		]);
	});

	it("lets a translation rename its folder, and names what a drifted one lost or gained", () => {
		const en = block("npm install -g x", "mkdir shop && cd shop", "x up");
		expect(
			drift(
				en,
				block(
					"npm install -g x",
					"mkdir laden && cd laden",
					"# kommentar",
					"x up",
				),
			),
		).toEqual([]);
		expect(drift(en, block("npm install -g x"))).toEqual(['missing "x up"']);
		expect(drift(en, block("npm install -g x", "x doctor", "x up"))).toEqual([
			'extra "x doctor"',
		]);
		expect(drift(en, block("x up", "npm install -g x"))).toEqual([
			"same commands in a different order",
		]);
		expect(drift(en, null)).toEqual([
			"no quickstart (no shell block installs the project)",
		]);
	});

	it("scores the share of translations that agree, and skips the check when there are none", () => {
		const uk = `# Flisk\n\n${block(
			"npm install -g @flisk-sh/flisk",
			"mkdir shop && cd shop",
			"flisk project --yes",
			"flisk resource orders-api --type backend --stack shop --yes",
			"flisk resource shop-web --type frontend --stack shop --yes",
			"flisk up shop",
		)}`;
		const old = `# Flisk\n\n${block("npm install -g @flisk-sh/flisk", "flisk up shop")}`;
		const t = group({
			readme: ENGLISH,
			translations: [
				{ path: "docs/README-uk.md", text: uk },
				{ path: "docs/README-de.md", text: old },
			],
		})[2];
		expect([t.pass, t.measured, t.points, t.max]).toEqual([
			false,
			"1 of 2 differ",
			2.5,
			5,
		]);
		expect(t.findings?.map((f) => `${f.file}: ${f.text}`)).toEqual([
			'docs/README-de.md: missing "flisk project --yes"',
			'docs/README-de.md: missing "flisk resource orders-api --type backend --stack shop --yes"',
			'docs/README-de.md: missing "flisk resource shop-web --type frontend --stack shop --yes"',
		]);
		const none = group({ readme: ENGLISH, paths: new Set(["README.md"]) })[2];
		expect([none.pass, none.measured]).toEqual([null, "no translated READMEs"]);
		expect(group({ readme: ENGLISH })[2].measured).toBe(
			"not checked: needs the repository",
		);
	});
});
