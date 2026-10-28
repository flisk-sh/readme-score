import { describe, expect, it } from "bun:test";
import {
	brokenAnchors,
	brokenFileLinks,
	distance,
	exists,
} from "../src/readme/links";
import {
	headings,
	htmlAnchors,
	linkPath,
	links,
	Slugger,
	slugBase,
} from "../src/readme/markdown";
import { score } from "../src/readme/score";
import { fixture } from "./helpers";

const PATHS = new Set(["README.md", "docs", "docs/guide.md", "LICENSE"]);

describe("link targets", () => {
	it("finds inline, image, reference and HTML links with their line, not code", () => {
		const md = [
			'See [a](a.md) and ![b](img/b.png "title").',
			"[c](<with space.md>) [d]: not a definition",
			"[e]: ./e.md",
			'<a href="f.md">f</a> <img alt="g" src=\'g.svg\'>',
			"`[h](h.md)` and ``[i](i.md)``",
			"```md",
			"[j](j.md)",
			"```",
			"[k](k.md)",
		].join("\n");
		expect(links(md)).toEqual([
			{ line: 1, target: "a.md" },
			{ line: 1, target: "img/b.png" },
			{ line: 2, target: "with space.md" },
			{ line: 3, target: "./e.md" },
			{ line: 4, target: "f.md" },
			{ line: 4, target: "g.svg" },
			{ line: 9, target: "k.md" },
		]);
	});

	it("resolves relative and root links and leaves URLs, anchors and templates alone", () => {
		expect(linkPath("docs/a/b.md", "../c.md#part")).toBe("docs/c.md");
		expect(linkPath("docs/a.md", "./x.md?plain=1")).toBe("docs/x.md");
		expect(linkPath("README.md", "docs/a%20b.md")).toBe("docs/a b.md");
		expect(linkPath("docs/a.md", "/cli/README.md")).toBe("cli/README.md");
		expect(linkPath("docs/a.md", "../../up.md")).toBe("../up.md");
		for (const t of [
			"https://x.dev/a.md",
			"mailto:a@b.c",
			"vscode://x",
			"//cdn/x.js",
			"#anchor",
			"{{ link }}",
			"<name>.md",
			// biome-ignore lint/suspicious/noTemplateCurlyInString: a ${var} placeholder written in a link, on purpose
			"${dir}/a.md",
			"",
		])
			expect([t, linkPath("docs/a.md", t)]).toEqual([t, null]);
	});

	it("needs the exact case, takes folders, and the root", () => {
		expect([
			exists(PATHS, "docs/guide.md"),
			exists(PATHS, "docs/"),
			exists(PATHS, "docs/Guide.md"),
			exists(PATHS, "."),
		]).toEqual([true, true, false, true]);
	});
});

describe("relative links", () => {
	it("reports a missing file, a wrong case and a path outside the repo, with what probably was meant", () => {
		const r = brokenFileLinks(fixture("links.md"), "README.md", PATHS);
		expect(
			r.broken.map((b) => [b.line, b.target, b.why, b.suggestion]),
		).toEqual([
			[3, "docs/gone.md", "docs/gone.md does not exist", undefined],
			[3, "docs/Guide.md", "docs/Guide.md does not exist", "docs/guide.md"],
			[5, "../outside.md", "points outside the repository", undefined],
		]);
		// ok, folder, root, gone, case, up, self and other file; ../../issues is a github.com page, not a file.
		expect(r.checked).toBe(8);
	});

	it("takes one point off per broken link, and is not checked without the file tree", () => {
		const withTree = score({
			readme: fixture("links.md"),
			readmePath: "README.md",
			paths: PATHS,
			type: "cli",
		});
		const files = withTree.groups.find((g) => g.id === "links")?.checks[0];
		expect([files?.pass, files?.points, files?.measured, files?.line]).toEqual([
			false,
			2,
			"3 of 8 links broken",
			3,
		]);
		expect(files?.findings?.[1].text).toBe(
			"docs/Guide.md: docs/Guide.md does not exist; did you mean docs/guide.md?",
		);
		const pasted = score({
			readme: fixture("links.md"),
			readmePath: "README.md",
			type: "cli",
		});
		expect(
			pasted.groups.find((g) => g.id === "links")?.checks[0].pass,
		).toBeNull();
	});
});

describe("anchors", () => {
	it("slugs headings the way GitHub does, numbering repeats", () => {
		expect(slugBase("Prerequisites (install once)")).toBe(
			"prerequisites-install-once",
		);
		expect(slugBase("Why Flisk CLI?")).toBe("why-flisk-cli");
		expect(slugBase("🚀 Quick start")).toBe("-quick-start");
		expect(slugBase("Über `config.json`")).toBe("über-configjson");
		const s = new Slugger();
		expect(
			["Intro", "Intro", "Intro-1", "Intro"].map((t) => s.slug(t)),
		).toEqual(["intro", "intro-1", "intro-1-1", "intro-2"]);
	});

	it("reads ATX, Setext and HTML headings outside code, with their lines", () => {
		const md =
			'Title\n=====\n\n## Use [it](x) `now`\n\n```\n# not a heading\n```\n<h3 align="center">HTML one</h3>\n\nSub\n---\n';
		expect(headings(md).map((h) => [h.line, h.level, h.text, h.slug])).toEqual([
			[1, 1, "Title", "title"],
			[4, 2, "Use it now", "use-it-now"],
			[9, 3, "HTML one", "html-one"],
			[11, 2, "Sub", "sub"],
		]);
		// A --- right under a line of HTML is part of that HTML block, not an underline.
		expect(headings("<p>x</p>\nSub\n---\n")).toEqual([]);
		expect(
			htmlAnchors('<a id="Spot"></a> <div name=\'x\'>\n`<a id="code">`'),
		).toEqual(new Set(["spot", "x"]));
	});

	it("reports anchors that match no heading or id, with the nearest heading, and skips other files' anchors", () => {
		const r = brokenAnchors(fixture("links.md"), "README.md");
		expect(r.broken.map((b) => [b.line, b.target, b.suggestion])).toEqual([
			[9, "#quick-strat", "#quick-start"],
		]);
		// #quick-start, #quick-strat, README.md#quick-start, #custom-spot and #quick-start-1; #top and #L3 are GitHub's own.
		expect([r.checked, r.elsewhere]).toEqual([5, 2]);
		expect(distance("quick-strat", "quick-start")).toBe(2);
	});
});
