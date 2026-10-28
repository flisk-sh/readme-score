// Repositories as the pages, the API, the badge and MCP ask for them: read from GitHub at most once per ten minutes
// each, a few at a time, with failures remembered briefly so a missing repository is not asked for again and again.
import {
	GitHubError,
	type GitHubOptions,
	loadRepo,
	type RepoSpec,
} from "./github";
import { Slots, TtlCache } from "./guard";
import type { ReadmeInput } from "./readme/score";

/** How long a repository's files are kept: a shared link within this time does not ask GitHub again. */
export const CACHE_MS = 10 * 60 * 1000;
export const FAILURE_CACHE_MS = 2 * 60 * 1000;
/** Repositories kept in memory at once; a large one with translations is about a megabyte. */
export const CACHE_ENTRIES = 60;
/** Repositories read from GitHub at the same time. */
export const CONCURRENT_READS = 4;

export type Loaded = ReadmeInput | GitHubError;

export class RepoLoader {
	private ok = new TtlCache<ReadmeInput>(CACHE_MS, CACHE_ENTRIES);
	private failed = new TtlCache<GitHubError>(FAILURE_CACHE_MS, CACHE_ENTRIES);
	private slots = new Slots(CONCURRENT_READS);

	constructor(private readonly options: GitHubOptions = {}) {}

	private key = (s: RepoSpec) =>
		`${s.owner}/${s.name}@${s.ref ?? ""}`.toLowerCase();

	/**
	 * The repository's files or the reason they cannot be read. `allowed` is asked before GitHub is: undefined comes
	 * back when it says no (the client is over its rate limit) or when every read slot is taken.
	 */
	async get(
		spec: RepoSpec,
		allowed: () => boolean = () => true,
	): Promise<Loaded | undefined> {
		const key = this.key(spec);
		const hit = this.ok.get(key) ?? this.failed.get(key);
		if (hit) return hit;
		if (!allowed()) return undefined;
		return this.slots.run(async () => {
			try {
				const input = await loadRepo(spec, this.options);
				this.ok.set(key, input);
				return input;
			} catch (e) {
				const error =
					e instanceof GitHubError
						? e
						: new GitHubError(
								"Reading the repository failed. Try again, or paste the README.",
								503,
							);
				// Only answers that will not change soon are remembered: a missing repository, one without a README.
				if (error.status !== 503) this.failed.set(key, error);
				return error;
			}
		});
	}
}
