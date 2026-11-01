// Whether the quickstart can work on a machine that has nothing but the README: the tools it needs are named, nothing
// is left to fill in, the repository files it uses exist, the reader is told what a good run looks like, and CI runs
// on a clean machine. These are static stand-ins for "the setup commands work in a clean environment"; the README is
// not executed. Pure: the same README and file list always give the same answer.
import { type CodeBlock, lines } from "./markdown";

/** The tool a command's first word needs on the machine, by the name a README gives it. */
const RUNTIME_OF: Record<string, string> = {
	node: "node",
	npm: "node",
	npx: "node",
	pnpm: "node",
	pnpx: "node",
	yarn: "node",
	corepack: "node",
	bun: "bun",
	bunx: "bun",
	deno: "deno",
	python: "python",
	python3: "python",
	pip: "python",
	pip3: "python",
	pipx: "python",
	poetry: "python",
	conda: "python",
	cargo: "rust",
	go: "go",
	gem: "ruby",
	bundle: "ruby",
	ruby: "ruby",
	composer: "php",
	php: "php",
	dotnet: "dotnet",
	docker: "docker",
	"docker-compose": "docker",
	java: "java",
	mvn: "java",
	gradle: "java",
};
/** How a README names each tool. */
const RUNTIME_NAME: Record<string, RegExp> = {
	node: /\bnode(?:\.?js)?\b/i,
	bun: /\bbun\b/i,
	deno: /\bdeno\b/i,
	python: /\bpython\s*3?\b/i,
	rust: /\b(?:rust|cargo|rustup)\b/i,
	go: /\bgo\s*\d|\bgolang\b/i,
	ruby: /\bruby\b/i,
	php: /\bphp\b/i,
	dotnet: /\.net\b|\bdotnet\b/i,
	docker: /\bdocker\b/i,
	java: /\b(?:java|jdk|jre)\b/i,
};
const PREREQ_HEADING =
	/^#{1,6}\s*.*\b(?:prereq|requirement|before you (?:begin|start)|what you need|dependencies|system requirements)/i;
const NEEDS =
	/\b(?:requires?|required|prerequisites?|needs?|must have|you(?:'ll| will)? need|installed)\b/i;

/** Unresolved placeholders in commands: `<your-key>`, `YOUR_API_KEY`, `xxx`, a bare `...`. */
const PLACEHOLDER =
	/(?:^|[\s=/'"])(<[a-z][\w .-]*>|YOUR[_-][A-Z0-9_-]+|your[-_](?:api[-_]?)?(?:key|token|secret|password|username|name|project|repo)\b[\w-]*|x{3,}|\.\.\.)(?=$|[\s/'"])/;

export function placeholders(
	commands: string[],
): { command: string; token: string }[] {
	return commands.flatMap((command) => {
		const token = PLACEHOLDER.exec(command)?.[1];
		return token ? [{ command, token }] : [];
	});
}

/** The tools the commands need, in the order first used. */
export function runtimes(commands: string[]): string[] {
	const out: string[] = [];
	for (const c of commands) {
		const first = c.replace(/^sudo\s+/, "").split(" ")[0];
		const r = RUNTIME_OF[first];
		if (r && !out.includes(r)) out.push(r);
	}
	return out;
}

/**
 * The tools the README never names as a requirement: no line outside the quickstart that names the tool with a
 * version, with a word like "requires" or "install", or under a Prerequisites/Requirements heading.
 */
export function unnamedPrerequisites(
	markdown: string,
	block: CodeBlock,
	needed: string[],
): string[] {
	const all = lines(markdown);
	const bodyLines = block.body.split("\n").length;
	const inBlock = (i: number) =>
		i + 1 >= block.line - 1 && i + 1 <= block.line + bodyLines;
	let inPrereq = false;
	const named = new Set<string>();
	all.forEach((l, i) => {
		if (/^#{1,6}\s/.test(l)) inPrereq = PREREQ_HEADING.test(l);
		if (inBlock(i)) return;
		for (const r of needed) {
			const m = RUNTIME_NAME[r]?.exec(l);
			if (!m) continue;
			const after = l.slice(m.index + m[0].length, m.index + m[0].length + 24);
			if (inPrereq || NEEDS.test(l) || /\d/.test(after)) named.add(r);
		}
	});
	return needed.filter((r) => !named.has(r));
}

const FILE_TOKEN =
	/^(?:\.{1,2}\/)?[\w.@-]+(?:\/[\w.@-]+)*\.(?:sh|ya?ml|json|toml|txt|env|example|py|js|mjs|cjs|ts|lock|cfg|ini|mk)$|^\.\/[\w./@-]+$/;
/** What a bare command needs in the folder it runs in. */
const NEEDS_FILE: { when: RegExp; any: string[]; label: string }[] = [
	{
		when: /^(?:npm|pnpm|yarn|bun)\s+(?:ci|install|i|start|test|run\s+\S+)$/,
		any: ["package.json"],
		label: "package.json",
	},
	{
		when: /^docker[ -]compose\s+(?:up|build|pull)\b(?!.*\s-f\s)/,
		any: [
			"compose.yaml",
			"compose.yml",
			"docker-compose.yaml",
			"docker-compose.yml",
		],
		label: "a compose file",
	},
	{
		when: /^make\b/,
		any: ["Makefile", "makefile", "GNUmakefile"],
		label: "Makefile",
	},
	{
		when: /^cargo\s+(?:build|run|test)\b/,
		any: ["Cargo.toml"],
		label: "Cargo.toml",
	},
	{ when: /^go\s+(?:build|run|test)\b/, any: ["go.mod"], label: "go.mod" },
	{ when: /^bundle\s+install\b/, any: ["Gemfile"], label: "Gemfile" },
	{
		when: /^poetry\s+install\b/,
		any: ["pyproject.toml"],
		label: "pyproject.toml",
	},
];
/** Commands whose last argument is a file they make, not one they read. */
const MAKES_LAST = /^(?:cp|mv|touch|tee|install|ln)$/;

const join = (base: string, p: string) => {
	const parts = (base ? base.split("/") : []).concat(p.split("/"));
	const out: string[] = [];
	for (const s of parts) {
		if (s === "." || s === "") continue;
		if (s === "..") out.pop();
		else out.push(s);
	}
	return out.join("/");
};

/**
 * Files the quickstart uses that the repository does not have. null when it cannot tell: there is no file tree, or the
 * commands do not run inside a clone of this repository (the folder they run in is unknown, e.g. a new empty one).
 */
export function missingRepoFiles(
	commands: string[],
	paths: Set<string> | undefined,
	repoNames: string[],
): { command: string; file: string }[] | null {
	if (!paths) return null;
	const clone = commands.findIndex(
		(c) =>
			/^git clone\b/.test(c) &&
			repoNames.some((n) => c.toLowerCase().includes(n)),
	);
	if (clone < 0) return null;
	const args = commands[clone].split(" ").filter((a) => !a.startsWith("-"));
	const dir = (
		args[3] ??
		args[2].replace(/\/$/, "").split("/").pop() ??
		""
	).replace(/\.git$/, "");
	let cwd: string | null = null;
	const made = new Set<string>();
	const missing: { command: string; file: string }[] = [];
	const has = (f: string) => paths.has(f);
	for (const c of commands.slice(clone + 1)) {
		const [cmd, ...rest] = c.split(" ");
		if (cmd === "cd") {
			const to = (rest[0] ?? "").replace(/\/$/, "");
			if (cwd === null && to === dir) cwd = "";
			else if (cwd !== null) cwd = join(cwd, to);
			continue;
		}
		if (cwd === null) continue;
		const here: string = cwd;
		const operands = rest.filter((a) => !a.startsWith("-"));
		if (MAKES_LAST.test(cmd) && operands.length)
			made.add(join(here, operands.pop() as string));
		const need = NEEDS_FILE.find((n) => n.when.test(c));
		if (need && !need.any.some((f) => has(join(here, f))))
			missing.push({ command: c, file: need.label });
		for (const a of cmd.startsWith("./") ? [cmd, ...operands] : operands) {
			if (!FILE_TOKEN.test(a)) continue;
			const f = join(here, a);
			if (!has(f) && !made.has(f)) missing.push({ command: c, file: a });
		}
	}
	return missing;
}

const SUCCESS =
	/localhost|127\.0\.0\.1|0\.0\.0\.0|you(?:'ll| will| should) see|expected output|example output|sample output|output:|\bshould (?:print|show|return|output|display|open)|\bprints?\b|healthy|✓|✔|success|=>|→|you(?:'re| are) (?:done|ready|all set)/i;

/** How many lines after the quickstart are searched for what a good run looks like. */
export const RESULT_WITHIN_LINES = 12;

/**
 * Whether the README shows what a good run looks like: output in the block (lines under `$ ` commands, or a `# ->`
 * comment), or, within RESULT_WITHIN_LINES lines after it, a URL, output, or "you should see".
 */
export function showsResult(markdown: string, block: CodeBlock): boolean {
	const body = block.body.split("\n");
	const prompted = body.some((l) => /^\s*\$\s/.test(l));
	if (prompted && body.some((l) => l.trim() && !/^\s*\$\s/.test(l)))
		return true;
	if (
		body.some((l) =>
			/#\s*(?:->|=>|→|output|prints?|expect|you should)/i.test(l),
		)
	)
		return true;
	const after = lines(markdown)
		.slice(
			block.line + body.length,
			block.line + body.length + RESULT_WITHIN_LINES,
		)
		.join("\n");
	return SUCCESS.test(after);
}

/** Paths of a CI configuration, so the setup is built on a clean machine on every change. */
export const CI_FILES =
	/^(?:\.github\/workflows\/[^/]+\.ya?ml|\.gitlab-ci\.ya?ml|\.circleci\/config\.yml|azure-pipelines\.ya?ml|\.travis\.yml|Jenkinsfile|\.woodpecker\.ya?ml|\.drone\.yml|bitbucket-pipelines\.yml)$/;

export function hasCi(paths: Set<string> | undefined): boolean | null {
	if (!paths) return null;
	return [...paths].some((p) => CI_FILES.test(p));
}
