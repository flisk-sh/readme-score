// Reads a public GitHub repository for the checks: the commit, the file tree, the README, the package manifests, the
// llms.txt files and the translated READMEs, all at one commit, so a report names exactly what it scored. Three API
// calls per repository (the repo, the commit, the tree); files come from raw.githubusercontent.com, which the API rate
// limit does not count. Only those two hosts are fetched, and owner, repository and ref are checked against GitHub's
// own name rules first, so an address cannot send the server anywhere else.

import { translationPaths } from "./readme/quickstart";
import type { ReadmeInput } from "./readme/score";
import type { TextFile } from "./readme/tagline";

export const API = "https://api.github.com";
export const RAW = "https://raw.githubusercontent.com";
/** A file larger than this is not read. */
export const MAX_FILE_BYTES = 1_000_000;
export const MAX_TRANSLATIONS = 30;
/** package.json files one folder down that count (a workspace's packages), at most. */
export const MAX_NESTED_MANIFESTS = 6;
export const MAX_LLMS_FILES = 4;
/** Where GitHub looks for the README, in its order. */
export const README_FOLDERS = [".github", "", "docs"];
const README_NAME = /^readme(?:\.(md|markdown|mdown|mkdn|mkd|txt))?$/i;
const ROOT_MANIFESTS = [
	"package.json",
	"pyproject.toml",
	"Cargo.toml",
	"composer.json",
];

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const REPO = /^(?!\.\.?$)[A-Za-z0-9._-]{1,100}$/;
const REF = /^(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._/-]{1,200}(?<!\/)$/;

export interface RepoSpec {
	owner: string;
	name: string;
	ref?: string;
}

/**
 * owner/repo from what people paste: owner/repo, github.com/owner/repo, an https or git@ address, with .git, a
 * /tree/<ref> or /blob/<ref>/<file> after it. Undefined for anything else.
 */
export function parseRepo(input: string): RepoSpec | undefined {
	let s = String(input)
		.trim()
		.replace(/^git\+/, "");
	s = s.replace(/^git@github\.com:/i, "github.com/");
	s = s.replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "");
	s = s.replace(/[?#].*$/, "").replace(/\/+$/, "");
	const [owner, rawName, kind, ...rest] = s.split("/");
	const name = (rawName ?? "").replace(/\.git$/i, "");
	if (!OWNER.test(owner ?? "") || !REPO.test(name)) return undefined;
	if (kind === undefined) return { owner, name };
	if (kind !== "tree" && kind !== "blob" && kind !== "commit")
		return { owner, name };
	const ref = kind === "tree" ? rest.join("/") : rest[0];
	if (!ref) return { owner, name };
	let decoded = ref;
	try {
		decoded = decodeURIComponent(ref);
	} catch {
		return undefined;
	}
	return REF.test(decoded) ? { owner, name, ref: decoded } : undefined;
}

export const specPath = (s: RepoSpec) =>
	`${s.owner}/${s.name}${s.ref ? `/tree/${s.ref}` : ""}`;

export class GitHubError extends Error {
	constructor(
		message: string,
		/** The status the page answers with: 404 not found, 422 no README, 503 rate limit or GitHub down. */
		readonly status: 404 | 422 | 503,
		/** True when GitHub's API limit for this server is used up, so the raw files are read instead. */
		readonly rateLimited = false,
	) {
		super(message);
	}
}

export interface GitHubOptions {
	/** A token raises the limit from 60 to 5,000 API calls an hour. A fine-grained token with no permissions is enough. */
	token?: string;
	fetch?: typeof fetch;
	timeoutMs?: number;
}

/** Runs `task` on each item, at most `limit` at once, keeping the order. */
async function pool<T, R>(
	items: T[],
	limit: number,
	task: (item: T) => Promise<R>,
): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const i = next++;
			out[i] = await task(items[i]);
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, worker),
	);
	return out;
}

/**
 * The repository's files for the checks. When GitHub's API limit for this server is used up (an IP shared with other
 * hosts can spend it before this server asks), the README and manifests are read from raw.githubusercontent.com at
 * the ref instead, which that limit does not count. That read has no file tree and no About description, so the checks
 * that need them are skipped and the report says why.
 */
export async function loadRepo(
	spec: RepoSpec,
	options: GitHubOptions = {},
): Promise<ReadmeInput> {
	try {
		return await loadFromApi(spec, options);
	} catch (e) {
		if (e instanceof GitHubError && e.rateLimited)
			return loadFromRaw(spec, options);
		throw e;
	}
}

/** Where a README is looked for without a file tree, in GitHub's order of folders, the common spellings first. */
export const RAW_README_PATHS = [
	".github/README.md",
	"README.md",
	"readme.md",
	"Readme.md",
	"README.markdown",
	"README",
	"docs/README.md",
];
const RAW_EXTRAS = [...ROOT_MANIFESTS, "llms.txt", "docs/llms.txt"];

async function loadFromRaw(
	spec: RepoSpec,
	options: GitHubOptions,
): Promise<ReadmeInput> {
	const get = options.fetch ?? fetch;
	const timeout = options.timeoutMs ?? 10_000;
	const ref = spec.ref ?? "HEAD";
	const raw = async (path: string): Promise<TextFile | null> => {
		const url = `${RAW}/${spec.owner}/${spec.name}/${ref.split("/").map(encodeURIComponent).join("/")}/${path.split("/").map(encodeURIComponent).join("/")}`;
		try {
			const res = await get(url, {
				headers: {
					"user-agent":
						"readme-score (+https://github.com/flisk-sh/readme-score)",
				},
				signal: AbortSignal.timeout(timeout),
			});
			if (
				!res.ok ||
				Number(res.headers.get("content-length") ?? 0) > MAX_FILE_BYTES
			)
				return null;
			const text = await res.text();
			return text.length > MAX_FILE_BYTES ? null : { path, text };
		} catch {
			return null;
		}
	};
	let readme: TextFile | null = null;
	for (const path of RAW_README_PATHS) {
		readme = await raw(path);
		if (readme) break;
	}
	if (!readme)
		throw new GitHubError(
			`No README found for ${spec.owner}/${spec.name}${spec.ref ? ` at ${spec.ref}` : ""}, or it is not a public repository.`,
			404,
		);
	const extras = (await pool(RAW_EXTRAS, 6, raw)).filter(
		(f): f is TextFile => f !== null,
	);
	return {
		readme: readme.text,
		readmePath: readme.path,
		repo: {
			owner: spec.owner,
			name: spec.name,
			ref,
			sha: ref,
			description: null,
		},
		withoutTree: "GitHub's API limit for this server is used up",
		manifests: extras.filter((f) => ROOT_MANIFESTS.includes(f.path)),
		llms: extras.filter((f) => f.path.endsWith("llms.txt")),
	};
}

async function loadFromApi(
	spec: RepoSpec,
	options: GitHubOptions,
): Promise<ReadmeInput> {
	const get = options.fetch ?? fetch;
	const timeout = options.timeoutMs ?? 10_000;
	const headers: Record<string, string> = {
		"user-agent": "readme-score (+https://github.com/flisk-sh/readme-score)",
		"x-github-api-version": "2022-11-28",
	};
	if (options.token) headers.authorization = `Bearer ${options.token}`;

	const call = async (url: string, accept: string) => {
		let res: Response;
		try {
			res = await get(url, {
				headers: { ...headers, accept },
				signal: AbortSignal.timeout(timeout),
			});
		} catch {
			throw new GitHubError(
				"GitHub did not answer in time. Try again, or paste the README.",
				503,
			);
		}
		if (res.status === 404 || res.status === 451)
			throw new GitHubError(
				`${spec.owner}/${spec.name}${spec.ref ? ` at ${spec.ref}` : ""} is not a public GitHub repository.`,
				404,
			);
		if (res.status === 409)
			throw new GitHubError(`${spec.owner}/${spec.name} is empty.`, 422);
		if (res.status === 403 || res.status === 429) {
			const reset = Number(res.headers.get("x-ratelimit-reset"));
			const at = reset
				? ` until ${new Date(reset * 1000).toISOString().slice(11, 16)} UTC`
				: "";
			throw new GitHubError(
				`This server has used up its GitHub API calls${at}. Paste the README instead.`,
				503,
				true,
			);
		}
		if (!res.ok)
			throw new GitHubError(
				`GitHub answered ${res.status}. Try again, or paste the README.`,
				503,
			);
		return res;
	};
	const api = async <T>(path: string, accept = "application/vnd.github+json") =>
		(await (await call(`${API}${path}`, accept)).json()) as T;

	const base = `/repos/${spec.owner}/${spec.name}`;
	const repo = await api<{
		name: string;
		owner: { login: string };
		default_branch: string;
		description: string | null;
	}>(base);
	const ref = spec.ref ?? repo.default_branch;
	const sha = (
		await (
			await call(
				`${API}${base}/commits/${encodeURIComponent(ref)}`,
				"application/vnd.github.sha",
			)
		).text()
	).trim();
	if (!/^[0-9a-f]{40}$/.test(sha))
		throw new GitHubError(`GitHub sent no commit for ${ref}.`, 503);
	const tree = await api<{
		tree: { path: string; type: string }[];
		truncated: boolean;
	}>(`${base}/git/trees/${sha}?recursive=1`);
	const paths = new Set(tree.tree.map((t) => t.path));
	const files = tree.tree.filter((t) => t.type === "blob").map((t) => t.path);

	const raw = async (path: string): Promise<TextFile | null> => {
		const url = `${RAW}/${repo.owner.login}/${repo.name}/${sha}/${path.split("/").map(encodeURIComponent).join("/")}`;
		let res: Response;
		try {
			res = await get(url, {
				headers: { "user-agent": headers["user-agent"] },
				signal: AbortSignal.timeout(timeout),
			});
		} catch {
			return null;
		}
		if (
			!res.ok ||
			Number(res.headers.get("content-length") ?? 0) > MAX_FILE_BYTES
		)
			return null;
		const text = await res.text();
		return text.length > MAX_FILE_BYTES ? null : { path, text };
	};

	const readmePath = README_FOLDERS.flatMap((folder) =>
		files
			.filter((p) => {
				const slash = p.lastIndexOf("/");
				return (
					(slash < 0 ? "" : p.slice(0, slash)) === folder &&
					README_NAME.test(p.slice(slash + 1))
				);
			})
			// README.md before README.markdown before README, then by name.
			.sort(
				(a, b) =>
					Number(!/\.md$/i.test(a)) - Number(!/\.md$/i.test(b)) ||
					a.localeCompare(b),
			),
	)[0];
	if (!readmePath)
		throw new GitHubError(
			`${repo.owner.login}/${repo.name} has no README in .github/, the root or docs/.`,
			422,
		);
	const readme = await raw(readmePath);
	if (!readme)
		throw new GitHubError(
			`The README of ${repo.owner.login}/${repo.name} could not be read.`,
			503,
		);

	const nested = files
		.filter(
			(p) =>
				/^[^/]+\/package\.json$/.test(p) &&
				!/^(?:node_modules|examples?|test|tests|fixtures)\//.test(p),
		)
		.sort()
		.slice(0, MAX_NESTED_MANIFESTS);
	const llmsPaths = files
		.filter(
			(p) => /(?:^|\/)llms(?:-full)?\.txt$/.test(p) && p.split("/").length <= 4,
		)
		.sort()
		.slice(0, MAX_LLMS_FILES);
	const translations = translationPaths(files, readmePath).slice(
		0,
		MAX_TRANSLATIONS,
	);
	const wanted = [
		...ROOT_MANIFESTS.filter((p) => paths.has(p)),
		...nested,
		...llmsPaths,
		...translations,
	];
	const fetched = new Map(
		(await pool(wanted, 6, raw))
			.filter((f): f is TextFile => f !== null)
			.map((f) => [f.path, f]),
	);
	const pick = (list: string[]) =>
		list
			.map((p) => fetched.get(p))
			.filter((f): f is TextFile => f !== undefined);
	// A package one folder down counts when it is published or ships a command: a workspace's CLI does, its private
	// docs site does not.
	const published = pick(nested).filter((f) => {
		try {
			const pkg = JSON.parse(f.text) as { private?: boolean; bin?: unknown };
			return pkg.private !== true || Boolean(pkg.bin);
		} catch {
			return false;
		}
	});
	return {
		readme: readme.text,
		readmePath,
		repo: {
			owner: repo.owner.login,
			name: repo.name,
			ref,
			sha,
			description: repo.description,
		},
		paths,
		truncated: tree.truncated,
		manifests: [...pick(ROOT_MANIFESTS), ...published],
		llms: pick(llmsPaths),
		translations: pick(translations),
	};
}
