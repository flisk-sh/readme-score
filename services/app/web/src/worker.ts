// Cloudflare Worker entry: the same Hono app as index.ts, served from the edge instead of a container.
// Settings come from [vars] in wrangler.toml (PUBLIC_URL, TRUST_PROXY, CALLS_PER_MINUTE); GITHUB_TOKEN is an optional
// secret (`bunx wrangler@4 secret put GITHUB_TOKEN`).
import { createApp } from "./app";
import { parseProxyMode } from "./guard";
import { withSecurityHeaders } from "./security-headers";

interface Env {
	PUBLIC_URL?: string;
	TRUST_PROXY?: string;
	CALLS_PER_MINUTE?: string;
	GITHUB_TOKEN?: string;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

let app: ReturnType<typeof createApp> | undefined;

export default {
	async fetch(request: Request, env: Env, ctx: unknown): Promise<Response> {
		return withSecurityHeaders(await handle(request, env, ctx));
	},
};

function handle(
	request: Request,
	env: Env,
	ctx: unknown,
): Response | Promise<Response> {
	{
		// "Always Use HTTPS" is a zone-wide setting, so the Worker redirects on
		// its own: the first request from an old http link is otherwise served
		// unencrypted. The URL keeps the path and query. Loopback hosts are left alone so
		// `wrangler dev` (plain http://localhost) keeps working; at the edge the Worker sees
		// the visitor's scheme, so an https request never loops.
		const url = new URL(request.url);
		if (url.protocol === "http:" && !LOOPBACK.has(url.hostname)) {
			url.protocol = "https:";
			return Response.redirect(url.toString(), 301);
		}

		if (url.pathname === "/about/" || url.pathname === "/checks/") {
			url.pathname = url.pathname.slice(0, -1);
			return Response.redirect(url.toString(), 301);
		}

		app ??= createApp({
			publicUrl: env.PUBLIC_URL || undefined,
			proxy: parseProxyMode(env.TRUST_PROXY),
			callsPerMinute: Number(env.CALLS_PER_MINUTE) || undefined,
			github: { token: env.GITHUB_TOKEN || undefined },
		});
		return app.fetch(request, env, ctx as never);
	}
}
