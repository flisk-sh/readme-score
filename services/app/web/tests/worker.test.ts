import { describe, expect, it } from "bun:test";
import worker from "../src/worker";

// The live entry point is src/worker.ts (wrangler.toml `main`), not index.ts, so the Bun server tests never load it.
describe("Cloudflare Worker entry", () => {
	const env = {
		PUBLIC_URL: "https://readme.flisk.si/",
		TRUST_PROXY: "cloudflare",
	};
	const call = (path: string, init?: RequestInit) =>
		worker.fetch(new Request(`https://readme.flisk.si${path}`, init), env, {});

	it("answers /ready", async () => {
		const res = await call("/ready");
		expect(res.status).toBe(200);
	});

	it("serves the home page with the public URL in its canonical link", async () => {
		const res = await call("/");
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain("https://readme.flisk.si/");
		expect(html).toContain("application/ld+json");
	});

	it("scores a pasted README through the API", async () => {
		const res = await call("/api/score", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				readme: "# slugkit\n\nTurn titles into slugs.\n",
				type: "library",
			}),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { score: number };
		expect(body.score).toBeGreaterThanOrEqual(0);
	});

	it("lists the MCP tools", async () => {
		const res = await call("/mcp", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
		});
		expect(res.status).toBe(200);
		expect(await res.text()).toContain("tools");
	});

	it("redirects a plain http request to https", async () => {
		const res = await worker.fetch(
			new Request("http://readme.flisk.si/"),
			env,
			{},
		);
		expect(res.status).toBe(301);
		expect(res.headers.get("location")).toBe("https://readme.flisk.si/");
	});

	it("keeps the path and query when redirecting to https", async () => {
		const res = await worker.fetch(
			new Request("http://readme.flisk.si/score?q=readme&page=2"),
			env,
			{},
		);
		expect(res.status).toBe(301);
		expect(res.headers.get("location")).toBe(
			"https://readme.flisk.si/score?q=readme&page=2",
		);
	});

	it("does not redirect loopback hosts, so local dev keeps working", async () => {
		for (const host of ["localhost:8787", "127.0.0.1:8787", "[::1]:8787"]) {
			const res = await worker.fetch(
				new Request(`http://${host}/ready`),
				env,
				{},
			);
			expect(res.status).toBe(200);
		}
	});

	it("leaves an https request untouched", async () => {
		const res = await call("/ready");
		expect(res.status).toBe(200);
	});
});
