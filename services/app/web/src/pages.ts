// The pages, rendered on the server with no JavaScript (the Content-Security-Policy allows none): home, a result,
// about with the FAQ, and not found. Each one passes its own PageMeta to head(), which writes every SEO tag.
import { check, LEVELS, type Result, summarize } from "./contrast";
import { esc, faqJsonLd, head, type PageMeta } from "./seo";
import { SITE } from "./site";

const STYLE = `
:root{--bg:${SITE.themeColor.light};--fg:#141413;--muted:#66635c;--line:#e3e0d7;--card:#fff;--sunk:#efede7;--pass:#18794e;--fail:#c22a1f;--accent:#2d4cc8;--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root{--bg:${SITE.themeColor.dark};--fg:#eceae4;--muted:#a29f97;--line:#272a31;--card:#16181d;--sunk:#1c1f25;--pass:#4fcf8e;--fail:#ff7b72;--accent:#8ea2ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-underline-offset:3px}.wrap{max-width:820px;margin:0 auto;padding:0 20px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.stage{position:relative;overflow:hidden;background:#07080c;color:#f4f3ef;--fg:#f4f3ef;--muted:#b0afba;--line:#262833;--card:#11131a;--sunk:#1b1e28;--accent:#9db0ff;--pass:#4ade80;--fail:#ff7b72}
.stage::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:56px 56px;-webkit-mask-image:radial-gradient(60% 65% at 50% 30%,#000 25%,transparent 100%);mask-image:radial-gradient(60% 65% at 50% 30%,#000 25%,transparent 100%);pointer-events:none}
.stage::after{content:"";position:absolute;inset:-10%;background:radial-gradient(38% 32% at 22% 18%,rgba(91,124,255,.38),transparent 70%),radial-gradient(32% 30% at 82% 30%,rgba(74,222,128,.24),transparent 70%),radial-gradient(40% 36% at 55% 95%,rgba(168,85,247,.3),transparent 70%);pointer-events:none}
.stage>*{position:relative;z-index:1}
header.top{background:#07080c;border-bottom:1px solid #1d2029}header.top::before,header.top::after{display:none}
header.top .wrap{max-width:1080px;display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:60px;font-size:15px}
header.top a{color:var(--muted);text-decoration:none}header.top a:first-child{color:var(--fg);font-weight:750;font-size:17px;display:flex;gap:10px;align-items:center}header.top img{border-radius:6px}
.hero{padding:72px 0 0;text-align:center}.hero.short{padding-bottom:64px}
h1{font-size:clamp(34px,6.5vw,60px);line-height:1.04;letter-spacing:-.04em;font-weight:800;margin:0 auto 16px;max-width:16ch}
.grad{background:linear-gradient(92deg,#9db0ff,#c084fc 48%,#4ade80);-webkit-background-clip:text;background-clip:text;color:transparent}
h2{font-size:clamp(22px,3.4vw,30px);letter-spacing:-.025em;margin:56px 0 14px;font-weight:780}
.lede{color:var(--muted);font-size:clamp(17px,2.3vw,19px);max-width:600px;margin:0 auto 30px}
form{display:inline-flex;gap:14px;flex-wrap:wrap;align-items:center;justify-content:center;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:10px 10px 10px 18px}
.stage form{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.14)}
label{display:flex;gap:10px;align-items:center;font-weight:600;color:var(--muted)}
input[type=color]{width:52px;height:44px;padding:3px;border:1px solid var(--line);border-radius:10px;background:var(--card);cursor:pointer}
button{font:inherit;font-weight:650;padding:12px 22px;border:0;border-radius:10px;background:linear-gradient(135deg,#5b7cff,#8b5cf6);color:#fff;cursor:pointer;box-shadow:0 8px 24px -10px rgba(91,124,255,.8)}button:hover{background:linear-gradient(135deg,#6d8bff,#a06bff)}
.chips{margin:18px 0 0;font-size:13px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.chip{display:inline-flex;gap:6px;align-items:center;text-decoration:none;color:var(--fg);border:1px solid var(--line);border-radius:999px;padding:4px 12px;background:var(--card);font-family:var(--mono)}.chip:hover{border-color:var(--accent)}
.stage .chip{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.14)}
.sw{width:14px;height:14px;border-radius:50%;border:1px solid rgba(127,127,127,.4);display:inline-block;vertical-align:-2px}
.ratio{font-size:clamp(64px,15vw,120px);line-height:1;margin:0 auto 14px}
.sample{border-radius:16px;padding:32px 28px;border:1px solid var(--line);margin:40px 0 20px;box-shadow:0 20px 50px -30px rgba(20,20,40,.5)}.sample p{margin:0}.sample .big{font-size:26px;font-weight:750;margin-bottom:6px}
ul.levels{list-style:none;padding:0;margin:16px 0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px}
ul.levels li{display:flex;justify-content:space-between;align-items:center;gap:10px;background:var(--card);border:1px solid var(--line);border-left:4px solid var(--c);border-radius:12px;padding:12px 14px}
.pass,.fail{font-weight:750;font-size:13px;color:var(--c);background:color-mix(in srgb,var(--c) 12%,transparent);border-radius:999px;padding:2px 10px}
.pass{--c:var(--pass)}.fail{--c:var(--fail)}li:has(.pass){--c:var(--pass)}li:has(.fail){--c:var(--fail)}
pre{background:#0e0f12;color:#e8e6e1;border:1px solid #272a31;border-radius:12px;padding:14px 16px;overflow-x:auto;font:13px/1.6 var(--mono);white-space:pre-wrap;word-break:break-all}
dt{font-weight:700;margin-top:20px;font-size:17px}dd{margin:6px 0 0;color:var(--muted)}
.prose{padding:56px 0 0}.prose h1{text-align:left;margin:0 0 14px}.prose .lede{margin:0 0 28px}
footer{margin-top:96px;border-top:1px solid var(--line);padding:26px 0 44px;color:var(--muted);font-size:14px}
.hero{padding:48px 0 0}
@media (min-width:980px){.hero:not(.short){padding:56px 0 64px}.hero:not(.short) .wrap{max-width:1080px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);column-gap:56px;align-items:center;text-align:left}.hero:not(.short) .wrap>*{grid-column:1}.hero:not(.short) h1{margin:0 0 16px;font-size:clamp(40px,4.4vw,56px)}.hero:not(.short) .lede{margin:0 0 26px;font-size:18px}.hero:not(.short) form{justify-self:start}.hero:not(.short) .chips{justify-content:flex-start}}
@media (max-width:560px){form{padding:12px;justify-content:flex-start}button{width:100%}}
.reassure{margin:12px 0 0;font-size:13px;color:var(--muted)}.reassure b{color:var(--pass)}
.preview{--fg:#141413;--muted:#5d5a53;--line:#e6e3da;--sunk:#f3f1ec;--pass:#18794e;--fail:#c22a1f;margin:44px auto 0;max-width:520px;text-align:left;background:#fff;color:var(--fg);border-radius:18px;padding:18px;box-shadow:0 40px 100px -30px rgba(91,124,255,.65),0 0 0 1px rgba(255,255,255,.08)}
.preview .top{display:flex;align-items:center;gap:10px;font:600 12.5px var(--mono);color:var(--muted);margin-bottom:12px}.preview .top em{margin-left:auto;white-space:nowrap;font:600 11px ui-sans-serif,system-ui,sans-serif;font-style:normal;text-transform:uppercase;letter-spacing:.08em;background:var(--sunk);border-radius:6px;padding:3px 8px}
.preview .swatch{border-radius:12px;padding:18px;border:1px solid var(--line);display:flex;align-items:end;justify-content:space-between;gap:12px}.preview .swatch b{font-size:46px;line-height:1;letter-spacing:-.04em}.preview .swatch span{font-size:14px;max-width:18ch;text-align:right}
.preview ul{list-style:none;margin:10px 0 0;padding:0}.preview li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 2px;border-bottom:1px solid var(--line);font-size:14px}.preview li:last-child{border-bottom:0}
.preview .fixit{margin:10px 0 0;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--pass) 9%,#fff);font-size:14px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);margin:56px 0 0;border-top:1px solid var(--line);text-align:left}
.stats div{padding:24px 20px 28px 0}.stats div+div{padding-left:20px;border-left:1px solid var(--line)}
.stats b{display:block;font-size:clamp(30px,4vw,48px);line-height:1;font-weight:800;letter-spacing:-.04em}.stats span{display:block;margin-top:8px;color:var(--muted);font-size:14px;line-height:1.4;max-width:22ch}
.kick{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--accent);margin:72px 0 10px}.kick+h2{margin-top:0}
.film{margin:0;border-radius:18px;overflow:hidden;border:1px solid var(--line);background:#07080c}.film .chrome{display:flex;gap:7px;padding:12px 14px;border-bottom:1px solid #1d2029}.film .chrome i{width:11px;height:11px;border-radius:50%;background:#2a2d38}
.film video,.film img{display:block;width:100%;height:auto}.film .still{display:none}
@media (prefers-reduced-motion:reduce){.film video{display:none}.film .still{display:block}}
@media (max-width:640px){.stats{grid-template-columns:1fr 1fr}.stats div{padding:18px 12px 20px 0}.stats div+div{padding-left:12px}.stats div:nth-child(3){padding-left:0;border-left:0}.stats div:nth-child(n+3){border-top:1px solid var(--line)}}
@media (min-width:980px){.hero:not(.short) .preview{grid-column:2;grid-row:1/span 5;margin:0;justify-self:end;width:100%}.hero:not(.short) .stats{grid-column:1/-1}.hero:not(.short){padding-bottom:0}}
`;

function layout(base: string, meta: PageMeta, body: string): string {
	const root = new URL(`${base}/`).pathname.replace(/\/$/, "");
	return `<!doctype html><html lang="${SITE.lang}"><head>
${head(base, meta)}
<style>${STYLE}</style></head><body>
<header class="top stage"><nav class="wrap" aria-label="Site"><a href="${root}/"><img src="${root}/icon.svg" alt="" width="26" height="26">${esc(SITE.name)}</a><a href="${root}/about">About</a></nav></header>
<main>${body}</main>
<footer><div class="wrap">${esc(SITE.name)}: no JavaScript, no cookies, nothing stored. <a href="${SITE.repo}">Open source</a>, made by <a href="${SITE.author.url}">${esc(SITE.author.name)}</a>.</div></footer>
</body></html>`;
}

const form = (root: string, fg = "1d1c1a", bg = "fbfaf7") =>
	`<form action="${root}/check" method="get"><label>Text <input type="color" name="fg" value="#${fg}"></label><label>Background <input type="color" name="bg" value="#${bg}"></label><button type="submit">Check</button></form>`;

const chips = (root: string) =>
	`<p class="chips">${SITE.examples
		.map(
			([fg, bg]) =>
				`<a class="chip" href="${root}/${fg}/${bg}"><span class="sw" style="background:#${fg}"></span><span class="sw" style="background:#${bg}"></span>#${fg} on #${bg}</a>`,
		)
		.join("")}</p>`;

/** The numbers under the hero, each true of every pair. */
const STATS: [string, string][] = [
	[`${LEVELS.length}`, "WCAG 2.2 checks for every pair"],
	["1", "address per pair, to share or link"],
	["SVG", "badge and a JSON API for each pair"],
	["0", "scripts, cookies or stored colors"],
];

/** The hero's sample result, worked out by the checker itself. */
function preview(base: string): string {
	const r = check("999999", "ffffff") as Result;
	return `<figure class="preview" aria-label="A sample result"><div class="top">${esc(new URL(base).host)}/999999/ffffff<em>Sample result</em></div>
<div class="swatch" style="color:#${r.fg};background:#${r.bg}"><b>${r.ratio.toFixed(2)}:1</b><span>Gray text on white, as many sites set it</span></div>
<ul>${r.levels.map((l) => `<li><span>${esc(l.label)}</span><span class="${l.pass ? "pass" : "fail"}">${l.pass ? "Pass" : "Fail"}</span></li>`).join("")}</ul>
${r.suggestion ? `<p class="fixit"><span class="sw" style="background:#${r.suggestion}"></span> #${r.suggestion} is the nearest gray that passes AA body text.</p>` : ""}</figure>`;
}

export function homePage(base: string): string {
	const root = new URL(`${base}/`).pathname.replace(/\/$/, "");
	return layout(
		base,
		{
			path: "",
			title: `${SITE.name}: ${SITE.tagline}`,
			description: SITE.description,
		},
		`<section class="hero stage"><div class="wrap"><h1 class="grad">${esc(SITE.tagline)}</h1>
<p class="lede">${esc(SITE.description)}</p>
${form(root)}
${chips(root)}
<p class="reassure"><b>●</b> Free · No signup · No cookies</p>
${preview(base)}
<div class="stats">${STATS.map(([n, t]) => `<div><b>${n}</b><span>${t}</span></div>`).join("")}</div></div></section>
<div class="wrap"><p class="kick">See it run</p><h2>From two colors to a fix in 22 seconds.</h2>
<figure class="film"><div class="chrome" aria-hidden="true"><i></i><i></i><i></i></div><img class="still" src="${root}/demo.jpg" width="960" height="540" alt=""><video src="${root}/demo.mp4" poster="${root}/demo.jpg" width="960" height="540" autoplay muted loop playsinline preload="metadata" aria-describedby="demo-text"></video>
<figcaption id="demo-text" class="sr">A 22-second film: 999999/ffffff is typed after the address, the result page shows a 2.84:1 ratio and a text sample, every WCAG level is marked fail, and a click on the nearest passing color, #767676.</figcaption></figure>
<h2>Or type it</h2>
<pre>${esc(base)}/1d1c1a/fbfaf7</pre></div>`,
	);
}

export function resultPage(base: string, r: Result): string {
	const root = new URL(`${base}/`).pathname.replace(/\/$/, "");
	const path = `${r.fg}/${r.bg}`;
	const passes = r.levels.filter((l) => l.pass).length;
	const meta: PageMeta = {
		path,
		title: `#${r.fg} on #${r.bg}: ${r.ratio.toFixed(2)}:1 contrast`,
		description: summarize(r).slice(0, 160),
		crumbs: [{ name: `#${r.fg} on #${r.bg}`, path }],
	};
	return layout(
		base,
		meta,
		`<section class="hero short stage"><div class="wrap"><h1 class="ratio grad">${r.ratio.toFixed(2)}:1</h1>
<p class="lede">#${r.fg} text on #${r.bg}: passes ${passes} of ${r.levels.length} WCAG 2.2 checks.</p></div></section>
<div class="wrap"><div class="sample" style="color:#${r.fg};background:#${r.bg}"><p class="big">Large text, 24px bold</p><p>Body text at 16px, the size most paragraphs use.</p></div>
<ul class="levels">${r.levels
			.map(
				(l) =>
					`<li><span>${esc(l.label)} (${l.min}:1)</span><span class="${l.pass ? "pass" : "fail"}">${l.pass ? "Pass" : "Fail"}</span></li>`,
			)
			.join("")}</ul>
${r.suggestion ? `<p>Nearest text color that passes AA body text: <a href="${root}/${r.suggestion}/${r.bg}"><span class="sw" style="background:#${r.suggestion}"></span> #${r.suggestion}</a></p>` : ""}
<h2>Try other colors</h2>
${form(root, r.fg, r.bg)}
<h2>Embed or call it</h2>
<pre>![contrast](${esc(base)}/badge/${path}.svg)
curl '${esc(base)}/api/contrast?fg=${r.fg}&amp;bg=${r.bg}'</pre>
<p><img src="${root}/badge/${path}.svg" alt="Contrast badge for #${r.fg} on #${r.bg}" width="150" height="20"></p></div>`,
	);
}

export function aboutPage(base: string): string {
	return layout(
		base,
		{
			path: "about",
			title: "About and FAQ",
			description:
				`How ${SITE.name} works, what it stores and how to call it from code or an AI assistant. ${SITE.tagline}.`.slice(
					0,
					160,
				),
			jsonLd: [faqJsonLd()],
			crumbs: [{ name: "About", path: "about" }],
		},
		`<div class="wrap prose"><h1>About ${esc(SITE.name)}</h1>
<p class="lede">${esc(SITE.description)}</p>
<h2>Questions</h2>
<dl>${SITE.faq.map((f) => `<dt>${esc(f.q)}</dt><dd>${esc(f.a)}</dd>`).join("")}</dl>
<h2>Use it from an AI assistant</h2>
<pre>claude mcp add --transport http ${esc(SITE.name.toLowerCase())} ${esc(base)}/mcp</pre></div>`,
	);
}

export function notFoundPage(base: string): string {
	const root = new URL(`${base}/`).pathname.replace(/\/$/, "");
	return layout(
		base,
		{
			path: "404",
			title: "Page not found",
			description: `This address is not a page on ${SITE.name}. A result address is two hex colors: /1d1c1a/fbfaf7.`,
			noindex: true,
		},
		`<div class="wrap prose"><h1>Page not found</h1><p class="lede">A result address is two hex colors, text first: <a href="${root}/1d1c1a/fbfaf7">/1d1c1a/fbfaf7</a>.</p>${form(root)}</div>`,
	);
}

/** A shields-style badge, 150×20, with the ratio colored by the AA verdict. */
export function badge(r: Result): string {
	const pass = r.levels[0].pass;
	const value = `${r.ratio.toFixed(2)}:1 ${pass ? "AA" : "fail"}`;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="20" role="img" aria-label="contrast: ${value}"><title>contrast: ${value}</title><rect width="66" height="20" fill="#555"/><rect x="66" width="84" height="20" fill="${pass ? "#1f7a4d" : "#b3261e"}"/><g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle"><text x="33" y="14">contrast</text><text x="108" y="14">${value}</text></g></svg>`;
}
