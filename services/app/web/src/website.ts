// Reads a product's website for the positioning checks: its home page's <head> and first <h1>. The address comes from
// the repository (its GitHub homepage or package.json "homepage") or from the person pasting a README, so it is
// guarded: http or https on the standard ports only, a host name that resolves to public addresses only (checked again
// on every redirect), at most MAX_REDIRECTS redirects, MAX_PAGE_BYTES read and TIMEOUT_MS to answer.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { readWebsite, type Website } from "./readme/website";

export const MAX_REDIRECTS = 3;
export const MAX_PAGE_BYTES = 1_000_000;
export const TIMEOUT_MS = 8_000;

export interface WebsiteOptions {
	fetch?: typeof fetch;
	/** Resolves a host name to its addresses; replaced in tests. */
	resolve?: (host: string) => Promise<string[]>;
	timeoutMs?: number;
}

/** Whether an IPv4 or IPv6 address is on the public internet: not loopback, private, link-local, CGNAT or reserved. */
export function isPublicAddress(address: string): boolean {
	const v = isIP(address);
	if (v === 4) {
		const [a, b] = address.split(".").map(Number);
		return !(
			a === 0 ||
			a === 10 ||
			a === 127 ||
			(a === 100 && b >= 64 && b <= 127) ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			(a === 198 && (b === 18 || b === 19)) ||
			a >= 224
		);
	}
	if (v === 6) {
		const x = address.toLowerCase();
		const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
		if (mapped) return isPublicAddress(mapped[1]);
		return !(
			x === "::" ||
			x === "::1" ||
			/^f[cd]/.test(x) ||
			/^fe[89ab]/.test(x) ||
			/^ff/.test(x)
		);
	}
	return false;
}

/** The website address to read, or null for one that may not be fetched. */
export function websiteUrl(input: string | null | undefined): URL | null {
	const raw = String(input ?? "").trim();
	if (!raw) return null;
	let url: URL;
	try {
		url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
	} catch {
		return null;
	}
	if (url.protocol !== "https:" && url.protocol !== "http:") return null;
	if (url.port && url.port !== "80" && url.port !== "443") return null;
	if (url.username || url.password) return null;
	const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
	if (isIP(host)) return isPublicAddress(host) ? url : null;
	if (
		!host.includes(".") ||
		/(?:^|\.)(?:localhost|local|internal|lan|home|corp|test|invalid|example)$/.test(
			host,
		)
	)
		return null;
	return url;
}

const defaultResolve = async (host: string) =>
	(await lookup(host, { all: true })).map((a) => a.address);

/** The website's positioning, or the reason it could not be read. */
export async function fetchWebsite(
	address: string,
	options: WebsiteOptions = {},
): Promise<Website | { url: string; error: string }> {
	const get = options.fetch ?? fetch;
	const resolve = options.resolve ?? defaultResolve;
	let url = websiteUrl(address);
	if (!url)
		return {
			url: address,
			error: "not an address that can be read (public http or https only)",
		};
	for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
		const host = url.hostname.replace(/^\[|\]$/g, "");
		let addresses: string[];
		try {
			addresses = isIP(host) ? [host] : await resolve(host);
		} catch {
			return { url: url.href, error: `${host} does not resolve` };
		}
		if (!addresses.length || !addresses.every(isPublicAddress))
			return { url: url.href, error: `${host} is not a public address` };
		let res: Response;
		try {
			res = await get(url.href, {
				redirect: "manual",
				headers: {
					"user-agent":
						"readme-score (+https://github.com/flisk-sh/readme-score)",
					accept: "text/html,application/xhtml+xml",
				},
				signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
			});
		} catch {
			return { url: url.href, error: "did not answer in time" };
		}
		if (res.status >= 300 && res.status < 400) {
			const next = websiteUrl(
				new URL(res.headers.get("location") ?? "", url).href,
			);
			if (!next)
				return {
					url: url.href,
					error: "redirects to an address that cannot be read",
				};
			url = next;
			continue;
		}
		if (!res.ok) return { url: url.href, error: `answered ${res.status}` };
		if (!/html/i.test(res.headers.get("content-type") ?? "text/html"))
			return { url: url.href, error: "is not an HTML page" };
		const reader = res.body?.getReader();
		if (!reader) return readWebsite("", url.href);
		let html = "";
		const decoder = new TextDecoder();
		while (html.length < MAX_PAGE_BYTES) {
			const { done, value } = await reader.read();
			if (done) break;
			html += decoder.decode(value, { stream: true });
		}
		await reader.cancel().catch(() => {});
		return readWebsite(html.slice(0, MAX_PAGE_BYTES), url.href);
	}
	return { url: url.href, error: `more than ${MAX_REDIRECTS} redirects` };
}
