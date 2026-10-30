import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Io, main } from "../src/cli";
import { loadLocal, NoReadme } from "../src/local";

const README = `# slugkit

Turn titles into slugs.

\`\`\`bash
npm install slugkit
\`\`\`

## Usage

\`\`\`js
import { slug } from "slugkit";
\`\`\`

## License

MIT
`;

function project(readme = README) {
	const dir = mkdtempSync(join(tmpdir(), "readme-score-"));
	writeFileSync(join(dir, "README.md"), readme);
	writeFileSync(
		join(dir, "package.json"),
		JSON.stringify({ name: "slugkit", description: "Turn titles into slugs." }),
	);
	return dir;
}

async function run(argv: string[]) {
	const out: string[] = [];
	const err: string[] = [];
	const io: Io = { out: (t) => out.push(t), err: (t) => err.push(t) };
	const code = await main(argv, io);
	return { code, out: out.join("\n"), err: err.join("\n") };
}

describe("readme-score", () => {
	it("scores a folder", async () => {
		const { code, out } = await run([project(), "--no-website"]);
		expect(code).toBe(0);
		expect(out).toMatch(/\d+\/100 \(grade [A-F]\)/);
		expect(out).toContain("Fix:");
	});

	it("gives the same JSON for the same files", async () => {
		const dir = project();
		const a = await run([dir, "--no-website", "--json"]);
		const b = await run([dir, "--no-website", "--json"]);
		expect(a.out).toBe(b.out);
		expect(typeof JSON.parse(a.out).score).toBe("number");
	});

	it("exits 1 below --min-score and 0 at it", async () => {
		const dir = project();
		const { out } = await run([dir, "--no-website", "--json"]);
		const s = JSON.parse(out).score as number;
		expect(
			(await run([dir, "--no-website", "--min-score", String(s)])).code,
		).toBe(0);
		const low = await run([dir, "--no-website", "--min-score", String(s + 1)]);
		expect(low.code).toBe(1);
		expect(low.err).toContain("below --min-score");
	});

	it("prints a Markdown table for the job summary", async () => {
		const { out } = await run([project(), "--no-website", "--markdown"]);
		expect(out).toContain("| Group | Points |");
		expect(out).toContain("**How to fix**");
	});

	it("exits 2 for a folder without a README and for bad usage", async () => {
		const empty = mkdtempSync(join(tmpdir(), "readme-score-"));
		mkdirSync(join(empty, "docs"));
		expect((await run([empty, "--no-website"])).code).toBe(2);
		expect((await run(["--min-score", "101"])).code).toBe(2);
		expect((await run(["--type", "nope"])).code).toBe(2);
		expect(() => loadLocal(empty)).toThrow(NoReadme);
	});
});
