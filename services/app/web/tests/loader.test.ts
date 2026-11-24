import { expect, it } from "bun:test";
import { RepoLoader } from "../src/loader";
import { fakeGitHub } from "./helpers";

it("caches case-sensitive Git refs separately", async () => {
	const repo = { owner: "acme", name: "widget" };
	const upperSha = "a".repeat(40);
	const lowerSha = "b".repeat(40);
	const upper = fakeGitHub([
		{ ...repo, sha: upperSha, files: { "README.md": "# Upper\n" } },
	]);
	const lower = fakeGitHub([
		{ ...repo, sha: lowerSha, files: { "README.md": "# Lower\n" } },
	]);
	const mockFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
		const parts = new URL(String(input)).pathname.split("/");
		if (parts.at(-1) === "release%2Fv2" || parts.includes(lowerSha))
			return lower.fetch(input, init);
		return upper.fetch(input, init);
	}) as typeof globalThis.fetch;
	const loader = new RepoLoader({ fetch: mockFetch, website: false });

	const first = await loader.get({ ...repo, ref: "Release/v2" });
	expect(first).toMatchObject({ readme: "# Upper\n", repo: { sha: upperSha } });
	expect(await loader.get({ ...repo, ref: "release/v2" })).toMatchObject({
		readme: "# Lower\n",
		repo: { sha: lowerSha },
	});
	expect(
		await loader.get({ owner: "ACME", name: "Widget", ref: "Release/v2" }),
	).toBe(first);
});
