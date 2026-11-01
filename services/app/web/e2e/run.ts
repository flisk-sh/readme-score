// End to end: the README's own commands against a real process. Starts the server exactly as `bun run dev` does (on a
// free port, with no settings), then asks it for pages, the API, a pasted README, the MCP tool and the CLI. Nothing
// reaches GitHub: only a pasted README and this repository's folder are scored, so it runs offline and in CI.
//   cd services/app/web && bun run e2e
import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";

const web = fileURLToPath(new URL("..", import.meta.url));
const root = fileURLToPath(new URL("../../../..", import.meta.url));
const port = 4100 + Math.floor(Math.random() * 800);
const base = `http://localhost:${port}`;
const README = "# slugkit\n\nTurn titles into slugs.\n";

const server = Bun.spawn(["bun", "src/index.ts"], {
	cwd: web,
	env: { ...process.env, PORT: String(port) },
	stdout: "inherit",
	stderr: "inherit",
});

let failed = 0;
async function step(name: string, run: () => Promise<void>) {
	try {
		await run();
		console.log(`ok   ${name}`);
	} catch (error) {
		failed++;
		console.log(`FAIL ${name}\n     ${(error as Error).message}`);
	}
}

async function waitForHealth() {
	for (let i = 0; i < 50; i++) {
		try {
			if ((await fetch(`${base}/health`)).ok) return;
		} catch {}
		await Bun.sleep(200);
	}
	throw new Error(`the server did not answer on ${base}/health`);
}

const post = (path: string, body: unknown) =>
	fetch(`${base}${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

try {
	await waitForHealth();

	await step("GET /health", async () => {
		assert.deepEqual(await (await fetch(`${base}/health`)).json(), {
			status: "ok",
			service: "readme-score",
		});
	});

	await step("home page, /checks and the SEO files", async () => {
		const home = await fetch(`${base}/`);
		assert.equal(home.status, 200);
		assert.match(await home.text(), /application\/ld\+json/);
		assert.equal((await fetch(`${base}/checks`)).status, 200);
		assert.match(await (await fetch(`${base}/robots.txt`)).text(), /Sitemap/);
		assert.match(await (await fetch(`${base}/sitemap.xml`)).text(), /<urlset/);
	});

	await step(
		"POST /api/score scores a pasted README (the README example)",
		async () => {
			const res = await post("/api/score", { readme: README, type: "library" });
			assert.equal(res.status, 200);
			const report = (await res.json()) as { score: number; groups: unknown[] };
			assert.ok(report.score >= 0 && report.score <= 100);
			assert.ok(report.groups.length > 0);
			// Deterministic: the same README gives the same score.
			const again = (await (
				await post("/api/score", { readme: README, type: "library" })
			).json()) as { score: number };
			assert.equal(again.score, report.score);
		},
	);

	await step(
		"POST /paste shows a result page; an empty paste is refused",
		async () => {
			const ok = await fetch(`${base}/paste`, {
				method: "POST",
				body: new URLSearchParams({ readme: README, type: "library" }),
			});
			assert.equal(ok.status, 200);
			assert.match(await ok.text(), /slugkit|\/ 100|out of 100/i);
			const empty = await fetch(`${base}/paste`, {
				method: "POST",
				body: new URLSearchParams({ readme: "  " }),
			});
			assert.equal(empty.status, 400);
		},
	);

	await step(
		"GET /check rejects a bad repository and redirects a good one",
		async () => {
			assert.equal(
				(await fetch(`${base}/check?repo=not%20a%20repo`)).status,
				400,
			);
			const res = await fetch(`${base}/check?repo=honojs/hono`, {
				redirect: "manual",
			});
			assert.equal(res.status, 303);
			assert.match(res.headers.get("location") ?? "", /\/honojs\/hono$/);
		},
	);

	await step(
		"MCP: tools/list names score_readme, tools/call scores",
		async () => {
			const call = async (method: string, params?: unknown) =>
				(await (
					await fetch(`${base}/mcp`, {
						method: "POST",
						headers: {
							"content-type": "application/json",
							accept: "application/json, text/event-stream",
						},
						body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
					})
				).json()) as {
					result?: { tools?: { name: string }[] };
					error?: unknown;
				};
			const list = await call("tools/list");
			assert.ok(list.result?.tools?.some((t) => t.name === "score_readme"));
			const scored = await call("tools/call", {
				name: "score_readme",
				arguments: { readme: README, type: "library" },
			});
			assert.ok(scored.result, JSON.stringify(scored));
			assert.equal((await fetch(`${base}/mcp`)).status, 405);
		},
	);

	await step(
		"CLI scores this repository's README and gates on --min-score",
		async () => {
			const run = (...args: string[]) =>
				Bun.spawnSync(
					[
						"bun",
						"packages/readme-score/src/bin.ts",
						".",
						"--no-website",
						...args,
					],
					{ cwd: root },
				);
			const pass = run("--min-score", "90");
			assert.equal(
				pass.exitCode,
				0,
				pass.stdout.toString() + pass.stderr.toString(),
			);
			assert.match(pass.stdout.toString(), /\/100/);
			assert.equal(run("--min-score", "101").exitCode, 2);
			const folder = Bun.spawnSync(
				[
					"bun",
					"packages/readme-score/src/bin.ts",
					"services/app/web",
					"--no-website",
				],
				{ cwd: root },
			);
			assert.equal(folder.exitCode, 2);
			assert.match(
				folder.stderr.toString() + folder.stdout.toString(),
				/No README/,
			);
		},
	);
} finally {
	server.kill();
}

if (failed) {
	console.log(`\n${failed} failed`);
	process.exit(1);
}
console.log("\nall passed");
