import { describe, expect, it } from "bun:test";
import {
	hasCi,
	missingRepoFiles,
	placeholders,
	runtimes,
	showsResult,
	unnamedPrerequisites,
} from "../src/readme/clean-env";
import { codeBlocks } from "../src/readme/markdown";
import { shellCommands } from "../src/readme/quickstart";
import { type ReadmeInput, score } from "../src/readme/score";

const md = (...lines: string[]) => lines.join("\n");
const byId = (input: Partial<ReadmeInput> & { readme: string }) =>
	Object.fromEntries(
		(
			score({ readmePath: "README.md", type: "cli", ...input }).groups.find(
				(g) => g.id === "clean",
			)?.checks ?? []
		).map((c) => [c.id, c]),
	);

describe("placeholders", () => {
	it("finds values a reader must fill in, not redirects or flags", () => {
		expect(
			placeholders([
				"export API_KEY=<your-key>",
				"curl -H 'x: YOUR_API_KEY' https://a.dev",
				"app login --token xxxx",
				"wc -l < file.txt",
				"app run --port 3000",
			]).map((p) => p.token),
		).toEqual(["<your-key>", "YOUR_API_KEY", "xxxx"]);
	});
});

describe("prerequisites", () => {
	const readme = (extra: string) =>
		md("# t", "", "```bash", "npm install -g t", "t up", "```", "", extra);
	const unnamed = (text: string) => {
		const block = codeBlocks(text)[0];
		return unnamedPrerequisites(
			text,
			block,
			runtimes(shellCommands(block.body)),
		);
	};
	it("maps commands to the tools they need", () => {
		expect(
			runtimes([
				"npm i x",
				"pip install y",
				"sudo docker run z",
				"git clone u",
			]),
		).toEqual(["node", "python", "docker"]);
	});
	it("accepts a version, a requirement word or a Requirements heading, outside the quickstart", () => {
		expect(unnamed(readme("Requires Node.js."))).toEqual([]);
		expect(unnamed(readme("Works with Node 20."))).toEqual([]);
		expect(unnamed(readme("## Requirements\n\n- Node.js"))).toEqual([]);
	});
	it("reports a tool the README never names", () => {
		expect(unnamed(readme("Fast and small."))).toEqual(["node"]);
	});
});

describe("repository files", () => {
	const repo = ["rowcount"];
	const run = (cmds: string[], files: string[]) =>
		missingRepoFiles(cmds, new Set(files), repo);
	it("is not checked without a clone of this repository, or without the tree", () => {
		expect(run(["npm install", "./setup.sh"], [])).toBeNull();
		expect(
			missingRepoFiles(
				["git clone https://github.com/a/rowcount"],
				undefined,
				repo,
			),
		).toBeNull();
	});
	it("follows the clone and cd, and reports files and build files that are not there", () => {
		const cmds = [
			"git clone https://github.com/acme/rowcount.git",
			"cd rowcount",
			"cp .env.example .env",
			"npm ci",
			"./scripts/dev.sh",
			"make run",
		];
		expect(
			run(cmds, ["package.json", ".env.example", "scripts/dev.sh", "Makefile"]),
		).toEqual([]);
		expect(run(cmds, [".env.example"])).toEqual([
			{ command: "npm ci", file: "package.json" },
			{ command: "./scripts/dev.sh", file: "./scripts/dev.sh" },
			{ command: "make run", file: "Makefile" },
		]);
		expect(run(cmds, ["package.json", "scripts/dev.sh", "Makefile"])).toEqual([
			{ command: "cp .env.example .env", file: ".env.example" },
		]);
	});
});

describe("result and CI", () => {
	const after = (text: string) => {
		const t = md("# t", "", "```bash", "t up", "```", "", text);
		return showsResult(t, codeBlocks(t)[0]);
	};
	it("wants output, a URL or 'you should see' after the block", () => {
		expect(after("Open http://localhost:3000.")).toBe(true);
		expect(after("You should see a table.")).toBe(true);
		expect(after("Fast and small.")).toBe(false);
	});
	it("counts output under a prompted command", () => {
		const t = md("```bash", "$ t up", "ready on 3000", "```");
		expect(showsResult(t, codeBlocks(t)[0])).toBe(true);
	});
	it("finds a CI config, and cannot tell without a file tree", () => {
		expect(hasCi(new Set([".github/workflows/ci.yml"]))).toBe(true);
		expect(hasCi(new Set(["README.md", ".github/CODEOWNERS"]))).toBe(false);
		expect(hasCi(undefined)).toBeNull();
	});
});

describe("clean group", () => {
	it("fails what it can without a quickstart and skips what needs the repository", () => {
		const c = byId({ readme: "# t\n\nNothing.\n" });
		expect([
			c["clean.prerequisites"].pass,
			c["clean.files"].pass,
			c["clean.ci"].pass,
		]).toEqual([false, null, null]);
	});
	it("passes a quickstart that names its tools, shows its result and has CI", () => {
		const c = byId({
			readme: md(
				"# t",
				"",
				"Requires Node 20.",
				"",
				"```bash",
				"npm install -g t",
				"t up",
				"```",
				"",
				"Open http://localhost:3000.",
			),
			paths: new Set(["README.md", ".github/workflows/ci.yml"]),
		});
		expect(Object.values(c).map((x) => x.pass)).toEqual([
			true,
			true,
			null,
			true,
			true,
		]);
	});
});
