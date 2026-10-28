// Everything about the product that shows up in search results, link previews, AI answers and the app's own pages.
// Edit this file first (or run `bun run rename`): titles, meta tags, JSON-LD, robots.txt, sitemap.xml, llms.txt,
// site.webmanifest and security.txt are all built from it.

export const SITE = {
	name: "README Score",
	/** Lower case, no spaces: the MCP server's name, the health check's service and the badge's label. */
	id: "readme-score",
	/** Under 60 characters: the <title> of the home page and the Product Hunt tagline. */
	tagline: "Your README, scored out of 100, with a fix for every miss",
	/** 110 to 160 characters: the meta description and the link preview text. */
	description:
		"Enter a GitHub repo or paste a README: a score out of 100, the sections found and missing, and a fix for each miss. No AI: same README, same score.",
	/** Where the site lives online, ending in a slash. PUBLIC_URL overrides it at run time. */
	url: "https://readme.flisk.si/",
	repo: "https://github.com/flisk-sh/readme-score",
	lang: "en",
	locale: "en_US",
	/** The organization or person behind it, for JSON-LD and the footer. */
	author: { name: "Flisk", url: "https://flisk.sh" },
	/** An X handle with the @, or empty. */
	twitter: "",
	/** Matches the background of the page in each color scheme. */
	themeColor: { light: "#fbfaf7", dark: "#141413" },
	/** Where to report a security problem, for /.well-known/security.txt. */
	securityContact:
		"https://github.com/flisk-sh/readme-score/security/advisories/new",
	/** Shown on /about and sent as FAQPage JSON-LD. Write the questions people type into search and AI assistants. */
	faq: [
		{
			q: "How is the README score worked out?",
			a: "From 25 checks in seven groups: the sections a reader expects for your kind of project (35 points), the first screen (20), readability (10), the quickstart (10), links (10), the tagline (5), and whether the product's website says the same as the README (10). A check with nothing to look at is left out, and the score is the points earned over the points that count. Every threshold is listed on the checks page.",
		},
		{
			q: "Is AI involved?",
			a: "No. Every check is a fixed rule: a pattern, a count or a formula. The same README always gets the same score, and every finding names the line to change.",
		},
		{
			q: "Which repositories can it read?",
			a: "Public GitHub repositories. It reads the README, the file tree, the package manifests, llms.txt files and translated READMEs at one commit, and names that commit on the result. For anything else, paste the README.",
		},
		{
			q: "How does it know what kind of project it is?",
			a: "From the files: a bin field in package.json makes a CLI tool, a web framework an app or an API, a main field a library; pyproject.toml, Cargo.toml and go.mod are read the same way. A pasted README is read for signals such as npm install -g or GET /users. You can pick another type on the result page.",
		},
		{
			q: "Is there an API or a badge?",
			a: "Yes: /api/score?repo=owner/name answers JSON, /badge/owner/name.svg is a badge with the score, and /mcp is an MCP server with one tool, score_readme, for Claude, ChatGPT, Cursor or Codex. None needs a key.",
		},
		{
			q: "What is stored?",
			a: "Nothing on disk. A repository's result is kept in memory for ten minutes, so a shared link does not ask GitHub again, then forgotten. A pasted README is scored and dropped. No cookies.",
		},
		{
			q: "Where do the checks come from?",
			a: "From the scoreboard Flisk runs on its own README on every pull request. On the same file, the first-screen, readability and tagline results here are the scoreboard's.",
		},
	],
	/** Example repositories linked from the home page; also listed in sitemap.xml. */
	examples: [
		"flisk-sh/flisk",
		"honojs/hono",
		"BurntSushi/ripgrep",
		"fastapi/fastapi",
	],
} as const;
