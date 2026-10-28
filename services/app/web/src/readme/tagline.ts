// How many different one-line descriptions a project shows: the README H1, the package manifests' descriptions, the
// `> ` summary of llms.txt files and the GitHub About box. Someone who meets the project on GitHub, on a package
// registry and through an AI assistant should read one description, not three. Port of Flisk's tagline-consistency
// scorer, with Flisk's own files replaced by whatever manifests and llms.txt files the repository has. Taglines are
// compared after dropping case, punctuation, URLs and a leading "<name>:", "<name> —" or "<name> is".
import { firstH1 } from "./markdown";

export interface TaglineSource {
	source: string;
	text: string | null;
	/** The line the text is on in that file, when it comes from a file. */
	line?: number;
	/** The file it comes from; none for the GitHub description. */
	file?: string;
}

export interface TextFile {
	path: string;
	text: string;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Link markup, HTML, URLs, the product-name prefix, case and punctuation removed, so wording is all that differs. */
export function normalise(text: string, names: string[] = []): string {
	let t = String(text)
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/<[^>]+>/g, " ")
		.replace(/https?:\/\/\S+/g, " ")
		.trim();
	for (const name of names) {
		const lead = new RegExp(
			`^${escapeRegExp(name)}(?:\\s+cli)?(?:\\s+core)?\\s*(?::|—|–|-|\\bis\\b)\\s*`,
			"i",
		);
		t = t.replace(lead, "");
	}
	return t
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

const lineOf = (text: string, index: number) =>
	text.slice(0, index).split("\n").length;

/** The `description` of a package.json, pyproject.toml, Cargo.toml or composer.json, with its line. */
export function manifestDescription(
	file: TextFile,
): { text: string; line: number } | null {
	const name = file.path.split("/").pop() ?? "";
	if (name.endsWith(".json")) {
		try {
			const d = (JSON.parse(file.text) as { description?: unknown })
				.description;
			if (typeof d !== "string" || !d.trim()) return null;
			const at = file.text.search(/"description"\s*:/);
			return { text: d.trim(), line: at < 0 ? 1 : lineOf(file.text, at) };
		} catch {
			return null;
		}
	}
	if (name.endsWith(".toml")) {
		// The first `description = "…"` in [project], [tool.poetry] or [package].
		const section =
			/^\[(?:project|tool\.poetry|package)\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(
				file.text,
			);
		if (!section) return null;
		const d = /^description\s*=\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/m.exec(
			section[1],
		);
		if (!d) return null;
		return {
			text: (d[1] ?? d[2]).trim(),
			line: lineOf(file.text, section.index + section[0].indexOf(d[0])),
		};
	}
	return null;
}

/** The first `> ` line of an llms.txt file, with its line. */
export function llmsSummary(
	text: string,
): { text: string; line: number } | null {
	const m = /^>\s+(.+)$/m.exec(text);
	return m ? { text: m[1].trim(), line: lineOf(text, m.index) } : null;
}

export interface TaglineInput {
	readme: string;
	readmePath: string;
	manifests?: TextFile[];
	llms?: TextFile[];
	/** The GitHub About box; undefined when the input is not a GitHub repository. */
	githubDescription?: string | null;
}

export function taglines(input: TaglineInput): TaglineSource[] {
	const h1 = firstH1(input.readme);
	const h1Line =
		h1 === null
			? undefined
			: input.readme.split("\n").findIndex((l) => l.includes(h1)) + 1;
	const out: TaglineSource[] = [
		{
			source: `${input.readmePath} H1`,
			text: h1,
			file: input.readmePath,
			...(h1Line ? { line: h1Line } : {}),
		},
	];
	for (const m of input.manifests ?? []) {
		const d = manifestDescription(m);
		out.push({
			source: `${m.path} description`,
			text: d?.text ?? null,
			file: m.path,
			...(d ? { line: d.line } : {}),
		});
	}
	for (const f of input.llms ?? []) {
		const s = llmsSummary(f.text);
		out.push({
			source: f.path,
			text: s?.text ?? null,
			file: f.path,
			...(s ? { line: s.line } : {}),
		});
	}
	if (input.githubDescription !== undefined)
		out.push({
			source: "GitHub About description",
			text: input.githubDescription?.trim() || null,
		});
	return out;
}

/** The sources grouped by normalised wording, largest group first, ties in source order. */
export function groups(
	sources: TaglineSource[],
	names: string[] = [],
): { wording: string; sources: TaglineSource[] }[] {
	const byWording = new Map<string, TaglineSource[]>();
	for (const s of sources) {
		const w = s.text ? normalise(s.text, names) : "";
		if (!w) continue;
		byWording.set(w, [...(byWording.get(w) ?? []), s]);
	}
	return [...byWording.entries()]
		.map(([wording, list]) => ({ wording, sources: list }))
		.sort((a, b) => b.sources.length - a.sources.length);
}
