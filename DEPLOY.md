# Deploy README Score at readme.flisk.si (free)

README Score online is one Cloudflare Worker on the free plan: the same Hono app as the Bun server, started from [`services/app/web/src/worker.ts`](services/app/web/src/worker.ts) and configured in [`services/app/web/wrangler.toml`](services/app/web/wrangler.toml). No database. One optional secret: `GITHUB_TOKEN`.

It moved off Render's free plan: every free Render service in the workspace shares one pool of instance hours, and when the pool ran out, Render suspended them all until the next month. The root [`Dockerfile`](Dockerfile) still builds the same app as a container for any other host (Fly, Railway, your own server); the live site does not use it.

## What the Worker does differently

- **Settings.** They come from `[vars]` in `wrangler.toml` (`PUBLIC_URL`, `TRUST_PROXY = "cloudflare"`, optionally `CALLS_PER_MINUTE`), not from a process environment. `GITHUB_TOKEN` is a secret.
- **Fetching sites.** `website.ts` resolves host names with `node:dns` before it reads a product's site, so `wrangler.toml` sets the `nodejs_compat` flag.
- **Limits.** Cached results (ten minutes) and rate-limit counters live in memory per Worker instance, so they reset more often than on a single server.

## Deploy

From `services/app/web`, logged in with `bunx wrangler@4 login`:

```bash
bunx wrangler@4 deploy
```

The custom domain `readme.flisk.si` is created by Cloudflare (`routes` in `wrangler.toml`); the hostname must have no other DNS record in zone `flisk.si` (delete an old `CNAME` to Render first, or the deploy stops with code 100117).

Check the bundle without deploying (CI runs this too):

```bash
bunx wrangler@4 deploy --dry-run
```

## The GitHub token (optional)

Without it, the whole Worker shares GitHub's 60 calls an hour, which is 20 repositories; with it, 5,000 (1,666 repositories). Results are cached for ten minutes, so a shared link costs nothing.

1. GitHub → Settings → Developer settings → Fine-grained tokens → public repositories, read-only, no permissions.
2. From `services/app/web`: `bunx wrangler@4 secret put GITHUB_TOKEN`, and paste the token.

For local runs of the Worker (`bunx wrangler@4 dev`), put it in `services/app/web/.dev.vars` as `GITHUB_TOKEN=...`. That file is git-ignored; never commit it.

## Check it

```bash
curl -s https://readme.flisk.si/ready
curl -s https://readme.flisk.si/robots.txt
curl -s 'https://readme.flisk.si/api/score?repo=flisk-sh/flisk' | head -c 300
curl -s -X POST https://readme.flisk.si/mcp -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Tell search engines

- Google Search Console and Bing Webmaster Tools: add the domain, submit `/sitemap.xml`.
- Paste a result address into https://www.opengraph.xyz and the Rich Results Test to see the card and the JSON-LD.
