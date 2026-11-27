import { describe, expect, it } from "bun:test";
import { aboutPage, checksPage, homePage } from "../src/pages";

const skip = '<a class="skip-link" href="#main">Skip to content</a>';
const base = "https://readme.flisk.si";

describe("skip to content link", () => {
	it("is the first focusable element in the body", () => {
		const html = homePage(base);
		expect(html).toContain(`<body>\n${skip}`);
		expect(html.indexOf(skip)).toBeLessThan(
			html.indexOf('<header class="top stage"'),
		);
	});

	it("targets the main content on every page", () => {
		// The not-found page has no header or nav to skip past, so it does
		// not carry the shared skip link (see the small-404 tests).
		const pages = [homePage(base), checksPage(base), aboutPage(base)];
		for (const html of pages) {
			expect(html).toContain(skip);
			expect(html).toContain('<main id="main">');
		}
	});

	it("stays hidden until focused", () => {
		const html = homePage(base);
		expect(html).toContain(".skip-link{position:absolute;left:-9999px");
		expect(html).toContain(".skip-link:focus{left:12px;top:12px");
	});
});
