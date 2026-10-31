// A read-only MCP server over Streamable HTTP. Stateless and answered with plain JSON (no event stream), which the
// transport allows, so there is no session to keep. readmeTools() builds the tools; each one gets its arguments and
// returns text.
import { PROJECT_TYPES } from "./readme/sections";
import { SITE } from "./site";

const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const PROMPTS = [
	{
		name: "improve_my_readme",
		title: "Improve my README",
		description: "Score a README out of 100 and list the fixes, most important first.",
		arguments: [
			{
				name: "repo",
				description: "GitHub repo as owner/name, for example flisk-sh/flisk",
				required: true,
			},
		],
	},
] as const;

function getPrompt(name: string, args: Record<string, unknown> | undefined) {
	if (name !== "improve_my_readme") return null;
	const repo = typeof args?.repo === "string" ? args.repo.trim() : "";
	if (!repo) return null;
	return {
		description: "Score and improve a README.",
		messages: [
			{
				role: "user",
				content: {
					type: "text",
					text: `Score the README of ${repo} with score_readme. Show the score out of 100, then the fixes, most important first.`,
				},
			},
		],
	};
}

export interface Tool {
	definition: {
		name: string;
		title: string;
		description: string;
		inputSchema: object;
		annotations: object;
	};
	/** The text to answer, or { error } for a tool error the model should see. */
	run(args: Record<string, unknown>): Promise<string | { error: string }>;
}

/** The tools, around one function that scores a repository or a pasted README and answers the report as text. */
export function readmeTools(
	scoreText: (args: {
		repo?: string;
		readme?: string;
		type?: string;
		website?: string;
	}) => Promise<string | { error: string }>,
): Tool[] {
	return [
		{
			definition: {
				name: "score_readme",
				title: "Improve a README",
				description:
					"Scores a README out of 100 with deterministic checks (no model): the sections a reader expects for the project type, the first screen, readability, the quickstart, links, the tagline, and whether the website says the same. Answers the score, the failing checks with their line and a fix each, and a link to the full report. Give a public GitHub repository, or the README's Markdown.",
				inputSchema: {
					type: "object",
					properties: {
						repo: {
							type: "string",
							description:
								"A public GitHub repository: owner/name, or its github.com address, with /tree/<branch> for a branch",
						},
						readme: {
							type: "string",
							description:
								"The README's Markdown, when there is no public repository to read",
						},
						type: {
							type: "string",
							enum: [...PROJECT_TYPES],
							description:
								"The project type to score against; detected from the files when left out",
						},
						website: {
							type: "string",
							description:
								"With readme: the product's website, to compare its headline and description with the README's. A repository's own homepage is read without it",
						},
					},
				},
				annotations: {
					title: "Improve a README",
					readOnlyHint: true,
					openWorldHint: true,
				},
			},
			async run(args) {
				const repo = typeof args.repo === "string" ? args.repo : undefined;
				const readme =
					typeof args.readme === "string" ? args.readme : undefined;
				if (!repo && !readme)
					return { error: "Give repo (owner/name) or readme (the Markdown)." };
				return scoreText({
					...(repo ? { repo } : {}),
					...(readme ? { readme } : {}),
					...(typeof args.type === "string" ? { type: args.type } : {}),
					...(typeof args.website === "string"
						? { website: args.website }
						: {}),
				});
			},
		},
	];
}

interface JsonRpcRequest {
	jsonrpc?: string;
	id?: string | number | null;
	method?: string;
	params?: Record<string, unknown>;
}

/** Answers one JSON-RPC message (or a batch); undefined when nothing is to be sent back (notifications). */
export async function handleMcp(
	body: unknown,
	tools: Tool[],
): Promise<unknown> {
	if (Array.isArray(body)) {
		const answers = (
			await Promise.all(body.map((m) => handleOne(m as JsonRpcRequest, tools)))
		).filter((a) => a !== undefined);
		return answers.length ? answers : undefined;
	}
	return handleOne(body as JsonRpcRequest, tools);
}

async function handleOne(
	message: JsonRpcRequest,
	TOOLS: Tool[],
): Promise<unknown> {
	if (
		!message ||
		typeof message !== "object" ||
		typeof message.method !== "string"
	)
		return {
			jsonrpc: "2.0",
			id: message?.id ?? null,
			error: { code: -32600, message: "Invalid request" },
		};
	const { id, method, params = {} } = message;
	if (id === undefined || id === null) return undefined;
	const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
	switch (method) {
		case "initialize": {
			const asked = String(params.protocolVersion ?? "");
			return ok({
				protocolVersion: PROTOCOL_VERSIONS.includes(asked)
					? asked
					: PROTOCOL_VERSIONS[0],
				capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
				serverInfo: {
					name: SITE.id,
					title: SITE.name,
					version: "1.0.0",
				},
				instructions: SITE.description,
			});
		}
		case "ping":
			return ok({});
		case "tools/list":
			return ok({ tools: TOOLS.map((t) => t.definition) });
		case "prompts/list":
			return ok({ prompts: PROMPTS });
		case "prompts/get": {
			const prompt = getPrompt(
				String(params?.name ?? ""),
				params?.arguments as Record<string, unknown> | undefined,
			);
			if (!prompt)
				return {
					jsonrpc: "2.0",
					id,
					error: {
						code: -32602,
						message: `Unknown prompt or missing argument: ${String(params?.name)}`,
					},
				};
			return ok(prompt);
		}
		case "tools/call": {
			const tool = TOOLS.find((t) => t.definition.name === params.name);
			if (!tool)
				return {
					jsonrpc: "2.0",
					id,
					error: {
						code: -32602,
						message: `Unknown tool: ${String(params.name)}`,
					},
				};
			const out = await tool.run(
				(params.arguments as Record<string, unknown>) ?? {},
			);
			return typeof out === "string"
				? ok({ content: [{ type: "text", text: out }], isError: false })
				: ok({ content: [{ type: "text", text: out.error }], isError: true });
		}
		default:
			return {
				jsonrpc: "2.0",
				id,
				error: { code: -32601, message: `Method not found: ${method}` },
			};
	}
}
