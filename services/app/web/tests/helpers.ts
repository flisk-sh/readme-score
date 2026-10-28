// Shared by the tests: fixture READMEs from tests/fixtures/, and a fake GitHub that answers from a map of files.
import { readFileSync } from "node:fs";

export const fixture = (name: string) =>
	readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

export interface FakeRepo {
	owner: string;
	name: string;
	description?: string | null;
	defaultBranch?: string;
	sha?: string;
	files: Record<string, string>;
	/** Folders that exist without files listed (submodules, empty folders in the tree). */
	folders?: string[];
}

/** A fetch that answers GitHub's repo, commit, tree and raw-file requests for the given repositories, and counts them. */
export function fakeGitHub(
	repos: FakeRepo[],
	status: Record<string, number> = {},
) {
	const calls: string[] = [];
	const fetch = (async (input: RequestInfo | URL) => {
		const url = String(input);
		calls.push(url);
		for (const [prefix, code] of Object.entries(status))
			if (url.startsWith(prefix))
				return new Response("{}", {
					status: code,
					headers:
						code === 403
							? {
									"x-ratelimit-remaining": "0",
									"x-ratelimit-reset": "1793232000",
								}
							: {},
				});
		for (const r of repos) {
			const sha = r.sha ?? "a".repeat(40);
			const api = `https://api.github.com/repos/${r.owner}/${r.name}`;
			const lower = url.toLowerCase();
			if (lower === api.toLowerCase())
				return Response.json({
					name: r.name,
					owner: { login: r.owner },
					default_branch: r.defaultBranch ?? "main",
					description: r.description ?? null,
				});
			if (lower.startsWith(`${api}/commits/`.toLowerCase()))
				return new Response(sha);
			if (lower.startsWith(`${api}/git/trees/`.toLowerCase())) {
				const folders = new Set(r.folders ?? []);
				for (const p of Object.keys(r.files)) {
					const parts = p.split("/");
					for (let i = 1; i < parts.length; i++)
						folders.add(parts.slice(0, i).join("/"));
				}
				return Response.json({
					truncated: false,
					tree: [
						...[...folders].map((path) => ({ path, type: "tree" })),
						...Object.keys(r.files).map((path) => ({ path, type: "blob" })),
					],
				});
			}
			// Raw files answer at the commit, and at HEAD as GitHub's raw host does.
			const raw = [sha, "HEAD"]
				.map(
					(ref) =>
						`https://raw.githubusercontent.com/${r.owner}/${r.name}/${ref}/`,
				)
				.find((prefix) => url.startsWith(prefix));
			if (raw) {
				const path = decodeURIComponent(url.slice(raw.length));
				const body = r.files[path];
				return body === undefined
					? new Response("", { status: 404 })
					: new Response(body);
			}
		}
		return new Response("{}", { status: 404 });
	}) as typeof globalThis.fetch;
	return { fetch, calls };
}

/** A small public CLI repository whose README passes every check. */
export const ROWCOUNT: FakeRepo = {
	owner: "acme",
	name: "rowcount",
	description: "rowcount: count the rows in any CSV file",
	files: {
		"README.md": fixture("cli-complete.md"),
		"package.json": JSON.stringify(
			{
				name: "rowcount",
				description: "rowcount: count the rows in any CSV file.",
				bin: { rowcount: "cli.js" },
			},
			null,
			2,
		),
		"docs/demo.gif": "GIF89a",
		"docs/roadmap.md": "# Roadmap\n",
		"examples/two-files.sh": "rowcount a.csv b.csv\n",
		"CONTRIBUTING.md": "# Contributing\n",
		LICENSE: "MIT",
	},
};
