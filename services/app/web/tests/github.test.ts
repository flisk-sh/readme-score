import { describe, expect, it } from "bun:test";
import { GitHubError, loadRepo, parseRepo, specPath } from "../src/github";
import { RepoLoader } from "../src/loader";
import { score } from "../src/readme/score";
import { fakeGitHub, ROWCOUNT } from "./helpers";

describe("parseRepo", () => {
	it("reads what people paste", () => {
		for (const input of [
			"acme/rowcount",
			"github.com/acme/rowcount",
			"https://github.com/acme/rowcount",
			"https://www.github.com/acme/rowcount/",
			"https://github.com/acme/rowcount.git",
			"git@github.com:acme/rowcount.git",
			"git+https://github.com/acme/rowcount.git",
			"https://github.com/acme/rowcount/issues/3",
			"https://github.com/acme/rowcount#readme",
		])
			expect([input, parseRepo(input)]).toEqual([
				input,
				{ owner: "acme", name: "rowcount" },
			]);
	});

	it("keeps a branch, tag or commit, slashes included", () => {
		expect(
			parseRepo("https://github.com/flisk-sh/flisk/tree/docs/readme-rewrite"),
		).toEqual({
			owner: "flisk-sh",
			name: "flisk",
			ref: "docs/readme-rewrite",
		});
		expect(
			parseRepo("github.com/acme/rowcount/blob/v1.2.0/README.md")?.ref,
		).toBe("v1.2.0");
		expect(specPath({ owner: "a", name: "b", ref: "c/d" })).toBe(
			"a/b/tree/c/d",
		);
	});

	it("refuses anything that is not a GitHub name", () => {
		for (const input of [
			"",
			"rowcount",
			"https://gitlab.com/acme/rowcount",
			"-acme/rowcount",
			"acme--x/rowcount",
			"acme/..",
			"acme/row count",
			"acme/rowcount/tree/../../etc",
			"acme/rowcount/tree/a//b",
			"http://169.254.169.254/latest/meta-data",
		])
			expect([input, parseRepo(input)]).toEqual([input, undefined]);
	});
});

describe("loadRepo", () => {
	it("reads the README, the manifests and the tree at one commit, with three API calls", async () => {
		const gh = fakeGitHub([ROWCOUNT]);
		const input = await loadRepo(
			{ owner: "acme", name: "rowcount" },
			{ fetch: gh.fetch },
		);
		expect(input.readmePath).toBe("README.md");
		expect(input.repo).toEqual({
			owner: "acme",
			name: "rowcount",
			ref: "main",
			sha: "a".repeat(40),
			description: "rowcount: count the rows in any CSV file",
		});
		expect(input.paths?.has("docs/demo.gif")).toBe(true);
		expect(input.paths?.has("docs")).toBe(true);
		expect(input.manifests?.map((m) => m.path)).toEqual(["package.json"]);
		expect(
			gh.calls.filter((u) => u.startsWith("https://api.github.com/")).length,
		).toBe(3);
		expect(
			gh.calls.every((u) =>
				/^https:\/\/(?:api\.github\.com|raw\.githubusercontent\.com)\//.test(u),
			),
		).toBe(true);
	});

	it("finds the README where GitHub does: .github/ first, then the root, then docs/", async () => {
		const files = {
			"docs/README.md": "# docs",
			"README.markdown": "# root md",
			"readme.md": "# root",
		};
		const gh = fakeGitHub([{ owner: "a", name: "b", files }]);
		expect(
			(await loadRepo({ owner: "a", name: "b" }, { fetch: gh.fetch }))
				.readmePath,
		).toBe("readme.md");
		const dotGithub = fakeGitHub([
			{
				owner: "a",
				name: "b",
				files: { ...files, ".github/README.md": "# gh" },
			},
		]);
		expect(
			(await loadRepo({ owner: "a", name: "b" }, { fetch: dotGithub.fetch }))
				.readmePath,
		).toBe(".github/README.md");
	});

	it("keeps a nested package that is published or has a bin, and leaves out a private one", async () => {
		const files = {
			"README.md": "# X",
			"package.json": '{"private":true,"workspaces":["cli","site"]}',
			"cli/package.json":
				'{"private":true,"bin":{"x":"x.js"},"description":"X"}',
			"site/package.json": '{"private":true,"description":"The docs site"}',
			"lib/package.json": '{"name":"x-lib","description":"X"}',
			"docs/agents/llms.txt": "> X\n",
			"docs/README-fr.md": "# X",
			"docs/guide/README-fr.md": "# not a translation of the README",
		};
		const input = await loadRepo(
			{ owner: "a", name: "b" },
			{ fetch: fakeGitHub([{ owner: "a", name: "b", files }]).fetch },
		);
		expect(input.manifests?.map((m) => m.path)).toEqual([
			"package.json",
			"cli/package.json",
			"lib/package.json",
		]);
		expect(input.llms?.map((m) => m.path)).toEqual(["docs/agents/llms.txt"]);
		expect(input.translations?.map((m) => m.path)).toEqual([
			"docs/README-fr.md",
		]);
	});

	it("explains a missing repository, a missing README and a spent rate limit", async () => {
		const none = fakeGitHub([]);
		await expect(
			loadRepo({ owner: "a", name: "b" }, { fetch: none.fetch }),
		).rejects.toMatchObject({ status: 404 });
		const empty = fakeGitHub([
			{ owner: "a", name: "b", files: { "src/x.ts": "" } },
		]);
		await expect(
			loadRepo({ owner: "a", name: "b" }, { fetch: empty.fetch }),
		).rejects.toMatchObject({
			status: 422,
			message: "a/b has no README in .github/, the root or docs/.",
		});
		// With the API spent and the raw host failing too, the answer says why.
		const limited = fakeGitHub([ROWCOUNT], {
			"https://api.github.com/": 403,
			"https://raw.githubusercontent.com/": 429,
		});
		const error = await loadRepo(
			{ owner: "acme", name: "rowcount" },
			{ fetch: limited.fetch },
		).catch((e) => e);
		expect(error).toBeInstanceOf(GitHubError);
		expect([error.status, error.message]).toEqual([
			404,
			"No README found for acme/rowcount, or it is not a public repository.",
		]);
	});

	it("reads the raw files at HEAD when the API limit is spent, and skips the checks that need the tree", async () => {
		const gh = fakeGitHub([ROWCOUNT], { "https://api.github.com/": 403 });
		const input = await loadRepo(
			{ owner: "acme", name: "rowcount" },
			{ fetch: gh.fetch },
		);
		expect([
			input.readmePath,
			input.repo?.ref,
			input.repo?.sha,
			input.paths,
		]).toEqual(["README.md", "HEAD", "HEAD", undefined]);
		expect(input.manifests?.map((m) => m.path)).toEqual(["package.json"]);
		expect(input.withoutTree).toBe(
			"GitHub's API limit for this server is used up",
		);
		const r = score(input);
		const byId = Object.fromEntries(
			r.groups.flatMap((g) => g.checks).map((c) => [c.id, c]),
		);
		expect(byId["links.files"].measured).toBe(
			"not checked: GitHub's API limit for this server is used up",
		);
		expect(byId["tagline.distinct"].measured).toBe(
			"1 wording across 2 sources",
		);
		expect(r.note).toBe("GitHub's API limit for this server is used up");
	});

	it("sends the token to the API only", async () => {
		const seen: [string, string | undefined][] = [];
		const gh = fakeGitHub([ROWCOUNT]);
		const fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
			seen.push([
				String(input),
				(init?.headers as Record<string, string>)?.authorization,
			]);
			return gh.fetch(input, init);
		}) as typeof globalThis.fetch;
		await loadRepo(
			{ owner: "acme", name: "rowcount" },
			{ fetch, token: "t0k" },
		);
		for (const [url, auth] of seen)
			expect([url, auth]).toEqual([
				url,
				url.startsWith("https://api.github.com/") ? "Bearer t0k" : undefined,
			]);
	});
});

describe("RepoLoader", () => {
	it("asks GitHub once per repository, whatever the case, and remembers a missing one", async () => {
		const gh = fakeGitHub([ROWCOUNT]);
		const loader = new RepoLoader({ fetch: gh.fetch });
		await loader.get({ owner: "acme", name: "rowcount" });
		await loader.get({ owner: "ACME", name: "RowCount" });
		expect(
			gh.calls.filter((u) => u === "https://api.github.com/repos/acme/rowcount")
				.length,
		).toBe(1);
		await loader.get({ owner: "acme", name: "nope" });
		const missing = await loader.get({ owner: "acme", name: "nope" });
		expect(missing).toBeInstanceOf(GitHubError);
		expect(
			gh.calls.filter((u) => u === "https://api.github.com/repos/acme/nope")
				.length,
		).toBe(1);
	});

	it("does not read GitHub when the client is over its limit", async () => {
		const gh = fakeGitHub([ROWCOUNT]);
		expect(
			await new RepoLoader({ fetch: gh.fetch }).get(
				{ owner: "acme", name: "rowcount" },
				() => false,
			),
		).toBeUndefined();
		expect(gh.calls).toEqual([]);
	});
});
