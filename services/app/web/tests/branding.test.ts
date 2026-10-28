import { describe, expect, it } from "bun:test";
import {
	brandName,
	commandsIn,
	installCommand,
	leadCommand,
	nameSpellings,
} from "../src/readme/branding";
import { score } from "../src/readme/score";
import { readWebsite } from "../src/readme/website";

describe("name spelling", () => {
	it("takes the name as the H1 spells it", () => {
		expect([
			brandName("Flisk: your stack"),
			brandName("README Score: x"),
			brandName(null),
		]).toEqual(["Flisk", "README", null]);
	});

	it("finds other capitalisations in prose, with counts and first lines, and ignores code, links, paths and lower case", () => {
		const md = [
			"# Flisk: your stack",
			"",
			"FLISK runs it. Flisk's agent and Flisk-powered apps are fine.",
			"Run `FLISK up` or flisk up; see [FLisk docs](https://FLISK.sh/FLISK) and docs/FLISK.md.",
			"```",
			"FLISK in code",
			"```",
			"Then FLISK again, and FLisk once.",
		].join("\n");
		expect(nameSpellings(md, "Flisk")).toEqual([
			{ spelling: "FLISK", count: 2, line: 3 },
			{ spelling: "FLisk", count: 2, line: 4 },
		]);
	});

	it("scores 2 for one spelling and points at the first other one", () => {
		const check = (md: string) =>
			score({ readme: md, readmePath: "README.md", type: "cli" }).groups.find(
				(g) => g.id === "tagline",
			)?.checks[1];
		expect([
			check("# Rowcount\n\nRowcount counts rows; run rowcount.\n")?.pass,
			check("# Rowcount\n\nx\n")?.points,
		]).toEqual([true, 2]);
		const bad = check("# Rowcount\n\nIt counts.\n\nROWCOUNT is fast.\n");
		expect([bad?.pass, bad?.measured, bad?.line]).toEqual([
			false,
			'1 use spelled otherwise than "Rowcount"',
			5,
		]);
		expect(bad?.fix).toContain('Spell it "Rowcount" everywhere');
	});
});

describe("lead and install command", () => {
	const readme = [
		"npm install -g @flisk-sh/flisk",
		"mkdir my-shop",
		"cd my-shop",
		"flisk project --yes",
		"flisk up shop",
	];

	it("leads with the first <name> command, else the first command that is not an install or a cd", () => {
		expect(leadCommand(readme, "Flisk", ["flisk"])).toBe("flisk project");
		expect(
			leadCommand(["npm i rowcount", "cd x", "node demo.js"], "rowcount", [
				"rowcount",
			]),
		).toBe("node demo.js");
		expect(leadCommand(["cd x"], "rowcount")).toBeNull();
	});

	it("reads the commands a website shows, prompts dropped", () => {
		expect(
			commandsIn([
				"$ flisk import .\n$ flisk up",
				"npm install -g @flisk-sh/flisk",
			]),
		).toEqual(["flisk import .", "flisk up", "npm install -g @flisk-sh/flisk"]);
		expect(installCommand(readme, ["flisk"])).toBe(
			"npm install -g @flisk-sh/flisk",
		);
	});

	it("fails when the website leads with another command or shows another install", () => {
		const site = readWebsite(
			'<title>Flisk: your stack</title><meta name="description" content="Your stack."><pre>curl -fsSL https://flisk.sh/install.sh | sh\nflisk import .\nflisk up</pre>',
			"https://flisk.sh/",
		);
		const r = score({
			readme: `# Flisk: your stack\n\nYour stack.\n\n\`\`\`bash\n${readme.join("\n")}\n\`\`\`\n`,
			readmePath: "README.md",
			type: "cli",
			website: site,
		});
		const [, , lead, install] =
			r.groups.find((g) => g.id === "website")?.checks ?? [];
		expect([lead.pass, lead.measured, lead.line]).toEqual([
			false,
			"the README leads with flisk project, the website with flisk import",
			6,
		]);
		expect([install.pass, install.measured]).toEqual([
			false,
			"the README: npm install -g @flisk-sh/flisk; the website: curl -fsSL https://flisk.sh/install.sh | sh",
		]);
	});
});
