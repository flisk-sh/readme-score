import { describe, expect, it } from "bun:test";
import { createApp } from "../src/app";

const app = createApp({ publicUrl: "https://readme.flisk.si/" });

const images = (policy: string | null) =>
	(policy?.match(/(?:^|;)\s*img-src\s+([^;]+)/)?.[1] ?? "").trim().split(/\s+/);

describe("org bar icons", () => {
	it.each(["/", "/about"])(
		"lets %s load the icons on flisk.si",
		async (path) => {
			const res = await app.request(path);
			expect(res.status).toBe(200);
			const sources = images(res.headers.get("content-security-policy"));
			expect(sources).toContain("https://flisk.si");
		},
	);

	it("still allows the two badge hosts and no wildcard source", async () => {
		const sources = images(
			(await app.request("/")).headers.get("content-security-policy"),
		);
		expect(sources).toContain("https://api.producthunt.com");
		expect(sources).toContain("https://devhunt.org");
		expect(sources).not.toContain("*");
		expect(sources).not.toContain("https:");
	});
});
