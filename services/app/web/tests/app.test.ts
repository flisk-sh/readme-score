import { describe, expect, it } from "bun:test";
import { createApp } from "../src/app";
import { RateLimiter, TtlCache } from "../src/guard";
import { fakeGitHub, fixture, ROWCOUNT } from "./helpers";

const github = () =>
	fakeGitHub([
		ROWCOUNT,
		{ owner: "acme", name: "bare", files: { "README.md": fixture("bare.md") } },
	]);
const app = createApp({
	publicUrl: "https://tool.test/",
	github: { fetch: github().fetch },
});
const rpc = (a: ReturnType<typeof createApp>, body: unknown) =>
	a.request("/mcp", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
const form = (fields: Record<string, string>) => ({
	method: "POST",
	headers: { "content-type": "application/x-www-form-urlencoded" },
	body: new URLSearchParams(fields).toString(),
});

describe("pages", () => {
	it("serves the home page with a policy that allows no scripts", async () => {
		const res = await app.request("/");
		expect(res.status).toBe(200);
		const csp = res.headers.get("content-security-policy");
		expect(csp).toContain("default-src 'none'");
		expect(csp).not.toContain("script-src");
		expect(await res.text()).not.toContain("<script>");
	});

	it("shows the Product Hunt badge on the home page only, and lets the policy load its image", async () => {
		const res = await app.request("/");
		const html = await res.text();
		expect(html).toContain(
			"https://api.producthunt.com/widgets/embed-image/v1/featured.svg",
		);
		expect(html).toContain('rel="noopener noreferrer"');
		expect(res.headers.get("content-security-policy")).toContain(
			"img-src 'self' https://api.producthunt.com",
		);
		expect(await (await app.request("/about")).text()).not.toContain(
			"producthunt.com",
		);
	});

	it("shows a sample result on the home page, worked out by the checks", async () => {
		const html = await (await app.request("/")).text();
		expect(html).toContain("Sample result");
		expect(html).toMatch(/<b>\d+\/100<\/b><span class="grade g-[A-F]">/);
		expect(html).toContain("Fix first, line");
	});

	it("sends the form to the repository's address, and explains an address it cannot read", async () => {
		const res = await app.request(
			"/check?repo=https%3A%2F%2Fgithub.com%2Facme%2Frowcount.git&type=library",
		);
		expect(res.status).toBe(303);
		expect(res.headers.get("location")).toBe("/acme/rowcount?type=library");
		const ref = await app.request(
			"/check?repo=github.com/acme/rowcount/tree/release/v2",
		);
		expect(ref.headers.get("location")).toBe("/acme/rowcount/tree/release/v2");
		const bad = await app.request("/check?repo=https%3A%2F%2Fgitlab.com%2Fx");
		expect(bad.status).toBe(400);
		expect(await bad.text()).toContain("That is not a GitHub repository.");
	});

	it("renders a repository's result with its score, commit and line links", async () => {
		const html = await (await app.request("/acme/rowcount")).text();
		expect(html).toContain("100<small>/100</small>");
		expect(html).toContain("Grade A");
		expect(html).toContain(`<code>${"a".repeat(7)}</code> (main)`);
		expect(html).toContain(
			`href="https://github.com/acme/rowcount/blob/${"a".repeat(40)}/README.md#L56"`,
		);
		expect(html).toContain(
			"Detected: package.json has a &quot;bin&quot; field.",
		);
	});

	it("offers one button that opens Claude Code with every fix typed in", async () => {
		const html = await (await app.request("/acme/bare")).text();
		const href = html.match(/class="btn" href="([^"]+)"/)?.[1] ?? "";
		expect(href.startsWith("claude://code/new?q=")).toBe(true);
		const prompt = decodeURIComponent(href.split("?q=")[1] ?? "");
		expect(prompt).toContain("Fix my README");
		expect(prompt).toContain("Add a title as the first line");
		expect(prompt).toContain("https://tool.test/acme/bare");
	});

	it("lists the fixes for a weak README, and rescores it as another type", async () => {
		const html = await (await app.request("/acme/bare")).text();
		expect(html).toContain("<h2>Fix first</h2>");
		expect(html).toContain("Add a title as the first line");
		const lib = await (await app.request("/acme/bare?type=library")).text();
		expect(lib).toContain("<b>Library</b>");
		expect(lib).toContain("Type chosen on this page.");
	});

	it("redirects another spelling of a repository to GitHub's own", async () => {
		const res = await app.request("/ACME/RowCount.git");
		expect(res.status).toBe(301);
		expect(res.headers.get("location")).toBe("/acme/rowcount");
	});

	it("explains a repository it cannot find, with the paste form open", async () => {
		const res = await app.request("/acme/missing");
		expect(res.status).toBe(404);
		const html = await res.text();
		expect(html).toContain("acme/missing is not a public GitHub repository.");
		expect(html).toContain('<details class="paste" open>');
	});

	it("scores a pasted README and escapes what it shows", async () => {
		const res = await app.request(
			"/paste",
			form({ readme: "# <script>alert(1)</script>\n\nText.\n", type: "app" }),
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("cache-control")).toBe("no-store");
		const html = await res.text();
		expect(html).toContain("The pasted README");
		expect(html).toContain("<b>Full-stack app</b>");
		expect(html).toContain('<meta name="robots" content="noindex">');
		expect(html).not.toContain("<script>alert(1)</script>");
		expect(html).toContain("&lt;script&gt;");
		expect((await app.request("/paste", form({ readme: "  " }))).status).toBe(
			400,
		);
	});

	it("keeps links and canonical addresses under the prefix a proxy stripped", async () => {
		const local = createApp({ github: { fetch: github().fetch } });
		const headers = { "x-forwarded-prefix": "/api/web" };
		const html = await (
			await local.request("http://api.tool.localhost/", { headers })
		).text();
		expect(html).toContain('action="/api/web/check"');
		expect(html).toContain(
			'<link rel="canonical" href="http://api.tool.localhost/api/web/">',
		);
		const evil = await local.request(
			"http://api.tool.localhost/check?repo=acme/rowcount",
			{
				headers: { "x-forwarded-prefix": "//evil.example" },
			},
		);
		expect(evil.headers.get("location")).toBe("/acme/rowcount");
	});
});

describe("API, badge and MCP", () => {
	it("answers a repository's report as JSON, and a pasted README's", async () => {
		const json = (await (
			await app.request("/api/score?repo=acme/rowcount")
		).json()) as {
			score: number;
			grade: string;
			url: string;
			groups: { id: string }[];
		};
		expect([json.score, json.grade, json.url]).toEqual([
			100,
			"A",
			"https://tool.test/acme/rowcount",
		]);
		expect(json.groups.map((g) => g.id)).toEqual([
			"sections",
			"first-screen",
			"readability",
			"quickstart",
			"links",
			"tagline",
			"website",
		]);
		expect((await app.request("/api/score?repo=nope")).status).toBe(400);
		expect((await app.request("/api/score?repo=acme/missing")).status).toBe(
			404,
		);
		const posted = await app.request("/api/score", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ readme: fixture("bare.md"), type: "api" }),
		});
		expect(
			((await posted.json()) as { type: { type: string } }).type.type,
		).toBe("api");
	});

	it("draws the badge with the score, and unknown for a missing repository", async () => {
		const svg = await app.request("/badge/acme/rowcount.svg");
		expect(svg.headers.get("content-type")).toContain("image/svg+xml");
		expect(await svg.text()).toContain("100/100 A");
		const missing = await app.request("/badge/acme/missing.svg");
		expect(await missing.text()).toContain("unknown");
		expect(missing.headers.get("cache-control")).toContain("max-age=300");
	});

	it("initializes, lists score_readme and runs it on a repository and on Markdown", async () => {
		const init = (await (
			await rpc(app, {
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: { protocolVersion: "2025-03-26" },
			})
		).json()) as {
			result: { protocolVersion: string; serverInfo: { name: string } };
		};
		expect(init.result.protocolVersion).toBe("2025-03-26");
		expect(init.result.serverInfo.name).toBe("readme-score");
		expect(
			(await rpc(app, { jsonrpc: "2.0", method: "notifications/initialized" }))
				.status,
		).toBe(202);
		const list = (await (
			await rpc(app, { jsonrpc: "2.0", id: 2, method: "tools/list" })
		).json()) as {
			result: { tools: { name: string }[] };
		};
		expect(list.result.tools.map((t) => t.name)).toEqual(["score_readme"]);
		const call = async (args: object) =>
			(
				(await (
					await rpc(app, {
						jsonrpc: "2.0",
						id: 3,
						method: "tools/call",
						params: { name: "score_readme", arguments: args },
					})
				).json()) as {
					result: { content: { text: string }[]; isError: boolean };
				}
			).result;
		const repo = await call({ repo: "https://github.com/acme/rowcount" });
		expect(repo.isError).toBe(false);
		expect(repo.content[0].text).toStartWith(
			`acme/rowcount at ${"a".repeat(7)}: 100/100 (A) as a CLI tool`,
		);
		expect(repo.content[0].text).toContain(
			"Full report: https://tool.test/acme/rowcount",
		);
		const md = await call({ readme: fixture("bare.md") });
		expect(md.content[0].text).toContain("Fix first:");
		expect(md.content[0].text).toContain(
			'Installation (line 4): missing, limit required for a CLI tool. Add "## Installation" at line 4, at the end.',
		);
		expect((await call({})).isError).toBe(true);
	});

	it("answers errors as JSON-RPC, and limits calls per client", async () => {
		const bad = (await (
			await rpc(app, { jsonrpc: "2.0", id: 4, method: "nope" })
		).json()) as { error: { code: number } };
		expect(bad.error.code).toBe(-32601);
		const tight = createApp({
			callsPerMinute: 1,
			github: { fetch: github().fetch },
		});
		expect((await tight.request("/api/score?repo=acme/rowcount")).status).toBe(
			200,
		);
		// The second repository needs a GitHub read, which the limit no longer allows; a cached one still answers.
		expect((await tight.request("/api/score?repo=acme/bare")).status).toBe(429);
		expect((await tight.request("/api/score?repo=acme/rowcount")).status).toBe(
			200,
		);
	});
});

describe("guards", () => {
	it("counts hits per window", () => {
		let t = 0;
		const limiter = new RateLimiter(2, 1000, () => t);
		expect([
			limiter.hit("a"),
			limiter.hit("a"),
			limiter.hit("a") > 0,
			limiter.hit("b"),
		]).toEqual([0, 0, true, 0]);
		t = 1000;
		expect(limiter.hit("a")).toBe(0);
	});

	it("forgets cached entries after their time and beyond the size", () => {
		let t = 0;
		const cache = new TtlCache<number>(100, 2, () => t);
		cache.set("a", 1);
		cache.set("b", 2);
		cache.set("c", 3);
		expect(cache.get("a")).toBeUndefined();
		t = 100;
		expect(cache.get("c")).toBeUndefined();
	});
});
