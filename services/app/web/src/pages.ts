// The pages, rendered on the server with no JavaScript (the Content-Security-Policy allows none): home, a result, the
// checks with every threshold, about with the FAQ, errors and not found. Each one passes its own PageMeta to head(),
// which writes every SEO tag. Everything that comes from a README is escaped.
import {
	BADGE,
	H1_WITHIN_NONEMPTY_LINES,
	IMAGE_WITHIN_LINES,
	INSTALL_COMMAND,
	INSTALL_WITHIN_LINES,
	MAX_BADGES_BEFORE_CODE,
	MAX_PROSE_WORDS_BEFORE_CODE,
} from "./readme/first-screen";
import { POINTS_LOST_PER_BROKEN_LINK } from "./readme/links";
import {
	FOLDER_COMMANDS,
	MAX_QUICKSTART_COMMANDS,
	SHELLS,
	TRANSLATION_FOLDERS,
} from "./readme/quickstart";
import {
	JARGON,
	LONG_SENTENCE_WORDS,
	READING_EASE_FULL_MARKS,
	READING_EASE_ZERO,
} from "./readme/readability";
import {
	type Check,
	GRADES,
	POINTS,
	type Report,
	score,
	TAGLINE_POINTS_BY_DISTINCT,
} from "./readme/score";
import {
	PROJECT_TYPES,
	type ProjectType,
	SECTION_IDS,
	SECTIONS,
	WEIGHT_LABELS,
	WEIGHTS,
} from "./readme/sections";
import { fixFirst, headline, summarize } from "./readme/summary";
import {
	README_PITCH_WORDS,
	WEBSITE_PITCH_MIN_OVERLAP,
} from "./readme/website";
import { SAMPLE_README } from "./sample";
import { esc, faqJsonLd, head, type PageMeta } from "./seo";
import { SITE } from "./site";
import { MAX_REDIRECTS } from "./website";

const STYLE = `
:root{--bg:${SITE.themeColor.light};--fg:#141413;--muted:#66635c;--line:#e3e0d7;--card:#fff;--sunk:#efede7;--pass:#18794e;--fail:#c22a1f;--skip:#8a857a;--accent:#2d4cc8;--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace}
@media (prefers-color-scheme:dark){:root{--bg:${SITE.themeColor.dark};--fg:#eceae4;--muted:#a29f97;--line:#272a31;--card:#16181d;--sunk:#1c1f25;--pass:#4fcf8e;--fail:#ff7b72;--skip:#8f8b83;--accent:#8ea2ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-underline-offset:3px}.wrap{max-width:880px;margin:0 auto;padding:0 20px}
.stage{position:relative;overflow:hidden;background:#07080c;color:#f4f3ef;--fg:#f4f3ef;--muted:#b0afba;--line:#262833;--card:#11131a;--sunk:#1b1e28;--accent:#9db0ff;--pass:#4ade80;--fail:#ff7b72}
.stage::before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:56px 56px;-webkit-mask-image:radial-gradient(60% 65% at 50% 30%,#000 25%,transparent 100%);mask-image:radial-gradient(60% 65% at 50% 30%,#000 25%,transparent 100%);pointer-events:none}
.stage::after{content:"";position:absolute;inset:-10%;background:radial-gradient(38% 32% at 22% 18%,rgba(91,124,255,.38),transparent 70%),radial-gradient(32% 30% at 82% 30%,rgba(74,222,128,.24),transparent 70%),radial-gradient(40% 36% at 55% 95%,rgba(168,85,247,.3),transparent 70%);pointer-events:none}
.stage>*{position:relative;z-index:1}
header.top{background:#07080c;border-bottom:1px solid #1d2029}header.top::before,header.top::after{display:none}
header.top .wrap{max-width:1080px;display:flex;gap:20px;align-items:center;min-height:60px;font-size:15px}header.top .wrap a:nth-child(2){margin-left:auto}
header.top a{color:var(--muted);text-decoration:none}header.top a:first-child{color:var(--fg);font-weight:750;font-size:17px;display:flex;gap:10px;align-items:center}header.top img{border-radius:6px}
.hero{padding:48px 0 64px;text-align:center}
h1{font-size:clamp(34px,6.5vw,58px);line-height:1.04;letter-spacing:-.04em;font-weight:800;margin:0 auto 16px;max-width:18ch}
.grad{background:linear-gradient(92deg,#9db0ff,#c084fc 48%,#4ade80);-webkit-background-clip:text;background-clip:text;color:transparent}
h2{font-size:clamp(22px,3.4vw,30px);letter-spacing:-.025em;margin:56px 0 14px;font-weight:780}h3{font-size:18px;margin:28px 0 8px}
.lede{color:var(--muted);font-size:clamp(17px,2.3vw,19px);max-width:640px;margin:0 auto 26px}
form.repo{display:flex;gap:10px;max-width:620px;margin:0 auto;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:8px}
input[type=text],textarea,select{font:inherit;color:var(--fg);background:var(--card);border:1px solid var(--line);border-radius:10px;padding:11px 14px}
form.repo input{flex:1;min-width:0;background:transparent;border:0;font-family:var(--mono);font-size:15px}form.repo input:focus{outline:none}
form.repo:focus-within{border-color:#9db0ff}
button{font:inherit;font-weight:650;padding:12px 22px;border:0;border-radius:10px;background:linear-gradient(135deg,#5b7cff,#8b5cf6);color:#fff;cursor:pointer;box-shadow:0 8px 24px -10px rgba(91,124,255,.8)}button:hover{background:linear-gradient(135deg,#6d8bff,#a06bff)}
details.paste{max-width:620px;margin:16px auto 0;text-align:left}details.paste summary{cursor:pointer;color:var(--muted);text-align:center}
details.paste form{display:grid;gap:10px;margin-top:12px}textarea{width:100%;min-height:220px;font:13px/1.5 var(--mono)}
a.btn{display:inline-block;box-sizing:border-box;font-weight:700;font-size:18px;padding:14px 30px;border-radius:12px;background:#d97757;color:#fff;text-decoration:none;box-shadow:0 10px 28px -10px rgba(217,119,87,.9);margin:4px 0 14px}a.btn:hover{background:#e58a6b}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.row label{color:var(--muted);font-size:14px}
.chips{margin:18px 0 0;font-size:13px;display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.chip{text-decoration:none;color:var(--fg);border:1px solid rgba(255,255,255,.14);border-radius:999px;padding:4px 12px;background:rgba(255,255,255,.05);font-family:var(--mono)}.chip:hover{border-color:var(--accent)}
.ph{margin:40px 0 0}.ph img{display:block}
.reassure{margin:14px 0 0;font-size:13px;color:var(--muted)}.reassure b{color:var(--pass)}
.error{max-width:620px;margin:0 auto 18px;padding:10px 14px;border-radius:10px;background:color-mix(in srgb,var(--fail) 16%,transparent);color:var(--fg)}
.score{font-size:clamp(76px,16vw,132px);line-height:1;margin:0 auto 6px;font-weight:850;letter-spacing:-.05em}.score small{font-size:.32em;letter-spacing:0;-webkit-text-fill-color:var(--muted)}
.grade{display:inline-block;font-weight:800;font-size:20px;border-radius:12px;padding:2px 14px;margin-bottom:16px;background:color-mix(in srgb,var(--g) 22%,transparent);color:var(--g)}
.g-A,.g-B{--g:var(--pass)}.g-C{--g:#e0a54a}.g-D,.g-F{--g:var(--fail)}
.types{font-size:14px;color:var(--muted)}.types a,.types b{margin:0 6px}.types b{color:var(--fg)}
.pill{flex:none;font-weight:750;font-size:12px;border-radius:999px;padding:2px 10px;color:var(--c);background:color-mix(in srgb,var(--c) 13%,transparent);text-transform:uppercase;letter-spacing:.04em}
.pass{--c:var(--pass)}.fail{--c:var(--fail)}.skip{--c:var(--skip)}
ul.checks{list-style:none;padding:0;margin:12px 0;display:grid;gap:8px}
ul.checks>li{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--c);border-radius:12px;padding:12px 16px}
.head{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}.head .t{font-weight:700}.head .pts{margin-left:auto;font:600 13px var(--mono);color:var(--muted)}
.meta{color:var(--muted);font-size:14px}.meta code,.fix code{font:13px var(--mono)}
.fix{margin:8px 0 0;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--accent) 9%,transparent);font-size:15px}
ul.findings{margin:8px 0 0;padding-left:18px;font-size:14px;color:var(--muted)}ul.findings li{margin:2px 0;overflow-wrap:anywhere}
pre{background:#0e0f12;color:#e8e6e1;border:1px solid #272a31;border-radius:12px;padding:12px 14px;overflow-x:auto;font:13px/1.6 var(--mono);white-space:pre-wrap;word-break:break-word;margin:8px 0 0}
table{width:100%;border-collapse:collapse;font-size:14px;margin:10px 0}th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:650}td code{font:13px var(--mono)}
.tbl{overflow-x:auto}
dt{font-weight:700;margin-top:20px;font-size:17px}dd{margin:6px 0 0;color:var(--muted)}
.prose{padding:56px 0 0}.prose h1{text-align:left;margin:0 0 14px;max-width:none}.prose .lede{margin:0 0 28px}
footer{margin-top:96px;border-top:1px solid var(--line);padding:26px 0 44px;color:var(--muted);font-size:14px}
.preview{--fg:#141413;--muted:#5d5a53;--line:#e6e3da;--sunk:#f3f1ec;--pass:#18794e;--fail:#c22a1f;margin:40px auto 0;max-width:560px;text-align:left;background:#fff;color:var(--fg);border-radius:18px;padding:18px;box-shadow:0 40px 100px -30px rgba(91,124,255,.65),0 0 0 1px rgba(255,255,255,.08)}
.preview .top{display:flex;align-items:center;gap:10px;font:600 12.5px var(--mono);color:var(--muted);margin-bottom:10px}.preview .top em{margin-left:auto;white-space:nowrap;font:600 11px ui-sans-serif,system-ui,sans-serif;font-style:normal;text-transform:uppercase;letter-spacing:.08em;background:var(--sunk);border-radius:6px;padding:3px 8px}
.preview .big{display:flex;align-items:baseline;gap:12px}.preview .big b{font-size:52px;line-height:1;letter-spacing:-.04em}.preview .big span{color:var(--muted)}
.preview ul{list-style:none;margin:10px 0 0;padding:0}.preview li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 2px;border-bottom:1px solid var(--line);font-size:14px}.preview li:last-child{border-bottom:0}
.preview .fix{background:color-mix(in srgb,var(--pass) 9%,#fff)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);margin:56px 0 0;border-top:1px solid var(--line);text-align:left}
.stats div{padding:24px 20px 28px 0}.stats div+div{padding-left:20px;border-left:1px solid var(--line)}
.stats b{display:block;font-size:clamp(30px,4vw,48px);line-height:1;font-weight:800;letter-spacing:-.04em}.stats span{display:block;margin-top:8px;color:var(--muted);font-size:14px;line-height:1.4;max-width:22ch}
.kick{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--accent);margin:72px 0 10px}.kick+h2{margin-top:0}
@media (max-width:640px){.stats{grid-template-columns:1fr 1fr}.stats div{padding:18px 12px 20px 0}.stats div+div{padding-left:12px}.stats div:nth-child(3){padding-left:0;border-left:0}.stats div:nth-child(n+3){border-top:1px solid var(--line)}form.repo{flex-direction:column}button,a.btn{width:100%}}
`;

const rootOf = (base: string) =>
	new URL(`${base}/`).pathname.replace(/\/$/, "");

function layout(base: string, meta: PageMeta, body: string): string {
	const root = rootOf(base);
	return `<!doctype html><html lang="${SITE.lang}"><head>
${head(base, meta)}
<style>${STYLE}</style></head><body>
<header class="top stage"><nav class="wrap" aria-label="Site"><a href="${root}/"><img src="${root}/icon.svg" alt="" width="26" height="26">${esc(SITE.name)}</a><a href="${root}/checks">Checks</a><a href="${root}/about">About</a></nav></header>
<main>${body}</main>
<footer><div class="wrap">${esc(SITE.name)}: no AI, no JavaScript, no cookies, nothing stored. <a href="${SITE.repo}">Open source</a>, made by <a href="${SITE.author.url}">${esc(SITE.author.name)}</a>.</div></footer>
</body></html>`;
}

const typeOptions = (selected?: ProjectType) =>
	`<option value="">Project type: detect</option>${PROJECT_TYPES.map(
		(t) =>
			`<option value="${t}"${t === selected ? " selected" : ""}>${esc(WEIGHTS[t].title)}</option>`,
	).join("")}`;

const repoForm = (root: string, value = "") =>
	`<form class="repo" action="${root}/check" method="get" role="search"><input type="text" name="repo" value="${esc(value)}" placeholder="github.com/owner/repo" autocomplete="off" spellcheck="false" required aria-label="GitHub repository"><button type="submit">Score it</button></form>`;

const pasteForm = (root: string, open = false) =>
	`<details class="paste"${open ? " open" : ""}><summary>Or paste a README</summary><form action="${root}/paste" method="post"><textarea name="readme" required placeholder="# My project" aria-label="README in Markdown"></textarea><input type="text" name="website" placeholder="Website, to compare (optional): https://example.com" aria-label="Product website, optional" autocomplete="url"><div class="row"><select name="type" aria-label="Project type">${typeOptions()}</select><button type="submit">Score the README</button></div></form></details>`;

const chips = (root: string) =>
	`<p class="chips">${SITE.examples.map((r) => `<a class="chip" href="${root}/${r}">${esc(r)}</a>`).join("")}</p>`;

const statusOf = (c: Check) =>
	c.pass === null ? "skip" : c.pass ? "pass" : "fail";
const statusText = (c: Check) =>
	c.pass === null ? "Not checked" : c.pass ? "Pass" : "Fail";
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** A link to a line on GitHub at the scored commit, or the line number alone for a pasted README. */
function lineRef(
	report: Report,
	line: number | undefined,
	file = report.readme.path,
): string {
	if (!line) return file === report.readme.path ? "" : esc(file);
	const label =
		file === report.readme.path ? `line ${line}` : `${file}:${line}`;
	if (!report.repo) return esc(label);
	const { owner, name, sha } = report.repo;
	const path = file.split("/").map(encodeURIComponent).join("/");
	return `<a href="https://github.com/${owner}/${name}/blob/${sha}/${path}#L${line}">${esc(label)}</a>`;
}

function checkItem(report: Report, c: Check): string {
	const findings = c.findings?.length
		? `<ul class="findings">${c.findings
				.map((f) => {
					const where = f.line || f.file ? lineRef(report, f.line, f.file) : "";
					return `<li>${where ? `${where}: ` : ""}${esc(f.text)}</li>`;
				})
				.join("")}</ul>`
		: "";
	const at = c.line ? ` · ${lineRef(report, c.line)}` : "";
	return `<li class="${statusOf(c)}"><div class="head"><span class="pill ${statusOf(c)}">${statusText(c)}</span><span class="t">${esc(c.title)}</span><span class="pts">${c.pass === null ? "–" : `${num(c.points)}/${num(c.max)}`}</span></div>
<div class="meta">${esc(c.measured)} · limit: ${esc(c.limit)}${at}</div>${c.fix ? `<p class="fix"><b>Fix:</b> ${esc(c.fix)}</p>` : ""}${c.snippet ? `<pre>${esc(c.snippet)}</pre>` : ""}${findings}</li>`;
}

/** The home page's sample result: a small CLI's first README, scored by the checks themselves. */
function preview(): string {
	const r = score({
		readme: SAMPLE_README,
		readmePath: "README.md",
		type: "cli",
	});
	const top = fixFirst(r);
	const rows = r.groups.map((g) => {
		const ok = g.points === g.max;
		return `<li><span>${esc(g.title)}</span><span class="pill ${ok ? "pass" : "fail"}">${num(g.points)}/${num(g.max)}</span></li>`;
	});
	return `<figure class="preview" aria-label="A sample result"><div class="top">README.md of a small CLI<em>Sample result</em></div>
<div class="big"><b>${r.score}/100</b><span class="grade g-${r.grade}">${r.grade}</span></div>
<ul>${rows.join("")}</ul>
${top[0] ? `<p class="fix"><b>Fix first, line ${top[0].line}:</b> ${esc(top[0].fix ?? "")}</p>` : ""}</figure>`;
}

const STATS: [string, string][] = [
	["28", "checks, each pointing at a line"],
	[String(SECTION_IDS.length), "sections, matched by fixed synonym lists"],
	[String(PROJECT_TYPES.length), "project types, each with its own weights"],
	["0", "models: same README, same score"],
];

export function homePage(
	base: string,
	opts: { error?: string; value?: string } = {},
): string {
	const root = rootOf(base);
	const groupRows = [
		[
			"Sections",
			POINTS.sections,
			"The sections a reader looks for, weighted for your project type",
		],
		[
			"First screen",
			POINTS.firstScreenEach * 5,
			"Title, install command, a picture, few badges, a short pitch",
		],
		["Readability", POINTS.readability, "Flesch reading ease of the prose"],
		[
			"Quickstart",
			POINTS.quickstartFound + POINTS.quickstartLength + POINTS.translations,
			"One block, few commands, translations that agree",
		],
		[
			"Links",
			POINTS.fileLinks + POINTS.anchors,
			"Relative links and #anchors that resolve",
		],
		[
			"Tagline",
			POINTS.tagline + POINTS.nameSpelling,
			"One description in the README, the manifests and the GitHub About box, and one spelling of the name",
		],
		[
			"Website",
			POINTS.websiteHeadline +
				POINTS.websitePitch +
				POINTS.websiteLead +
				POINTS.websiteInstall,
			"The product's website: the README's headline, its pitch's words, its first command and its install command",
		],
	];
	return layout(
		base,
		{
			path: "",
			title: `${SITE.name}: ${SITE.tagline}`,
			description: SITE.description,
		},
		`<section class="hero stage"><div class="wrap"><h1 class="grad">${esc(SITE.tagline)}</h1>
<p class="lede">${esc(SITE.description)}</p>
${opts.error ? `<p class="error" role="alert">${esc(opts.error)}</p>` : ""}${repoForm(root, opts.value)}
${chips(root)}
${pasteForm(root)}
<p class="reassure"><b>●</b> No AI · No signup · Every finding names a line</p>
${preview()}
<div class="stats">${STATS.map(([n, t]) => `<div><b>${n}</b><span>${t}</span></div>`).join("")}</div></div></section>
<div class="wrap"><p class="kick">How it scores</p><h2>Seven groups, 100 points, no judgement calls.</h2>
<div class="tbl"><table><thead><tr><th>Group</th><th>Points</th><th>What it looks at</th></tr></thead><tbody>${groupRows
			.map(([g, p, w]) => `<tr><td>${g}</td><td>${p}</td><td>${w}</td></tr>`)
			.join("")}</tbody></table></div>
<p>A check with nothing to look at (a pasted README has no file tree) is left out, and the score is the points earned over the points that count. Every threshold is on <a href="${root}/checks">the checks page</a>.</p>
<h2>Or type it</h2>
<pre>${esc(base)}/flisk-sh/flisk</pre>
${PRODUCT_HUNT_BADGE}</div>`,
	);
}

/** One link that opens Claude Code desktop app's claude://code/new deep link) with every failing check and its fix typed in. */
export function fixAllInClaude(report: Report, url?: string): string {
	const task = `Fix my README so every check below passes${report.repo ? ` (the ${report.repo.owner}/${report.repo.name} repo)` : ""}. Edit README.md (and any other file a fix names), change nothing else, then tell me what you changed.\n\n${summarize(report, url)}`;
	const repo = report.repo
		? `&repo=${report.repo.owner}/${report.repo.name}`
		: "";
	return `claude://code/new?q=${encodeURIComponent(task.slice(0, 6000))}`;
}

/** The Product Hunt "featured" badge for the launch, linked with Product Hunt's own tracking parameters. */
const PRODUCT_HUNT_BADGE = `<p class="ph"><a href="https://www.producthunt.com/products/readme-score?embed=true&amp;utm_source=badge-featured&amp;utm_medium=badge&amp;utm_campaign=badge-readme-score" target="_blank" rel="noopener noreferrer"><img alt="README Score - Score your README out of 100, with a fix for every miss | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1296522&amp;theme=light&amp;t=1793234373643"></a></p>`;

export interface ResultOptions {
	/** The result's own path ("owner/repo" or "owner/repo/tree/ref"); none for a pasted README. */
	path?: string;
}

export function resultPage(
	base: string,
	report: Report,
	opts: ResultOptions = {},
): string {
	const root = rootOf(base);
	const r = report;
	const repoLink = r.repo
		? `<a href="https://github.com/${r.repo.owner}/${r.repo.name}/tree/${r.repo.sha}">${esc(`${r.repo.owner}/${r.repo.name}`)}</a> at <code>${esc(/^[0-9a-f]{40}$/.test(r.repo.sha) ? r.repo.sha.slice(0, 7) : r.repo.sha)}</code>${r.repo.ref !== r.repo.sha ? ` (${esc(r.repo.ref)})` : ""} · ${esc(r.readme.path)}${r.note ? `<br>${esc(r.note)}: relative links, translations and the GitHub description are not checked` : ""}`
		: `The pasted README, ${r.readme.lines} lines`;
	const types = opts.path
		? `<p class="types">Scored as ${PROJECT_TYPES.map((t) =>
				t === r.type.type
					? `<b>${esc(WEIGHTS[t].title)}</b>`
					: `<a href="${root}/${opts.path}?type=${t}">${esc(WEIGHTS[t].title)}</a>`,
			).join(" ·")}</p>`
		: `<p class="types">Scored as <b>${esc(r.type.title)}</b>; paste again to pick another type.</p>`;
	const fails = fixFirst(r);
	const meta: PageMeta = opts.path
		? {
				path: opts.path,
				title: `${r.repo ? `${r.repo.owner}/${r.repo.name}` : "README"}: ${r.score}/100 README score`,
				description: headline(r).slice(0, 160),
				crumbs: [
					{
						name: r.repo ? `${r.repo.owner}/${r.repo.name}` : "README",
						path: opts.path,
					},
				],
			}
		: {
				path: "paste",
				title: `Pasted README: ${r.score}/100`,
				description: headline(r).slice(0, 160),
				noindex: true,
			};
	const groups = r.groups
		.map(
			(g) =>
				`<h2 id="${g.id}">${esc(g.title)} <span class="meta">${g.max ? `${num(g.points)}/${num(g.max)}` : "not checked"}</span></h2><ul class="checks">${g.checks.map((c) => checkItem(r, c)).join("")}</ul>`,
		)
		.join("");
	const embed = r.repo
		? `<h2>Badge, API and MCP</h2>
<pre>[![README score](${esc(base)}/badge/${esc(`${r.repo.owner}/${r.repo.name}`)}.svg)](${esc(base)}/${esc(`${r.repo.owner}/${r.repo.name}`)})
curl '${esc(base)}/api/score?repo=${esc(`${r.repo.owner}/${r.repo.name}`)}'
claude mcp add --transport http ${SITE.id} ${esc(base)}/mcp</pre>
<p><img src="${root}/badge/${esc(`${r.repo.owner}/${r.repo.name}`)}.svg" alt="README score badge for ${esc(`${r.repo.owner}/${r.repo.name}`)}" width="140" height="20"></p>`
		: "";
	return layout(
		base,
		meta,
		`<section class="hero stage"><div class="wrap"><h1 class="score grad">${r.score}<small>/100</small></h1>
<span class="grade g-${r.grade}">Grade ${r.grade}</span>
<p class="lede">${repoLink}<br>${r.counts.passed} checks pass, ${r.counts.failed} fail${r.counts.skipped ? `, ${r.counts.skipped} not checked` : ""} · ${num(r.earned)} of ${num(r.available)} points</p>
${fails.length ? `<p><a class="btn" href="${esc(fixAllInClaude(r, opts.path ? `${base}/${opts.path}` : undefined))}" target="_blank" rel="noopener">Fix all in Claude Code</a></p>` : ""}
${types}<p class="types">${esc(r.type.chosen ? "Type chosen on this page." : `Detected: ${r.type.reason}.`)}</p></div></section>
<div class="wrap">${
			fails.length
				? `<h2>Fix first</h2><ul class="checks">${fails
						.slice(0, 5)
						.map((c) => checkItem(r, c))
						.join("")}</ul>`
				: "<h2>Nothing to fix</h2><p>Every check that applies passes.</p>"
		}
${groups}
${embed}
<h2>Score another</h2>${repoForm(root)}${pasteForm(root)}</div>`,
	);
}

const codeList = (items: readonly string[]) =>
	items.map((x) => `<code>${esc(x)}</code>`).join(", ");

export function checksPage(base: string): string {
	const thresholds: [string, string, string][] = [
		[
			"First screen",
			"H1_WITHIN_NONEMPTY_LINES",
			String(H1_WITHIN_NONEMPTY_LINES),
		],
		["First screen", "INSTALL_WITHIN_LINES", String(INSTALL_WITHIN_LINES)],
		["First screen", "IMAGE_WITHIN_LINES", String(IMAGE_WITHIN_LINES)],
		["First screen", "MAX_BADGES_BEFORE_CODE", String(MAX_BADGES_BEFORE_CODE)],
		[
			"First screen",
			"MAX_PROSE_WORDS_BEFORE_CODE",
			String(MAX_PROSE_WORDS_BEFORE_CODE),
		],
		["Readability", "READING_EASE_FULL_MARKS", String(READING_EASE_FULL_MARKS)],
		["Readability", "READING_EASE_ZERO", String(READING_EASE_ZERO)],
		["Readability", "LONG_SENTENCE_WORDS", String(LONG_SENTENCE_WORDS)],
		["Quickstart", "MAX_QUICKSTART_COMMANDS", String(MAX_QUICKSTART_COMMANDS)],
		[
			"Links",
			"POINTS_LOST_PER_BROKEN_LINK",
			String(POINTS_LOST_PER_BROKEN_LINK),
		],
		[
			"Tagline",
			"TAGLINE_POINTS_BY_DISTINCT",
			TAGLINE_POINTS_BY_DISTINCT.join(", "),
		],
		["Website", "WEBSITE_PITCH_MIN_OVERLAP", String(WEBSITE_PITCH_MIN_OVERLAP)],
		["Website", "README_PITCH_WORDS", String(README_PITCH_WORDS)],
		...Object.entries(POINTS).map(([k, v]): [string, string, string] => [
			"Points",
			`POINTS.${k}`,
			String(v),
		]),
	];
	const checks: [string, string][] = [
		[
			"Sections",
			"For each section below, a heading whose text is one of its synonyms or starts with one as whole words. The heading matching the strongest synonym wins; the title does not count. A missing section's fix names the line to add it at: after the nearest section before it in the order below.",
		],
		[
			"Title near the top",
			`A # heading or <h1> within the first ${H1_WITHIN_NONEMPTY_LINES} non-empty lines, outside code.`,
		],
		[
			"Install command",
			`A command that installs the project, in a code block or inline code, within the first ${INSTALL_WITHIN_LINES} lines. curl … | sh counts only when the line names the project, so another tool's installer does not.`,
		],
		[
			"Picture of it working",
			`An image within the first ${IMAGE_WITHIN_LINES} lines that is not a badge.`,
		],
		[
			"Badges before the first code block",
			`At most ${MAX_BADGES_BEFORE_CODE} badge images (shields.io, badgen, badge.fury.io, any /badge path) above the first code block.`,
		],
		[
			"Words before the first code block",
			`At most ${MAX_PROSE_WORDS_BEFORE_CODE} words above the first code block, not counting images, HTML tags and link targets.`,
		],
		[
			"Flesch reading ease",
			`206.835 − 1.015 × words per sentence − 84.6 × syllables per word, over the prose (code, HTML, tables, images and link targets removed; a line without end punctuation ends a sentence). ${READING_EASE_FULL_MARKS} or more earns every point, ${READING_EASE_ZERO} or less none, linear in between.`,
		],
		[
			"Quickstart block",
			"The first shell block (bash, sh, console, powershell…, or a block with no language) with a command that installs the project.",
		],
		[
			"Commands in the quickstart",
			`At most ${MAX_QUICKSTART_COMMANDS}. a && b and a; b are two; comments, blank lines and output after a $ prompt are none.`,
		],
		[
			"Translations give the same commands",
			`README.<lang>.md, README-<lang>.md or README_<lang>.md next to the README or in ${codeList(TRANSLATION_FOLDERS)}: each one's quickstart must have the README's commands in the same order. ${codeList(FOLDER_COMMANDS)} lines may differ, since a translation may name its folder in its own language. Points shrink with the share that differ.`,
		],
		[
			"Relative links resolve",
			`Every [text](path), ![alt](path), [id]: path, <a href> and <img src> outside code that is a path must name a file or folder in the repository with that exact case. ${POINTS_LOST_PER_BROKEN_LINK} point off per broken link.`,
		],
		[
			"#anchors match a heading",
			"Every link to #anchor (or to the README's own file#anchor) must match a heading's GitHub anchor or an HTML id. Anchors into other files are not checked.",
		],
		[
			"One tagline everywhere",
			`The README H1, the descriptions in package.json, pyproject.toml, Cargo.toml and composer.json (and a nested package.json that is published or has a bin), the first > line of llms.txt files and the GitHub About description, compared after dropping case, punctuation, URLs and a leading "<name>:". Points by distinct wordings: ${TAGLINE_POINTS_BY_DISTINCT.join(", ")}.`,
		],
		[
			"One spelling of the name",
			"The H1's first word is the name. Other capitalisations of it in the README's prose (FLISK, FLisk for Flisk) are listed with their first line; code, link targets, URLs, paths and all-lower-case uses (the command) are left out.",
		],
		[
			"Website leads with the README's command",
			"The first <name> <subcommand> the README's quickstart runs (flisk project), against the first the website's <pre> and <code> elements show (flisk import); without one, the first command that is not an install, cd or mkdir.",
		],
		[
			"Website shows the README's install command",
			"The README's first install command against the website's, compared after dropping a $ prompt and repeated spaces.",
		],
		[
			"Website headline matches the README",
			'The website is the repository\'s homepage on GitHub, else "homepage" in package.json, or the address given with a pasted README. Its og:title, <title> and first <h1>, whole and split at |, -, —, · and :, are compared with the README H1 after the same normalising as taglines; one must equal it, or hold it whole (or be held by it) when both have three words or more.',
		],
		[
			"Website description matches the README pitch",
			`The key words of the website's meta description (or og:description), against those of the README's pitch: the H1 and the prose after it up to the first section or code block, at most ${README_PITCH_WORDS} words. Key words are three letters or more, stopwords and the project's names left out. ${Math.round(WEBSITE_PITCH_MIN_OVERLAP * 100)}% of the website's in the README earns every point, less earns a share. Only http and https on public addresses are read, ${MAX_REDIRECTS} redirects at most.`,
		],
	];
	return layout(
		base,
		{
			path: "checks",
			title: "Every check and threshold",
			description:
				`The ${checks.length + SECTION_IDS.length - 1} checks behind the README score, their points, the synonym lists for each section and every threshold, as the code defines them.`.slice(
					0,
					160,
				),
			crumbs: [{ name: "Checks", path: "checks" }],
		},
		`<div class="wrap prose"><h1>Every check and threshold</h1>
<p class="lede">Read from the code that scores, so this page and the score cannot disagree. Change a number in the source and both move.</p>
<h2>The checks</h2><div class="tbl"><table><tbody>${checks.map(([t, d]) => `<tr><th>${esc(t)}</th><td>${esc(d)}</td></tr>`).join("")}</tbody></table></div>
<h2>Thresholds and points</h2><div class="tbl"><table><thead><tr><th>Group</th><th>Constant</th><th>Value</th></tr></thead><tbody>${thresholds
			.map(
				([g, k, v]) =>
					`<tr><td>${esc(g)}</td><td><code>${esc(k)}</code></td><td>${esc(v)}</td></tr>`,
			)
			.join("")}</tbody></table></div>
<h2>Section weights by project type</h2><p>${Object.entries(WEIGHT_LABELS)
			.reverse()
			.map(([w, l]) => `${w}: ${l}`)
			.join(
				" · ",
			)}. A section's points are ${POINTS.sections} × its weight ÷ the type's total weight.</p>
<div class="tbl"><table><thead><tr><th>Section</th>${PROJECT_TYPES.map((t) => `<th>${esc(WEIGHTS[t].title)}</th>`).join("")}</tr></thead><tbody>${SECTION_IDS.map(
			(id) =>
				`<tr><td>${esc(SECTIONS[id].title)}</td>${PROJECT_TYPES.map((t) => `<td>${WEIGHTS[t].weights[id]}</td>`).join("")}</tr>`,
		).join("")}</tbody></table></div>
<h2>Synonyms</h2><div class="tbl"><table><tbody>${SECTION_IDS.map(
			(id) =>
				`<tr><th>${esc(SECTIONS[id].title)}</th><td>${codeList(SECTIONS[id].synonyms)}</td></tr>`,
		).join("")}</tbody></table></div>
<h2>Project type</h2><p>From package.json first ("bin": CLI tool; Next.js, Nuxt, SvelteKit, Remix or Astro, or a front-end framework with a server one: full-stack app; Express, Fastify, Hono, Koa or NestJS alone: backend API; "main" or "exports": library), then pyproject.toml, Cargo.toml and go.mod, then a Compose file (app). A pasted README is read for signals, such as <code>npm install -g</code> for a CLI or <code>GET /users</code> for an API; with none it is scored as a CLI tool. The result page lets you pick another.</p>
<h2>Grades</h2><p>${GRADES.map(([min, g]) => `${g}: ${min}+`).join(" · ")}</p>
<h2>Patterns</h2><h3>Install command</h3><pre>${esc(INSTALL_COMMAND.source)}</pre><h3>Badge</h3><pre>${esc(BADGE.source)}</pre>
<h3>Shell languages</h3><p>${codeList(SHELLS)}</p><h3>Infrastructure words</h3><p>Listed with their counts, not scored: ${codeList(JARGON)}.</p></div>`,
	);
}

export function aboutPage(base: string): string {
	return layout(
		base,
		{
			path: "about",
			title: "About and FAQ",
			description:
				`How ${SITE.name} works, what it reads and stores, and how to call it from code or an AI assistant. ${SITE.tagline}.`.slice(
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
<pre>claude mcp add --transport http ${SITE.id} ${esc(base)}/mcp</pre></div>`,
	);
}

export function errorPage(base: string, message: string, value = ""): string {
	const root = rootOf(base);
	return layout(
		base,
		{
			path: "404",
			title: "Could not score it",
			description: message.slice(0, 160),
			noindex: true,
		},
		`<div class="wrap prose"><h1>Could not score it</h1><p class="error" role="alert">${esc(message)}</p>${repoForm(root, value)}${pasteForm(root, true)}</div>`,
	);
}

export function notFoundPage(base: string): string {
	const root = rootOf(base);
	return layout(
		base,
		{
			path: "404",
			title: "Page not found",
			description: `This address is not a page on ${SITE.name}. A result address is a GitHub repository: /flisk-sh/flisk.`,
			noindex: true,
		},
		`<div class="wrap prose"><h1>Page not found</h1><p class="lede">A result address is a GitHub repository: <a href="${root}/flisk-sh/flisk">/flisk-sh/flisk</a>.</p>${repoForm(root)}</div>`,
	);
}

const GRADE_COLORS: Record<string, string> = {
	A: "#1f7a4d",
	B: "#3d8b37",
	C: "#a16207",
	D: "#c2410c",
	F: "#b3261e",
};

/** A shields-style badge, 140×20: "readme" and the score, colored by grade, or "unknown" in gray. */
export function badge(report: Report | null): string {
	const value = report ? `${report.score}/100 ${report.grade}` : "unknown";
	const color = report ? (GRADE_COLORS[report.grade] ?? "#555") : "#9f9f9f";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="20" role="img" aria-label="readme: ${value}"><title>readme: ${value}</title><rect width="56" height="20" fill="#555"/><rect x="56" width="84" height="20" fill="${color}"/><g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle"><text x="28" y="14">readme</text><text x="98" y="14">${value}</text></g></svg>`;
}
