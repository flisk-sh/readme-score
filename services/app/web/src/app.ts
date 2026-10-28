// Routes. The tool's own pages are /<owner>/<repo> (and /<owner>/<repo>/tree/<ref>) for a GitHub repository and
// POST /paste for a pasted README; everything else is the site around it: the checks page, SEO files, icons, the JSON
// API, the badge and MCP.
import { type Context, Hono } from "hono";
import { ASSETS } from "./assets.generated";
import {
	GitHubError,
	type GitHubOptions,
	parseRepo,
	type RepoSpec,
	specPath,
} from "./github";
import {
	clientIp,
	type ProxyMode,
	RateLimiter,
	securityHeaders,
} from "./guard";
import { type Loaded, RepoLoader } from "./loader";
import { handleMcp, readmeTools } from "./mcp";
import {
	aboutPage,
	badge,
	checksPage,
	errorPage,
	homePage,
	notFoundPage,
	resultPage,
} from "./pages";
import { type ReadmeInput, type Report, score } from "./readme/score";
import { isProjectType, type ProjectType } from "./readme/sections";
import { summarize } from "./readme/summary";
import {
	ICONS,
	llmsTxt,
	robotsTxt,
	securityTxt,
	sitemapXml,
	webManifest,
} from "./seo";
import { SITE } from "./site";
import { VIDEO } from "./video.generated";
import { fetchWebsite } from "./website";

/** A pasted README larger than this is refused. */
export const MAX_PASTE_BYTES = 512 * 1024;

export interface AppOptions {
	/** The address people use, ending in a slash. Without it, each request's own address (see baseOf). */
	publicUrl?: string;
	proxy?: ProxyMode;
	/** Fresh GitHub reads, API and MCP calls per client per minute. */
	callsPerMinute?: number;
	/** The date sitemap.xml gives as lastmod: when this build started. */
	builtAt?: Date;
	/** How to reach GitHub: a token, and a fetch to replace in tests. */
	github?: GitHubOptions;
}

/** The icons and the social card from assets.generated.ts, decoded once. tests/seo.test.ts fails on a missing one. */
function loadAssets(): Map<string, { body: Uint8Array; type: string }> {
	const files = new Map<string, { body: Uint8Array; type: string }>();
	for (const name of Object.values(ICONS)) {
		const asset = ASSETS[name];
		if (asset)
			files.set(name, {
				body: Buffer.from(asset.base64, "base64"),
				type: asset.type,
			});
	}
	return files;
}

const typeParam = (v: string | undefined): ProjectType | undefined =>
	isProjectType(v) ? v : undefined;

export function createApp(options: AppOptions = {}) {
	const proxy = options.proxy ?? "none";
	const limit = new RateLimiter(options.callsPerMinute ?? 120, 60 * 1000);
	const lastmod = (options.builtAt ?? new Date()).toISOString().slice(0, 10);
	const files = loadAssets();
	const websiteOptions =
		options.github?.website === false ? {} : (options.github?.website ?? {});
	const loader = new RepoLoader(options.github);
	const app = new Hono();

	/**
	 * The site address without the trailing slash: publicUrl when set (online), else this request's own origin and the
	 * prefix a proxy stripped (X-Forwarded-Prefix, /api/web behind Flisk's local proxy).
	 */
	const baseOf = (c: {
		req: { url: string; header: (name: string) => string | undefined };
	}) => {
		if (options.publicUrl) return options.publicUrl.replace(/\/$/, "");
		const prefix = c.req.header("x-forwarded-prefix") ?? "";
		const url = new URL(c.req.url);
		const proto =
			c.req.header("x-forwarded-proto") ?? url.protocol.replace(":", "");
		const host = c.req.header("x-forwarded-host") ?? url.host;
		return `${proto}://${host}${/^(\/[\w.-]+)+$/.test(prefix) ? prefix : ""}`;
	};
	const rootOf = (c: Parameters<typeof baseOf>[0]) =>
		new URL(`${baseOf(c)}/`).pathname.replace(/\/$/, "");

	const clientOf = (c: { req: { raw: Request }; env: unknown }) => {
		const env = c.env as
			| { requestIP?: (r: Request) => { address: string } | null }
			| undefined;
		return clientIp(
			c.req.raw.headers,
			env?.requestIP?.(c.req.raw)?.address,
			proxy,
		);
	};
	/** Counts one call for the client; the seconds to wait when it is over its limit, or 0. */
	const limited = (c: Parameters<typeof clientOf>[0]) => limit.hit(clientOf(c));
	/** A repository's files, counting a GitHub read (not a cached answer) against the client's limit. */
	const load = (
		c: Parameters<typeof clientOf>[0],
		spec: RepoSpec,
	): Promise<Loaded | undefined> => loader.get(spec, () => limited(c) === 0);
	const busy =
		"Too many repositories at once from here, or GitHub is busy. Wait a minute and try again, or paste the README.";

	/**
	 * The website a pasted README names in the form or the API, read once per request; counted against the client's
	 * limit (the API call already was, so it passes count = false).
	 */
	const pastedWebsite = async (
		c: Parameters<typeof clientOf>[0],
		value: unknown,
		count = true,
	) => {
		if (
			typeof value !== "string" ||
			!value.trim() ||
			options.github?.website === false
		)
			return undefined;
		if (count && limited(c) > 0)
			return {
				url: value.trim(),
				error: "not read: too many requests from here",
			};
		return fetchWebsite(value.trim(), websiteOptions);
	};

	app.use("*", async (c, next) => {
		await next();
		for (const [k, v] of Object.entries(securityHeaders()))
			if (!c.res.headers.has(k)) c.res.headers.set(k, v);
	});

	app.get("/health", (c) => c.json({ status: "ok", service: SITE.id }));
	app.get("/ready", (c) => c.json({ ready: true }));

	// Pages
	app.get("/", (c) => c.html(homePage(baseOf(c))));
	app.get("/about", (c) => c.html(aboutPage(baseOf(c))));
	app.get("/checks", (c) => c.html(checksPage(baseOf(c))));
	app.get("/check", (c) => {
		const value = c.req.query("repo") ?? "";
		const spec = parseRepo(value);
		if (!spec)
			return c.html(
				homePage(baseOf(c), {
					error:
						"That is not a GitHub repository. Enter owner/name or a github.com address, or paste the README.",
					value,
				}),
				400,
			);
		const type = typeParam(c.req.query("type"));
		return c.redirect(
			`${rootOf(c)}/${specPath(spec)}${type ? `?type=${type}` : ""}`,
			303,
		);
	});
	app.post("/paste", async (c) => {
		if (Number(c.req.header("content-length") ?? 0) > MAX_PASTE_BYTES * 2)
			return c.html(
				errorPage(baseOf(c), "That README is larger than 512 KB."),
				413,
			);
		const body = await c.req.parseBody();
		const readme =
			typeof body.readme === "string" ? body.readme.replace(/\r\n/g, "\n") : "";
		if (!readme.trim())
			return c.html(
				homePage(baseOf(c), { error: "Paste a README first." }),
				400,
			);
		if (readme.length > MAX_PASTE_BYTES)
			return c.html(
				errorPage(baseOf(c), "That README is larger than 512 KB."),
				413,
			);
		const type = typeParam(
			typeof body.type === "string" ? body.type : undefined,
		);
		const site = await pastedWebsite(c, body.website);
		c.header("cache-control", "no-store");
		return c.html(
			resultPage(
				baseOf(c),
				score({
					readme,
					readmePath: "README.md",
					...(type ? { type } : {}),
					...(site ? { website: site } : {}),
				}),
			),
		);
	});

	// For search engines and AI assistants
	app.get("/robots.txt", (c) => c.text(robotsTxt(baseOf(c))));
	app.get("/sitemap.xml", (c) => {
		const paths = ["", "about", "checks", ...SITE.examples];
		return c.body(sitemapXml(baseOf(c), paths, lastmod), 200, {
			"content-type": "application/xml; charset=utf-8",
		});
	});
	app.get("/llms.txt", (c) =>
		c.text(
			llmsTxt(baseOf(c), [
				{
					name: "Score a repository",
					path: "flisk-sh/flisk",
					note: "put the GitHub owner and repository in the address",
				},
				{
					name: "JSON API",
					path: "api/score?repo=flisk-sh/flisk",
					note: "the same report as JSON; POST {readme} for Markdown",
				},
				{
					name: "MCP server",
					path: "mcp",
					note: "Streamable HTTP, one read-only tool, score_readme",
				},
				{
					name: "Every check and threshold",
					path: "checks",
					note: "what each check looks at and its points",
				},
				{
					name: "About and FAQ",
					path: "about",
					note: "what it reads and stores",
				},
			]),
		),
	);
	app.get("/site.webmanifest", (c) =>
		c.body(webManifest(baseOf(c)), 200, {
			"content-type": "application/manifest+json",
		}),
	);
	app.get("/.well-known/security.txt", (c) => c.text(securityTxt(baseOf(c))));
	// The how-it-works clip (video/render.ts). Safari plays a video only from a server that answers byte ranges.
	for (const [name, file] of Object.entries(VIDEO)) {
		const body = Buffer.from(file.base64, "base64");
		app.get(`/${name}`, (c) => {
			const headers = {
				"content-type": file.type,
				"cache-control": "public, max-age=604800",
				"accept-ranges": "bytes",
			};
			const range = /^bytes=(\d*)-(\d*)$/.exec(c.req.header("range") ?? "");
			if (!range || (range[1] === "" && range[2] === ""))
				return c.body(body, 200, headers);
			const start =
				range[1] === "" ? body.length - Number(range[2]) : Number(range[1]);
			const end =
				range[1] === "" || range[2] === ""
					? body.length - 1
					: Math.min(Number(range[2]), body.length - 1);
			if (start < 0 || start > end)
				return c.body(null, 416, { "content-range": `bytes */${body.length}` });
			return c.body(body.subarray(start, end + 1), 206, {
				...headers,
				"content-range": `bytes ${start}-${end}/${body.length}`,
			});
		});
	}
	for (const [name, file] of files)
		app.get(`/${name}`, (c) =>
			c.body(file.body as Uint8Array<ArrayBuffer>, 200, {
				"content-type": file.type,
				"cache-control": "public, max-age=604800",
			}),
		);

	// For code
	const scoreSpec = async (
		c: Parameters<typeof clientOf>[0],
		spec: RepoSpec,
		type?: ProjectType,
	): Promise<Report | GitHubError | undefined> => {
		const loaded = await load(c, spec);
		if (loaded === undefined || loaded instanceof GitHubError) return loaded;
		return score({ ...(loaded as ReadmeInput), ...(type ? { type } : {}) });
	};
	/** The result page of a report, in GitHub's case, with the ref only when one was asked for. */
	const resultUrl = (
		c: Parameters<typeof baseOf>[0],
		r: Report,
		spec: RepoSpec,
	) =>
		r.repo
			? `${baseOf(c)}/${specPath({ owner: r.repo.owner, name: r.repo.name, ...(spec.ref ? { ref: spec.ref } : {}) })}`
			: undefined;

	app.get("/api/score", async (c) => {
		const spec = parseRepo(c.req.query("repo") ?? "");
		if (!spec)
			return c.json(
				{
					error:
						"repo must be a GitHub repository: owner/name or its github.com address.",
				},
				400,
			);
		const r = await scoreSpec(c, spec, typeParam(c.req.query("type")));
		if (r === undefined)
			return c.json({ error: busy }, 429, { "retry-after": "60" });
		if (r instanceof GitHubError) return c.json({ error: r.message }, r.status);
		return c.json({ ...r, url: resultUrl(c, r, spec) });
	});
	app.post("/api/score", async (c) => {
		const wait = limited(c);
		if (wait > 0)
			return c.json({ error: "Too many requests." }, 429, {
				"retry-after": String(wait),
			});
		let body: { readme?: unknown; type?: unknown; website?: unknown };
		try {
			body = await c.req.json();
		} catch {
			return c.json(
				{ error: 'Send JSON: {"readme": "# Title…", "type": "cli"}.' },
				400,
			);
		}
		if (typeof body.readme !== "string" || !body.readme.trim())
			return c.json({ error: "readme must be the README's Markdown." }, 400);
		if (body.readme.length > MAX_PASTE_BYTES)
			return c.json({ error: "readme is larger than 512 KB." }, 413);
		const type = typeParam(
			typeof body.type === "string" ? body.type : undefined,
		);
		const site = await pastedWebsite(c, body.website, false);
		return c.json(
			score({
				readme: body.readme,
				readmePath: "README.md",
				...(type ? { type } : {}),
				...(site ? { website: site } : {}),
			}),
		);
	});
	app.get("/badge/:owner/:file{[A-Za-z0-9._-]+\\.svg}", async (c) => {
		const spec = parseRepo(
			`${c.req.param("owner")}/${c.req.param("file").replace(/\.svg$/, "")}`,
		);
		if (!spec) return c.notFound();
		const r = await scoreSpec(c, spec);
		return c.body(
			badge(r === undefined || r instanceof GitHubError ? null : r),
			200,
			{
				"content-type": "image/svg+xml",
				// Short when the score is unknown, so the badge shows it once GitHub answers.
				"cache-control": `public, max-age=${r === undefined || r instanceof GitHubError ? 300 : 3600}`,
			},
		);
	});
	const tools = readmeTools(async (args) => {
		const type = typeParam(args.type);
		if (args.readme) {
			if (args.readme.length > MAX_PASTE_BYTES)
				return { error: "readme is larger than 512 KB." };
			const site = args.website
				? await fetchWebsite(args.website, websiteOptions)
				: undefined;
			return summarize(
				score({
					readme: args.readme,
					readmePath: "README.md",
					...(type ? { type } : {}),
					...(site ? { website: site } : {}),
				}),
			);
		}
		const spec = parseRepo(args.repo ?? "");
		if (!spec)
			return {
				error:
					"repo must be a GitHub repository: owner/name or its github.com address.",
			};
		const r = await loader.get(spec);
		if (r === undefined) return { error: busy };
		if (r instanceof GitHubError) return { error: r.message };
		const report = score({ ...r, ...(type ? { type } : {}) });
		return summarize(
			report,
			resultUrl(
				{
					req: { url: options.publicUrl ?? SITE.url, header: () => undefined },
				},
				report,
				spec,
			),
		);
	});
	app.get("/mcp", (c) =>
		c.text("Send MCP requests with POST.", 405, { allow: "POST" }),
	);
	app.post("/mcp", async (c) => {
		const wait = limited(c);
		if (wait > 0)
			return c.json(
				{
					jsonrpc: "2.0",
					id: null,
					error: { code: -32000, message: "Too many requests." },
				},
				429,
			);
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json(
				{
					jsonrpc: "2.0",
					id: null,
					error: { code: -32700, message: "Parse error" },
				},
				400,
			);
		}
		const answer = await handleMcp(body, tools);
		return answer === undefined ? c.body(null, 202) : c.json(answer);
	});

	// A repository's result: /owner/repo, or /owner/repo/tree/<branch, tag or commit>.
	const repoPage = async (c: Context) => {
		const requested = `${c.req.param("owner")}/${c.req.param("repo")}${c.req.param("ref") ? `/tree/${c.req.param("ref")}` : ""}`;
		const spec = parseRepo(requested);
		if (!spec) return c.html(notFoundPage(baseOf(c)), 404);
		const type = typeParam(c.req.query("type"));
		const loaded = await load(c, spec);
		if (loaded === undefined)
			return c.html(errorPage(baseOf(c), busy, specPath(spec)), 429);
		if (loaded instanceof GitHubError)
			return c.html(
				errorPage(baseOf(c), loaded.message, specPath(spec)),
				loaded.status,
			);
		const input = loaded as ReadmeInput;
		const canonical = specPath({
			owner: input.repo?.owner ?? spec.owner,
			name: input.repo?.name ?? spec.name,
			...(spec.ref ? { ref: spec.ref } : {}),
		});
		// One address per repository, in GitHub's own case and without .git, so shared links and search engines agree.
		if (canonical !== requested)
			return c.redirect(
				`${rootOf(c)}/${canonical}${type ? `?type=${type}` : ""}`,
				301,
			);
		c.header("cache-control", "public, max-age=600");
		return c.html(
			resultPage(baseOf(c), score({ ...input, ...(type ? { type } : {}) }), {
				path: canonical,
			}),
		);
	};
	const OWNER = ":owner{[A-Za-z0-9][A-Za-z0-9-]*}";
	const REPO = ":repo{[A-Za-z0-9._-]+}";
	app.get(`/${OWNER}/${REPO}`, repoPage);
	app.get(`/${OWNER}/${REPO}/tree/:ref{.+}`, repoPage);

	app.notFound((c) => c.html(notFoundPage(baseOf(c)), 404));
	return app;
}
