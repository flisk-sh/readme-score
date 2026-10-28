// Links in the README that lead nowhere. Relative links must name a file or folder that exists in the repository with
// that exact case (a link that works on a case-insensitive Mac breaks on GitHub), and #anchors must match a heading
// or an HTML id in the README. Port of Flisk's doc-links scorer, which checks paths in a checkout; here the paths come
// from the repository's file tree, and anchors are checked too.
import path from "node:path";
import { headings, htmlAnchors, type Link, linkPath, links } from "./markdown";

/** Points lost per broken link, down to zero. */
export const POINTS_LOST_PER_BROKEN_LINK = 1;

/** github.com pages a README reaches with ../../<page>: they are not files, and GitHub resolves them. */
const GITHUB_PAGES =
	/^(?:issues|pulls|pull|wiki|discussions|actions|releases|security|tree|blob|graphs|stargazers|network|forks|compare|projects|milestones|labels|tags|commits|contributors|packages|settings)(?:\/|$)/;

export interface BrokenLink extends Link {
	/** What is wrong, in a few words. */
	why: string;
	/** The nearest thing that exists, when there is one. */
	suggestion?: string;
}

/** Whether a resolved path exists in the tree, exactly; directories count, and "a/" is "a". */
export function exists(paths: Set<string>, rel: string): boolean {
	const p = path.posix.normalize(rel).replace(/\/$/, "");
	return p === "." || p === "" || paths.has(p);
}

function nearestPath(paths: Set<string>, rel: string): string | undefined {
	const lower = rel.toLowerCase();
	const sorted = [...paths].sort();
	const sameCase = sorted.find((p) => p.toLowerCase() === lower);
	if (sameCase) return sameCase;
	const base = path.posix.basename(rel).toLowerCase();
	return sorted.find((p) => path.posix.basename(p).toLowerCase() === base);
}

/** Relative links that do not resolve in the tree. `readme` is the README's path, `paths` every file and folder. */
export function brokenFileLinks(
	markdown: string,
	readme: string,
	paths: Set<string>,
): { checked: number; broken: BrokenLink[] } {
	const broken: BrokenLink[] = [];
	let checked = 0;
	for (const link of links(markdown)) {
		const p = linkPath(readme, link.target);
		if (p === null) continue;
		const outside = p === ".." || p.startsWith("../");
		if (outside) {
			// ../../issues from a README at the root is github.com/<owner>/<repo>/issues.
			const up =
				path.posix
					.dirname(readme)
					.split("/")
					.filter((s) => s !== ".").length + 2;
			const rest = link.target.replace(/^(?:\.\.\/)+/, "");
			const ups = (link.target.match(/\.\.\//g) ?? []).length;
			if (ups === up && GITHUB_PAGES.test(rest)) continue;
		}
		checked++;
		if (!outside && exists(paths, p)) continue;
		const suggestion = outside ? undefined : nearestPath(paths, p);
		broken.push({
			...link,
			why: outside ? "points outside the repository" : `${p} does not exist`,
			...(suggestion ? { suggestion } : {}),
		});
	}
	return { checked, broken };
}

/** Edit distance, for suggesting the anchor that was probably meant. */
export function distance(a: string, b: string): number {
	let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		for (let j = 1; j <= b.length; j++)
			row[j] = Math.min(
				prev[j] + 1,
				row[j - 1] + 1,
				prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
		prev = row;
	}
	return prev[b.length];
}

/**
 * #anchors in the README that match no heading and no HTML id: links to `#x`, and to `README.md#x` when that is the
 * README itself. Anchors into other files are counted in `elsewhere`, not checked.
 */
export function brokenAnchors(
	markdown: string,
	readme: string,
): { checked: number; elsewhere: number; broken: BrokenLink[] } {
	const slugs = headings(markdown).map((h) => h.slug);
	const ids = new Set([...slugs, ...htmlAnchors(markdown)]);
	const broken: BrokenLink[] = [];
	let checked = 0;
	let elsewhere = 0;
	for (const link of links(markdown)) {
		const t = link.target.trim();
		const hash = t.indexOf("#");
		if (hash < 0 || /^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith("//"))
			continue;
		const file = t.slice(0, hash).replace(/\?.*$/, "");
		if (file && linkPath(readme, file) !== path.posix.normalize(readme)) {
			elsewhere++;
			continue;
		}
		let anchor = t.slice(hash + 1);
		try {
			anchor = decodeURIComponent(anchor);
		} catch {
			// A stray % stays as written.
		}
		if (!anchor || anchor === "top" || /^L\d+(?:-L\d+)?$/.test(anchor))
			continue;
		checked++;
		const id = anchor.toLowerCase().replace(/^user-content-/, "");
		if (ids.has(id)) continue;
		const nearest = [...slugs].sort(
			(a, b) => distance(id, a) - distance(id, b),
		)[0];
		broken.push({
			...link,
			why: `#${anchor} matches no heading`,
			...(nearest ? { suggestion: `#${nearest}` } : {}),
		});
	}
	return { checked, elsewhere, broken };
}
