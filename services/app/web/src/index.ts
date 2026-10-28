// Settings (all optional):
//   PORT              where to listen (4000 under Flisk, 10000 on Render)
//   PUBLIC_URL        the address people use, for canonical links, Open Graph and the sitemap; without it, each
//                     request's own address and the prefix a proxy stripped (X-Forwarded-Prefix, /api/web under
//                     `flisk up`)
//   TRUST_PROXY       none | last-forwarded (Render) | cloudflare: which header names the client, for rate limits
//   CALLS_PER_MINUTE  fresh GitHub reads, API and MCP calls per client address per minute (120)
//   GITHUB_TOKEN      raises GitHub's limit for this server from 60 to 5,000 API calls an hour (3 per repository);
//                     a fine-grained token with no permissions is enough, since only public repositories are read
import { createApp } from "./app";
import { parseProxyMode } from "./guard";
import { SITE } from "./site";

const port = Number(process.env.PORT) || 4000;
const app = createApp({
	publicUrl: process.env.PUBLIC_URL || undefined,
	proxy: parseProxyMode(process.env.TRUST_PROXY),
	callsPerMinute: Number(process.env.CALLS_PER_MINUTE) || undefined,
	github: { token: process.env.GITHUB_TOKEN || undefined },
});

console.log(`${SITE.id} listening on http://localhost:${port}`);

export default { port, fetch: app.fetch, idleTimeout: 30 };
