import { describe, expect, it } from "bun:test";
import { withSecurityHeaders } from "../src/security-headers";
import worker from "../src/worker";

describe("security headers", () => {
	it("adds the baseline to a bare response and a frame-ancestors policy", () => {
		const res = withSecurityHeaders(new Response("hi"));
		expect(res.headers.get("x-content-type-options")).toBe("nosniff");
		expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
		expect(res.headers.get("strict-transport-security")).toBe(
			"max-age=31536000; includeSubDomains",
		);
		expect(res.headers.get("referrer-policy")).toBe(
			"strict-origin-when-cross-origin",
		);
		expect(res.headers.get("permissions-policy")).toBe(
			"camera=(), microphone=(), geolocation=()",
		);
		expect(res.headers.get("content-security-policy")).toBe(
			"frame-ancestors 'self' https://analytics.flisk.si",
		);
	});

	it("keeps headers and a policy the app already set", () => {
		const res = withSecurityHeaders(
			new Response("hi", {
				headers: {
					"x-frame-options": "DENY",
					"content-security-policy": "default-src 'none'",
				},
			}),
		);
		expect(res.headers.get("x-frame-options")).toBe("DENY");
		expect(res.headers.get("content-security-policy")).toBe(
			"default-src 'none'; frame-ancestors 'self' https://analytics.flisk.si",
		);
		const own = withSecurityHeaders(
			new Response("hi", {
				headers: { "content-security-policy": "frame-ancestors 'none'" },
			}),
		);
		expect(own.headers.get("content-security-policy")).toBe(
			"frame-ancestors 'none'",
		);
	});

	it("works on responses with immutable headers", () => {
		const res = withSecurityHeaders(Response.redirect("https://example.com"));
		expect(res.status).toBe(302);
		expect(res.headers.get("x-content-type-options")).toBe("nosniff");
	});

	it("covers pages and redirects served by the Worker", async () => {
		const env = {
			PUBLIC_URL: "https://readme.flisk.si/",
			TRUST_PROXY: "cloudflare",
		};
		const page = await worker.fetch(
			new Request("https://readme.flisk.si/ready"),
			env,
			{},
		);
		expect(page.headers.get("x-frame-options")).toBe("SAMEORIGIN");
		expect(page.headers.get("strict-transport-security")).toBe(
			"max-age=31536000; includeSubDomains",
		);
		const redirect = await worker.fetch(
			new Request("https://readme.flisk.si/about/"),
			env,
			{},
		);
		expect(redirect.status).toBe(301);
		expect(redirect.headers.get("x-content-type-options")).toBe("nosniff");
	});
});
