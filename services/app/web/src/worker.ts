// Cloudflare Worker entry: the same Hono app as index.ts, served from the edge instead of a container.
// Settings come from [vars] in wrangler.toml (PUBLIC_URL, TRUST_PROXY, CALLS_PER_MINUTE); GITHUB_TOKEN is an optional
// secret (`bunx wrangler@4 secret put GITHUB_TOKEN`).
import { createApp } from "./app";
import { parseProxyMode } from "./guard";

interface Env {
	PUBLIC_URL?: string;
	TRUST_PROXY?: string;
	CALLS_PER_MINUTE?: string;
	GITHUB_TOKEN?: string;
}

let app: ReturnType<typeof createApp> | undefined;

export default {
	fetch(
		request: Request,
		env: Env,
		ctx: unknown,
	): Response | Promise<Response> {
		// "Always Use HTTPS" is a zone-wide setting, so the Worker redirects on
		// its own: the first request from an old http link is otherwise served
		// unencrypted. The URL keeps the path and query.
		const url = new URL(request.url);
		if (url.protocol === "http:") {
			url.protocol = "https:";
			return Response.redirect(url.toString(), 301);
		}

		app ??= createApp({
			publicUrl: env.PUBLIC_URL || undefined,
			proxy: parseProxyMode(env.TRUST_PROXY),
			callsPerMinute: Number(env.CALLS_PER_MINUTE) || undefined,
			github: { token: env.GITHUB_TOKEN || undefined },
		});
		return app.fetch(request, env, ctx as never);
	},
};
