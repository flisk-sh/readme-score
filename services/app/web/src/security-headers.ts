// Baseline security headers for every response the Worker sends, including static assets
// that never pass through the app. Headers the app already set are kept, never duplicated.
const BASELINE: Record<string, string> = {
	"x-content-type-options": "nosniff",
	"x-frame-options": "SAMEORIGIN",
	"strict-transport-security": "max-age=31536000; includeSubDomains",
	"referrer-policy": "strict-origin-when-cross-origin",
	"permissions-policy": "camera=(), microphone=(), geolocation=()",
};

/** Copy of `response` with the baseline headers added where missing and `frame-ancestors` in the CSP. */
export function withSecurityHeaders(response: Response): Response {
	// A new Response, because the headers of fetched or asset responses can be immutable.
	const out = new Response(response.body, response);
	for (const [name, value] of Object.entries(BASELINE))
		if (!out.headers.has(name)) out.headers.set(name, value);
	const csp = out.headers.get("content-security-policy");
	if (!csp)
		out.headers.set("content-security-policy", "frame-ancestors 'self'");
	else if (!/(^|;)\s*frame-ancestors\b/i.test(csp))
		out.headers.set(
			"content-security-policy",
			`${csp}; frame-ancestors 'self'`,
		);
	return out;
}
