// A README and its repository read from a folder on disk, as ReadmeInput the checks take: the same files
// services/app/web/src/github.ts reads from GitHub, picked the same way, so a folder and its repository score alike.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
	MAX_FILE_BYTES,
	MAX_LLMS_FILES,
	MAX_NESTED_MANIFESTS,
	MAX_TRANSLATIONS,
	README_FOLDERS,
	README_NAME,
	ROOT_MANIFESTS,
} from "../../../services/app/web/src/github";
import { translationPaths } from "../../../services/app/web/src/readme/quickstart";
import type { ReadmeInput } from "../../../services/app/web/src/readme/score";
import type { TextFile } from "../../../services/app/web/src/readme/tagline";

const SKIP = new Set([".git", "node_modules", "dist", ".flisk", ".flisk-out"]);

/** Files tracked by git; without git, a walk that leaves out dependency and build folders. */
export function listFiles(dir: string): string[] {
	try {
		return execFileSync("git", ["ls-files", "-z"], {
			cwd: dir,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			maxBuffer: 64 * 1024 * 1024,
		})
			.split("\0")
			.filter(Boolean);
	} catch {
		const out: string[] = [];
		const walk = (rel: string) => {
			for (const e of readdirSync(join(dir, rel), { withFileTypes: true })) {
				if (SKIP.has(e.name)) continue;
				const p = rel ? `${rel}/${e.name}` : e.name;
				if (e.isDirectory()) walk(p);
				else if (e.isFile()) out.push(p);
			}
		};
		walk("");
		return out;
	}
}

export interface LocalOptions {
	/** The product's website is read over the network; "off" leaves it out. */
	website?: "off";
	type?: ReadmeInput["type"];
}

export class NoReadme extends Error {}

export function loadLocal(dir: string): ReadmeInput {
	const files = listFiles(dir);
	const paths = new Set<string>();
	for (const f of files) {
		paths.add(f);
		for (let i = f.indexOf("/"); i > 0; i = f.indexOf("/", i + 1))
			paths.add(f.slice(0, i));
	}
	const read = (path: string): TextFile | null => {
		try {
			const full = join(dir, path);
			if (statSync(full).size > MAX_FILE_BYTES) return null;
			return { path, text: readFileSync(full, "utf8") };
		} catch {
			return null;
		}
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
			.sort(
				(a, b) =>
					Number(!/\.md$/i.test(a)) - Number(!/\.md$/i.test(b)) ||
					a.localeCompare(b),
			),
	)[0];
	const readme = readmePath ? read(readmePath) : null;
	if (!readmePath || !readme)
		throw new NoReadme(`No README in .github/, the root or docs/ of ${dir}.`);

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
	const pick = (list: string[]) =>
		list.map(read).filter((f): f is TextFile => f !== null);
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
		paths,
		manifests: [
			...pick(ROOT_MANIFESTS.filter((p) => paths.has(p))),
			...published,
		],
		llms: pick(llmsPaths),
		translations: pick(translations),
	};
}
