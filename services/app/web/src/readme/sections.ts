// Which of the sections a reader looks for the README has, by project type. A section is found when a heading's text,
// lower-cased and stripped of punctuation, numbering and emoji, is one of the section's synonyms or starts with one as
// whole words; "Contributing and license" is split at "and", "&" and "/" and counts for both. The lists are fixed, so
// the same headings always give the same answer.
import { type Heading, headings } from "./markdown";
import type { TextFile } from "./tagline";

export const SECTION_IDS = [
	"overview",
	"features",
	"prerequisites",
	"installation",
	"usage",
	"configuration",
	"examples",
	"troubleshooting",
	"roadmap",
	"contributing",
	"license",
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export interface SectionSpec {
	title: string;
	/** Heading texts that count, lower case, without punctuation, strongest first: "Commands" beats "Use it with…". */
	synonyms: string[];
	/** The heading a fix suggests. */
	heading: string;
	/** What the section should say, for the fix. `{name}` is the project's name. */
	body: string;
}

export const SECTIONS: Record<SectionId, SectionSpec> = {
	overview: {
		title: "Overview",
		synonyms: [
			"overview",
			"introduction",
			"intro",
			"about",
			"what is",
			"whats",
			"what it does",
			"description",
			"summary",
			"background",
			"motivation",
		],
		heading: "## What is {name}?",
		body: "Two or three sentences: what {name} does, who it is for, and what it replaces.",
	},
	features: {
		title: "Key features",
		synonyms: [
			"features",
			"key features",
			"main features",
			"feature list",
			"highlights",
			"why",
			"what you get",
			"capabilities",
			"benefits",
			"whats included",
		],
		heading: "## Key features",
		body: "A short list: each feature in one line, with what it saves the reader.",
	},
	prerequisites: {
		title: "Prerequisites",
		synonyms: [
			"prerequisites",
			"prerequisite",
			"pre requisites",
			"requirements",
			"system requirements",
			"dependencies",
			"before you begin",
			"before you start",
			"what you need",
			"you will need",
			"youll need",
			"supported platforms",
			"compatibility",
		],
		heading: "## Prerequisites",
		body: "What to install first, with versions (Node.js 22+, Docker), and a command that checks each one.",
	},
	installation: {
		title: "Installation",
		synonyms: [
			"installation",
			"install",
			"installing",
			"setup",
			"set up",
			"setting up",
			"getting started",
			"get started",
			"quick start",
			"quickstart",
			"download",
			"downloads",
		],
		heading: "## Installation",
		body: "One shell block with the install command, and how to check it worked.",
	},
	usage: {
		title: "Usage or commands",
		synonyms: [
			"usage",
			"commands",
			"command reference",
			"command line",
			"cli",
			"api",
			"reference",
			"endpoints",
			"routes",
			"how to use",
			"using",
			"use",
			"flags",
			"running",
			"run",
		],
		heading: "## Usage",
		body: "The commands or calls people use most, each with a one-line example and what it prints.",
	},
	configuration: {
		title: "Configuration",
		synonyms: [
			"configuration",
			"config",
			"configuring",
			"configure",
			"settings",
			"options",
			"environment variables",
			"environment",
			"env",
			"env vars",
			"customization",
			"customisation",
			"customizing",
			"customising",
		],
		heading: "## Configuration",
		body: "Every setting in a table: name, default, what it changes. Environment variables and config files both.",
	},
	examples: {
		title: "Examples",
		synonyms: [
			"examples",
			"example",
			"demo",
			"demos",
			"samples",
			"sample",
			"recipes",
			"tutorial",
			"tutorials",
			"cookbook",
			"showcase",
			"use cases",
		],
		heading: "## Examples",
		body: "Two or three complete examples a reader can copy and run, or links to them.",
	},
	troubleshooting: {
		title: "Troubleshooting",
		synonyms: [
			"troubleshooting",
			"troubleshoot",
			"faq",
			"faqs",
			"frequently asked questions",
			"common issues",
			"common problems",
			"known issues",
			"debugging",
			"getting help",
			"help",
			"problems",
		],
		heading: "## Troubleshooting",
		body: "The three errors people hit most, each with the message they see and the fix.",
	},
	roadmap: {
		title: "Roadmap",
		synonyms: [
			"roadmap",
			"road map",
			"plans",
			"future plans",
			"whats next",
			"todo",
			"to do",
			"upcoming",
			"milestones",
		],
		heading: "## Roadmap",
		body: "What is planned next and what is out of scope, or a link to the issues or project board that tracks it.",
	},
	contributing: {
		title: "Contributing",
		synonyms: [
			"contributing",
			"contribute",
			"contribution",
			"contributions",
			"how to contribute",
			"development",
			"developing",
			"local development",
			"hacking",
			"building from source",
			"build from source",
		],
		heading: "## Contributing",
		body: "How to run the tests and open a pull request, or a link to CONTRIBUTING.md.",
	},
	license: {
		title: "License",
		synonyms: ["license", "licence", "licensing", "copyright"],
		heading: "## License",
		body: "The license's name and a link to the LICENSE file.",
	},
};

export const PROJECT_TYPES = ["cli", "library", "app", "api"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

/** 3: required, 2: recommended, 1: nice to have. A section's share of the points is its weight over the type's total. */
export const WEIGHTS: Record<
	ProjectType,
	{
		title: string /** The title inside a sentence: "a CLI tool", "a library". */;
		noun: string;
		weights: Record<SectionId, number>;
	}
> = {
	cli: {
		title: "CLI tool",
		noun: "CLI tool",
		weights: {
			overview: 2,
			features: 2,
			prerequisites: 2,
			installation: 3,
			usage: 3,
			configuration: 2,
			examples: 2,
			troubleshooting: 1,
			roadmap: 1,
			contributing: 2,
			license: 3,
		},
	},
	library: {
		title: "Library",
		noun: "library",
		weights: {
			overview: 2,
			features: 2,
			prerequisites: 1,
			installation: 3,
			usage: 3,
			configuration: 1,
			examples: 3,
			troubleshooting: 1,
			roadmap: 1,
			contributing: 2,
			license: 3,
		},
	},
	app: {
		title: "Full-stack app",
		noun: "full-stack app",
		weights: {
			overview: 3,
			features: 2,
			prerequisites: 3,
			installation: 3,
			usage: 2,
			configuration: 3,
			examples: 1,
			troubleshooting: 2,
			roadmap: 1,
			contributing: 2,
			license: 3,
		},
	},
	api: {
		title: "Backend API",
		noun: "backend API",
		weights: {
			overview: 2,
			features: 1,
			prerequisites: 3,
			installation: 3,
			usage: 3,
			configuration: 3,
			examples: 2,
			troubleshooting: 2,
			roadmap: 1,
			contributing: 2,
			license: 3,
		},
	},
};

export const WEIGHT_LABELS: Record<number, string> = {
	3: "required",
	2: "recommended",
	1: "nice to have",
};

/** A heading's text as the synonyms are written: lower case, numbering, apostrophes, emoji and punctuation gone. */
export const normaliseHeading = (text: string) =>
	text
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[^\p{L}\p{N}&/]+/gu, " ")
		.replace(/^\s*(?:\d+\s+)+/, "")
		.trim();

/** The parts of a heading that can each name a section: "Contributing and license" is two. */
export const headingParts = (text: string) =>
	normaliseHeading(text)
		.split(/\s+(?:and|&)\s+|\s*[&/]\s*/)
		.map((p) => p.replace(/[&/]/g, " ").replace(/\s+/g, " ").trim())
		.filter(Boolean);

const matches = (heading: string, synonym: string) =>
	headingParts(heading).some(
		(part) => part === synonym || part.startsWith(`${synonym} `),
	);

/** The synonym of a section that a heading matches, the strongest one, or undefined. */
export function matchSynonym(
	heading: string,
	synonyms: string[],
): string | undefined {
	return synonyms.find((s) => matches(heading, s));
}

/** The heading that best names a section: the one matching the strongest synonym, the earliest on a tie. */
export function bestHeading(
	candidates: Heading[],
	synonyms: string[],
): (Heading & { synonym: string }) | null {
	for (const synonym of synonyms) {
		const h = candidates.find((x) => matches(x.text, synonym));
		if (h) return { ...h, synonym };
	}
	return null;
}

export interface SectionResult {
	id: SectionId;
	title: string;
	weight: number;
	found: (Heading & { synonym: string }) | null;
	/** Where to add it when it is missing: the line to insert before, and what is there. */
	insertAt?: { line: number; before: string | null };
}

/** The lines each heading's section spans: from the heading to the line before the next heading of its level or above. */
function sectionEnd(all: Heading[], i: number, lineCount: number): number {
	const h = all[i];
	const next = all.slice(i + 1).find((x) => x.level <= h.level);
	return next ? next.line - 1 : lineCount;
}

export function sections(markdown: string, type: ProjectType): SectionResult[] {
	const all = headings(markdown);
	// Lines in the file, not counting the empty one after a final newline.
	const lineCount = markdown.replace(/\n+$/, "").split("\n").length;
	// The title is not a section.
	const firstH1 = all.findIndex((h) => h.level === 1);
	const candidates = all.filter((_, i) => i !== firstH1);
	const results: SectionResult[] = SECTION_IDS.map((id) => ({
		id,
		title: SECTIONS[id].title,
		weight: WEIGHTS[type].weights[id],
		found: bestHeading(candidates, SECTIONS[id].synonyms),
	}));
	// A missing section goes after the nearest section before it in SECTION_IDS order that the README has, or before
	// the first heading after the title when there is none.
	const firstSection = candidates[0];
	for (const [i, r] of results.entries()) {
		if (r.found) continue;
		const before = results
			.slice(0, i)
			.reverse()
			.find((x) => x.found);
		if (before?.found) {
			const at = all.findIndex((h) => h.line === before.found?.line);
			const end = sectionEnd(all, at, lineCount);
			const next = all.find((h) => h.line === end + 1);
			r.insertAt = { line: end + 1, before: next ? next.text : null };
		} else
			r.insertAt = firstSection
				? { line: firstSection.line, before: firstSection.text }
				: { line: lineCount + 1, before: null };
	}
	return results;
}

export interface TypeGuess {
	type: ProjectType;
	reason: string;
}

const FRONTEND =
	/^(?:react|react-dom|next|vue|nuxt|svelte|@sveltejs\/kit|solid-js|@solidjs\/start|astro|@angular\/core|@remix-run\/react|@tanstack\/react-start|preact|qwik|@builder\.io\/qwik)$/;
const FULLSTACK =
	/^(?:next|nuxt|@sveltejs\/kit|@remix-run\/react|@solidjs\/start|@tanstack\/react-start|astro)$/;
const BACKEND =
	/^(?:express|fastify|hono|koa|@nestjs\/core|@hapi\/hapi|elysia|restify|@trpc\/server|apollo-server|@apollo\/server|graphql-yoga|h3|nitropack|@adonisjs\/core|sails|loopback)$/;
const PY_WEB_API =
	/^(?:fastapi|flask|starlette|litestar|sanic|aiohttp|falcon|bottle|tornado|quart)\b/m;
const PY_WEB_APP = /^(?:django|reflex|streamlit|gradio|dash|nicegui)\b/m;
const RUST_WEB = /^(?:axum|actix-web|rocket|warp|poem|tide|salvo)\s*=/m;

function packageJsonType(file: TextFile): TypeGuess | null {
	let pkg: {
		bin?: unknown;
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
		main?: unknown;
		exports?: unknown;
		module?: unknown;
		types?: unknown;
		private?: boolean;
	};
	try {
		pkg = JSON.parse(file.text);
	} catch {
		return null;
	}
	if (pkg.bin) return { type: "cli", reason: `${file.path} has a "bin" field` };
	const deps = Object.keys({
		...pkg.dependencies,
		...pkg.devDependencies,
	}).sort();
	const runtime = Object.keys(pkg.dependencies ?? {}).sort();
	const front = deps.find((d) => FRONTEND.test(d));
	const full = deps.find((d) => FULLSTACK.test(d));
	const back = runtime.find((d) => BACKEND.test(d));
	if (full) return { type: "app", reason: `${file.path} depends on ${full}` };
	if (front && back)
		return {
			type: "app",
			reason: `${file.path} depends on ${front} and ${back}`,
		};
	if (back) return { type: "api", reason: `${file.path} depends on ${back}` };
	if (pkg.main || pkg.exports || pkg.module || pkg.types)
		return { type: "library", reason: `${file.path} has "main" or "exports"` };
	if (front) return { type: "app", reason: `${file.path} depends on ${front}` };
	return null;
}

function tomlType(file: TextFile, paths: Set<string>): TypeGuess | null {
	const t = file.text;
	if (file.path === "pyproject.toml") {
		if (
			/^\[(?:project\.scripts|tool\.poetry\.scripts|project\.gui-scripts)\]/m.test(
				t,
			)
		)
			return { type: "cli", reason: "pyproject.toml has [project.scripts]" };
		const deps = t.replace(/["'\s,[\]]+/g, "\n");
		const app = PY_WEB_APP.exec(deps);
		if (app)
			return { type: "app", reason: `pyproject.toml depends on ${app[0]}` };
		const api = PY_WEB_API.exec(deps);
		if (api)
			return { type: "api", reason: `pyproject.toml depends on ${api[0]}` };
		return { type: "library", reason: "pyproject.toml has no scripts" };
	}
	if (file.path === "Cargo.toml") {
		const web = RUST_WEB.exec(t);
		if (web)
			return {
				type: "api",
				reason: `Cargo.toml depends on ${web[0].replace(/\s*=$/, "")}`,
			};
		if (/^\[\[bin\]\]/m.test(t) || paths.has("src/main.rs"))
			return { type: "cli", reason: "Cargo.toml builds a binary" };
		return { type: "library", reason: "Cargo.toml builds a library" };
	}
	return null;
}

/**
 * The project type from its files: package.json ("bin" is a CLI, a web framework an app or an API, "main" a library),
 * pyproject.toml, Cargo.toml and go.mod. The root manifest decides; a package.json one folder down is asked when the
 * root has no answer (a workspace root). Null when nothing says.
 */
export function typeFromFiles(
	manifests: TextFile[],
	paths: Set<string>,
): TypeGuess | null {
	const byDepth = [...manifests].sort(
		(a, b) =>
			a.path.split("/").length - b.path.split("/").length ||
			a.path.localeCompare(b.path),
	);
	for (const file of byDepth) {
		const guess = file.path.endsWith("package.json")
			? packageJsonType(file)
			: tomlType(file, paths);
		if (guess) return guess;
	}
	if (paths.has("go.mod"))
		return [...paths].some(
			(p) => p === "main.go" || /^cmd\/[^/]+\/main\.go$/.test(p),
		)
			? { type: "cli", reason: "go.mod and a main package" }
			: { type: "library", reason: "go.mod without a main package" };
	if (
		paths.has("docker-compose.yml") ||
		paths.has("compose.yaml") ||
		paths.has("docker-compose.yaml")
	)
		return { type: "app", reason: "a Compose file at the root" };
	return null;
}

/** Signals in the README itself, for a pasted README: each pattern found adds one to its type. */
export const README_SIGNALS: Record<ProjectType, RegExp[]> = {
	cli: [
		/\bnpm\s+(?:install|i)\s+(?:-g|--global)\b/,
		/\b(?:brew|pipx|cargo|go)\s+install\b/,
		/\buv\s+tool\s+install\b/,
		/^\s*(?:\$\s+)?[a-z][\w-]*\s+--help\b/m,
		/##+\s*(?:commands|cli)\b/i,
	],
	library: [
		/^\s*import\s.+\sfrom\s+["'][^"'.][^"']*["']/m,
		/\brequire\(\s*["'][^"'.][^"']*["']\s*\)/,
		/^\s*(?:from\s+\S+\s+)?import\s+\w+/m,
		/##+\s*api\b/i,
	],
	app: [
		/\bdocker[\s-]compose\s+up\b/,
		/\blocalhost:(?:3000|5173|8080|4200|8000)\b/,
		/\b(?:npm|pnpm|yarn|bun)\s+run\s+dev\b/,
		/\.env\.example\b/,
	],
	api: [
		/\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[\w/{}:-]*/,
		/\bcurl\s[^\n]*localhost:\d+\/api\b/,
		/##+\s*(?:endpoints|routes|api reference)\b/i,
		/\bopenapi\b|\bswagger\b/i,
	],
};

/** The type a README reads as, by README_SIGNALS; ties go to the earlier type in PROJECT_TYPES, none to "cli". */
export function typeFromReadme(markdown: string): TypeGuess {
	const counts = PROJECT_TYPES.map(
		(t) => README_SIGNALS[t].filter((re) => re.test(markdown)).length,
	);
	const best = counts.indexOf(Math.max(...counts));
	if (counts[best] === 0)
		return { type: "cli", reason: "nothing in the README says otherwise" };
	const type = PROJECT_TYPES[best];
	return {
		type,
		reason: `the README reads like a ${WEIGHTS[type].noun} (${counts[best]} of ${README_SIGNALS[type].length} signals)`,
	};
}

export const isProjectType = (v: unknown): v is ProjectType =>
	typeof v === "string" && (PROJECT_TYPES as readonly string[]).includes(v);
