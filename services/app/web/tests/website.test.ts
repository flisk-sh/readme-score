import { describe, expect, it } from "bun:test";
import { createApp } from "../src/app";
import { score } from "../src/readme/score";
import {
	headlineMatch,
	keyWords,
	pitchOverlap,
	readmePitch,
	readWebsite,
	titleParts,
} from "../src/readme/website";
import { fetchWebsite, isPublicAddress, websiteUrl } from "../src/website";
import { fixture } from "./helpers";

const page = (head: string, body = "") =>
	`<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const ROWCOUNT_SITE = page(
	'<title>Rowcount | count the rows in any CSV file</title><meta property="og:title" content="Rowcount: count the rows in any CSV file"><meta name="description" content="Rowcount counts the rows in a CSV file of any size, skips the header and reads from a pipe.">',
	"<h1>Count the rows in any <em>CSV</em> file</h1><pre><code>$ npm install -g rowcount\n$ rowcount sales.csv</code></pre>",
);
/** A fetch that answers one page per address, and a resolver that says every host is public. */
const site = (pages: Record<string, Response | (() => Response)>) => ({
	fetch: (async (input: RequestInfo | URL) => {
		const p = pages[String(input)];
		if (!p) return new Response("", { status: 404 });
		return typeof p === "function" ? p() : p.clone();
	}) as typeof fetch,
	resolve: async () => ["93.184.215.14"],
});
const html = (body: string) =>
	new Response(body, {
		headers: { "content-type": "text/html; charset=utf-8" },
	});

describe("reading a website", () => {
	it("reads the title, og tags, description and first h1, entities and tags removed", () => {
		const w = readWebsite(ROWCOUNT_SITE, "https://rowcount.dev/");
		expect(w).toEqual({
			url: "https://rowcount.dev/",
			title: "Rowcount | count the rows in any CSV file",
			ogTitle: "Rowcount: count the rows in any CSV file",
			description:
				"Rowcount counts the rows in a CSV file of any size, skips the header and reads from a pipe.",
			ogDescription: null,
			h1: "Count the rows in any CSV file",
			code: ["$ npm install -g rowcount\n$ rowcount sales.csv"],
		});
		expect(
			readWebsite(
				page("<title>A &amp; B</title><meta content='x' name='description'>"),
				"u",
			),
		).toMatchObject({
			title: "A & B",
			description: "x",
		});
	});

	it("splits a title at the separators sites put between the name and the pitch", () => {
		expect(titleParts("Flisk CLI — start services on your machine")).toEqual([
			"Flisk CLI — start services on your machine",
			"Flisk CLI",
			"start services on your machine",
		]);
	});
});

describe("headline", () => {
	const w = readWebsite(ROWCOUNT_SITE, "https://rowcount.dev/");
	it("matches the README H1 after the name, case and punctuation are dropped", () => {
		expect(
			headlineMatch("rowcount: count the rows in any CSV file", w, [
				"rowcount",
			]),
		).toBe("Rowcount: count the rows in any CSV file");
		expect(
			headlineMatch("Count the rows in any CSV file", w, ["rowcount"]),
		).not.toBeNull();
	});

	it("does not match different wording", () => {
		const flisk = readWebsite(
			page("<title>Flisk CLI — start services on your machine</title>"),
			"https://flisk.sh/",
		);
		expect(
			headlineMatch(
				"Flisk: your whole app, running on your computer with one command",
				flisk,
				["flisk"],
			),
		).toBeNull();
	});
});

describe("pitch", () => {
	it("is the H1 and the prose after it, up to the first section or code block", () => {
		const p = readmePitch(fixture("cli-complete.md"));
		expect(p.text).toBe(
			"rowcount: count the rows in any CSV file rowcount counts the rows in a CSV file. It skips the header. It reads files of any size.",
		);
		expect(p.line).toBe(1);
	});

	it("takes the first section's opening when nothing comes between the H1 and it", () => {
		const md =
			"# Rowcount\n\n```bash\nnpm i -g rowcount\n```\n\n## What is Rowcount?\n\nIt counts rows.\n\n## Install\n\nLater text.\n";
		expect(readmePitch(md)).toEqual({
			text: "Rowcount It counts rows.",
			line: 1,
		});
	});

	it("leaves out rows of links: navigation and language links", () => {
		const md =
			"# Rowcount\n\n**[Quick start](#q) · [Docs](#d) · [FAQ](#f)**\n\n<sub>[Deutsch](de.md) · [Français](fr.md)</sub>\n\nCounts rows. See [the docs](d.md) for more.\n";
		expect(readmePitch(md).text).toBe(
			"Rowcount Counts rows. See the docs for more.",
		);
	});

	it("keeps key words: three letters or more, no stopwords, no project names, plurals folded", () => {
		expect(
			keyWords("Rowcount counts the rows in your CSV files", ["rowcount"]),
		).toEqual(["count", "row", "csv", "file"]);
	});

	it("measures how much of the website's description the README pitch says", () => {
		const o = pitchOverlap(
			"count rows in csv files, skip the header",
			"Counts rows in CSV files of any size, from a pipe",
			[],
		);
		expect(o.share).toBeCloseTo(4 / 6);
		expect(o.onlyWebsite).toEqual(["size", "pipe"]);
		expect(o.onlyReadme).toEqual(["skip", "header"]);
	});
});

describe("website checks", () => {
	const input = {
		readme: fixture("cli-complete.md"),
		readmePath: "README.md",
		type: "cli" as const,
	};
	const group = (website?: Parameters<typeof score>[0]["website"]) =>
		score({ ...input, ...(website ? { website } : {}) }).groups.find(
			(g) => g.id === "website",
		);

	it("passes when the website says what the README says", () => {
		const g = group(readWebsite(ROWCOUNT_SITE, "https://rowcount.dev/"));
		expect(g?.title).toBe("Website: https://rowcount.dev/");
		expect(g?.checks.map((c) => [c.id, c.pass, c.points])).toEqual([
			["website.headline", true, 3],
			["website.pitch", true, 3],
			["website.lead", true, 2],
			["website.install", true, 2],
		]);
	});

	it("fails with both wordings and the words only one side uses", () => {
		const other = readWebsite(
			page(
				'<title>Spreadsheet helper</title><meta name="description" content="A friendly spreadsheet helper for teams and finance people.">',
			),
			"https://rowcount.dev/",
		);
		const [headline, pitch] = group(other)?.checks ?? [];
		expect([headline.pass, headline.measured, headline.line]).toEqual([
			false,
			'"Spreadsheet helper" differs',
			1,
		]);
		expect(headline.fix).toContain('the website says "Spreadsheet helper"');
		expect([pitch.pass, pitch.points, pitch.measured]).toEqual([
			false,
			0,
			"0% of the website's key words",
		]);
		expect(pitch.findings?.map((f) => f.text)).toContain(
			"Only on the website: friendly, spreadsheet, helper, team, finance, people",
		);
	});

	it("is skipped, with the reason, when there is no website or it cannot be read", () => {
		const none = group();
		expect(none?.checks.every((c) => c.pass === null)).toBe(true);
		expect(none?.checks[0].measured).toContain(
			"no website: set the repository's homepage",
		);
		const failed = group({
			url: "https://rowcount.dev/",
			error: "answered 500",
		});
		expect(failed?.checks[0].measured).toBe(
			"not checked: https://rowcount.dev/ answered 500",
		);
	});
});

describe("fetching a website", () => {
	it("refuses addresses that are not public http or https", () => {
		for (const a of [
			"ftp://rowcount.dev",
			"http://localhost:4000",
			"http://127.0.0.1/",
			"http://10.0.0.8/",
			"http://169.254.169.254/latest/meta-data",
			"http://[::1]/",
			"https://rowcount.dev:8443/",
			"https://user:pw@rowcount.dev/",
			"http://intranet/",
			"https://api.internal/",
		])
			expect([a, websiteUrl(a)]).toEqual([a, null]);
		expect(websiteUrl("rowcount.dev")?.href).toBe("https://rowcount.dev/");
		expect([
			isPublicAddress("8.8.8.8"),
			isPublicAddress("192.168.1.1"),
			isPublicAddress("::ffff:10.0.0.1"),
		]).toEqual([true, false, false]);
	});

	it("follows a redirect and reads the page", async () => {
		const s = site({
			"https://rowcount.dev/": new Response(null, {
				status: 301,
				headers: { location: "/en" },
			}),
			"https://rowcount.dev/en": html(ROWCOUNT_SITE),
		});
		const w = await fetchWebsite("https://rowcount.dev/", s);
		expect(w).toMatchObject({
			url: "https://rowcount.dev/en",
			title: "Rowcount | count the rows in any CSV file",
		});
	});

	it("does not follow a redirect to a private address, or a host that resolves to one", async () => {
		const s = site({
			"https://rowcount.dev/": new Response(null, {
				status: 302,
				headers: { location: "http://127.0.0.1/admin" },
			}),
		});
		expect(await fetchWebsite("https://rowcount.dev/", s)).toEqual({
			url: "https://rowcount.dev/",
			error: "redirects to an address that cannot be read",
		});
		const rebinding = { ...site({}), resolve: async () => ["10.1.2.3"] };
		expect(await fetchWebsite("https://rowcount.dev/", rebinding)).toEqual({
			url: "https://rowcount.dev/",
			error: "rowcount.dev is not a public address",
		});
	});

	it("says why a page could not be read", async () => {
		expect(
			await fetchWebsite(
				"https://rowcount.dev/",
				site({ "https://rowcount.dev/": new Response("", { status: 500 }) }),
			),
		).toEqual({
			url: "https://rowcount.dev/",
			error: "answered 500",
		});
		const pdf = new Response("%PDF", {
			headers: { "content-type": "application/pdf" },
		});
		expect(
			await fetchWebsite(
				"https://rowcount.dev/",
				site({ "https://rowcount.dev/": pdf }),
			),
		).toMatchObject({
			error: "is not an HTML page",
		});
	});
});

describe("website on the pages", () => {
	it("compares a pasted README with the website given in the form", async () => {
		const s = site({ "https://rowcount.dev/": html(ROWCOUNT_SITE) });
		const app = createApp({ github: { website: s } });
		const res = await app.request("/paste", {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				readme: fixture("cli-complete.md"),
				website: "https://rowcount.dev/",
			}).toString(),
		});
		const text = await res.text();
		expect(text).toContain("Website: https://rowcount.dev/");
		expect(text).toContain("Website headline matches the README");
	});
});
