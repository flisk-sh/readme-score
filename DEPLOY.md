# Deploy on Render (free)

One Render web service on the free plan, from [`render.yaml`](render.yaml) and the root [`Dockerfile`](Dockerfile).
No database. One optional secret: `GITHUB_TOKEN`.

## 1. Create the service

1. https://dashboard.render.com → **New → Blueprint** → `flisk-sh/readme-score`, branch `main`.
2. Render lists one service on the **Free** plan and asks for `GITHUB_TOKEN`. Paste a fine-grained token with no
   permissions (GitHub → Settings → Developer settings → Fine-grained tokens → public repositories, read-only), or
   leave it empty. Without it, the whole server shares GitHub's 60 calls an hour, which is 20 repositories; with it,
   5,000 (1,666 repositories). Results are cached for ten minutes, so a shared link costs nothing.
3. Apply. `PUBLIC_URL` is already `https://readme.flisk.si/`; until the domain works, set it to the service's
   `https://readme-score.onrender.com/` so canonical links and the social card point somewhere that answers.

The free plan sleeps after 15 minutes without traffic and takes about a minute to wake. On launch day, upgrade to
Starter for the day, or keep it awake.

## 2. readme.flisk.si

`render.yaml` already lists the domain. flisk.si's DNS is on Cloudflare:

1. Render → the service → **Settings → Custom Domains** shows the CNAME target (`readme-score.onrender.com`).
2. Cloudflare → flisk.si → **DNS → Add record**: `CNAME`, name `readme`, that target, proxy **DNS only**.
3. Wait for Render to issue the certificate, then set `PUBLIC_URL` back to `https://readme.flisk.si/`.

Without a payment method on file, Render allows two custom domains per workspace, and the Blueprint sync fails on a
third. citable.flisk.si and helpdock.flisk.sh may already use the two: add a card, use another workspace, or drop
`domains` from `render.yaml` and add the domain by hand later. If you put Cloudflare's proxy in front instead, set
`TRUST_PROXY=cloudflare` and accept traffic from Cloudflare only.

## 3. Check it

```bash
curl -s https://readme.flisk.si/ready
curl -s https://readme.flisk.si/robots.txt
curl -s 'https://readme.flisk.si/api/score?repo=flisk-sh/flisk' | head -c 300
curl -s -X POST https://readme.flisk.si/mcp -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 4. Tell search engines

- Google Search Console and Bing Webmaster Tools: add the domain, submit `/sitemap.xml`.
- Paste a result address into https://www.opengraph.xyz and the Rich Results Test to see the card and the JSON-LD.
