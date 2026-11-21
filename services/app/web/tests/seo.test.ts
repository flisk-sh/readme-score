import { describe, expect, it } from "bun:test";
import { createApp } from "../src/app";
import { ASSETS } from "../src/assets.generated";
import { ICONS } from "../src/seo";
import { SITE } from "../src/site";
import { fakeGitHub, ROWCOUNT } from "./helpers";

const app = createApp({
	publicUrl: "https://tool.test/",
	builtAt: new Date("2026-10-28"),
	github: { fetch: fakeGitHub([ROWCOUNT]).fetch },
});
const page = async (path: string) => (await app.request(path)).text();
const attr = (html: string, re: RegExp) => html.match(re)?.[1];

describe("site.ts", () => {
	it("keeps the tagline and description at lengths search results show whole", () => {
		expect(SITE.tagline.length).toBeLessThanOrEqual(60);
		expect(SITE.description.length).toBeGreaterThanOrEqual(110);
		expect(SITE.description.length).toBeLessThanOrEqual(160);
		expect(SITE.url).toMatch(/^https:\/\/.+\/$/);
		expect(SITE.id).toMatch(/^[a-z0-9-]+$/);
	});

	it("ships every icon the head and the manifest link to, at its size", () => {
		const size = (name: string) => {
			const png = Buffer.from(ASSETS[name].base64, "base64");
			return [png.readUInt32BE(16), png.readUInt32BE(20)];
		};
		for (const name of Object.values(ICONS)) expect(ASSETS[name]).toBeDefined();
		expect(size(ICONS.og)).toEqual([1200, 630]);
		expect(size(ICONS.apple)).toEqual([180, 180]);
		expect(size(ICONS.maskable)).toEqual([512, 512]);
	});
});

describe.each(["/", "/about", "/checks", "/acme/rowcount"])(
	"the head of %s",
	(path) => {
		it("has one title, a description, a canonical link and a social card", async () => {
			const html = await page(path);
			expect(html.match(/<title>/g)).toHaveLength(1);
			// 10 to 70 characters, the range Citable scores (a longer title is cut in results)
			const title = /<title>([^<]+)<\/title>/.exec(html)?.[1] ?? "";
			expect(title.length).toBeGreaterThanOrEqual(10);
			expect(title.length).toBeLessThanOrEqual(70);
			expect(html.match(/<h1[ >]/g)).toHaveLength(1);
			const description = attr(
				html,
				/<meta name="description" content="([^"]+)"/,
			);
			expect(description?.length).toBeGreaterThan(50);
			expect(description?.length).toBeLessThanOrEqual(160);
			expect(attr(html, /<link rel="canonical" href="([^"]+)"/)).toBe(
				`https://tool.test${path}`,
			);
			expect(attr(html, /<meta property="og:image" content="([^"]+)"/)).toBe(
				"https://tool.test/og.png",
			);
			expect(html).toContain(
				'<meta name="twitter:card" content="summary_large_image">',
			);
			expect(html).toContain('<html lang="en">');
			expect(html).toContain('rel="manifest"');
			expect(html).toContain('content="index,follow');
		});

		it("has JSON-LD that parses, with the site, its publisher and the app", async () => {
			const json = attr(
				await page(path),
				/<script type="application\/ld\+json">(.+?)<\/script>/s,
			);
			const ld = JSON.parse(json as string) as {
				"@graph": { "@type": string }[];
			};
			const types = ld["@graph"].map((n) => n["@type"]);
			expect(types).toEqual(
				expect.arrayContaining(["WebSite", "Organization", "WebApplication"]),
			);
			if (path === "/about") expect(types).toContain("FAQPage");
			if (path !== "/") expect(types).toContain("BreadcrumbList");
		});
	},
);

describe("files for crawlers", () => {
	it("robots.txt names the AI answer crawlers, keeps out the API and points at the sitemap", async () => {
		const robots = await page("/robots.txt");
		expect(robots).toContain("User-agent: OAI-SearchBot");
		expect(robots).toContain("User-agent: Claude-SearchBot");
		expect(robots).toContain("Disallow: /api/");
		expect(robots).toContain("Sitemap: https://tool.test/sitemap.xml");
	});

	it("serves robots.txt as text with a public day-long cache", async () => {
		const res = await app.request("/robots.txt");
		expect(res.headers.get("content-type")).toContain("text/plain");
		expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
	});

	it("sitemap.xml lists the home page, about, the checks and the example repositories", async () => {
		const res = await app.request("/sitemap.xml");
		expect(res.headers.get("content-type")).toContain("application/xml");
		const xml = await res.text();
		expect(xml).toContain(
			"<loc>https://tool.test/</loc><lastmod>2026-10-28</lastmod>",
		);
		expect(xml).toContain("<loc>https://tool.test/checks</loc>");
		expect(xml).toContain("<loc>https://tool.test/flisk-sh/flisk</loc>");
		expect(xml.match(/<url>/g)).toHaveLength(3 + SITE.examples.length);
	});

	it("llms.txt, the manifest and security.txt", async () => {
		expect(await page("/llms.txt")).toStartWith(`# ${SITE.name}\n\n> `);
		const manifest = JSON.parse(await page("/site.webmanifest")) as {
			icons: { purpose?: string }[];
		};
		expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
		const security = await page("/.well-known/security.txt");
		expect(security).toContain("Contact: https://");
		expect(security).toMatch(/Expires: \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ/);
	});

	it("serves the icons with their types and a long cache", async () => {
		const res = await app.request("/og.png");
		expect(res.headers.get("content-type")).toBe("image/png");
		expect(res.headers.get("cache-control")).toContain("max-age");
		expect(
			(await app.request("/favicon.ico")).headers.get("content-type"),
		).toBe("image/x-icon");
	});

	it("keeps not-found and error pages out of the index and answers 404", async () => {
		for (const path of ["/a/b/c", "/nope/nothing-here"]) {
			const res = await app.request(path);
			expect([path, res.status]).toEqual([path, 404]);
			expect(await res.text()).toContain(
				'<meta name="robots" content="noindex">',
			);
		}
	});
});

describe("the MCP Server Card", () => {
	const paths = [
		"/.well-known/mcp-server-card.json",
		"/.well-known/mcp/server-card.json",
	];

	it.each(paths)("is served at %s for GET and HEAD", async (path) => {
		for (const method of ["GET", "HEAD"]) {
			const res = await app.request(path, { method });
			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toBe(
				"application/json; charset=utf-8",
			);
			expect(res.headers.get("access-control-allow-origin")).toBe("*");
			expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
		}
		const card = await (await app.request(path)).json();
		expect(card.$schema).toBe(
			"https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
		);
		expect(card.name).toBe("si.flisk/readme-score");
		expect(card.title).toBe(`${SITE.name} MCP`);
		// The Server Card schema: title <= 100, description 1-100 characters.
		expect(card.title.length).toBeLessThanOrEqual(100);
		expect(card.description.length).toBeGreaterThanOrEqual(1);
		expect(card.description.length).toBeLessThanOrEqual(100);
		expect(card.remotes[0]).toEqual({
			type: "streamable-http",
			url: "https://tool.test/mcp",
		});
	});

	it("answers the same bytes at both paths, and matches initialize", async () => {
		const [a, b] = await Promise.all(paths.map((p) => page(p)));
		expect(a).toBe(b);
		const init = await app.request("/mcp", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: { protocolVersion: "2025-03-26", capabilities: {} },
			}),
		});
		const info = (await init.json()).result.serverInfo;
		expect(JSON.parse(a).title).toBe(info.title);
		expect(JSON.parse(a).version).toBe(info.version);
	});
});
