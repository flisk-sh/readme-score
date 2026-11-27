import { describe, expect, it } from "bun:test";
import worker from "../src/worker";

const env = { PUBLIC_URL: "https://readme.flisk.si/" };
const call = (path: string) =>
	worker.fetch(new Request(`https://readme.flisk.si${path}`), env, {});

describe("small not-found response", () => {
	it("answers an unknown path with 404 and a body under 4 KB", async () => {
		const res = await call("/nope-xyz");
		expect(res.status).toBe(404);
		const html = await res.text();
		expect(Buffer.byteLength(html)).toBeLessThan(4096);
	});

	it("keeps a link home and does not reuse the full site shell", async () => {
		const html = await (await call("/nope-xyz")).text();
		expect(html).toContain('href="/"');
		expect(html).toContain("Page not found");
		expect(html).not.toContain("Skip to content");
		expect(html).not.toContain("data-flisk-login");
		expect(html).not.toContain('class="wrap prose"');
		expect(html).not.toContain("data-flisk-login");
	});

	it("does not cache a miss for long", async () => {
		const res = await call("/nope-xyz");
		expect(res.headers.get("cache-control")).toBe("public, max-age=300");
	});
});
