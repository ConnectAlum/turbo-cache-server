import { AutoRouter, error, IRequest } from "itty-router";

const router = AutoRouter<IRequest, [Environment, ExecutionContext]>();
const apiVer = "v8";

export type Environment = {
	TURBO_CACHE_BUCKET: R2Bucket;
	TURBO_CACHE_KV?: KVNamespace;
	TURBO_TOKEN: string;
}

const auth = (req: IRequest, env: Environment) => {
	let tokenHeader = req.headers.get("Authorization");
	if (Array.isArray(tokenHeader)) {
		tokenHeader = tokenHeader.join();
	}
	if (!tokenHeader) {
		return error(401, "Unauthorized");
	}
	const token = tokenHeader.replace("Bearer ", "");
	if (token !== env.TURBO_TOKEN) {
		return error(401, "Unauthorized");
	}
}

router
			.all("*", auth)
			.get("/", (req, env, ctx) => {
				return "Hello, World!";
			})
			.post(`/${apiVer}/artifacts/events`, () => "OK") // don't care, no-op
			.get(`/${apiVer}/artifacts/events`, () => {
				return {
					status: "enabled"
				}
			}) // don't care, no-op
			.put(`/${apiVer}/artifacts/:hash`, async (request, env, ctx) => {
				try {

					// Uploads a cache artifact identified by the hash specified on the path. The cache artifact can then be downloaded with the provided hash.
					// application/octet-stream
					const hash = request.params.hash;
					const teamId = request.query.teamId ?? request.query.team ?? request.query.slug;
					if (!teamId) {
						return new Response("teamId is required", { status: 400 });
					}
					const path = `${teamId}/${hash}`;
					const artifactTag = request.headers.get("x-artifact-tag");
					console.log(`Uploading artifact to ${path} (tag: ${artifactTag})`);
					const bucket = env.TURBO_CACHE_BUCKET;
					const obj = await bucket.put(path, request.body);
					console.log(`Uploaded artifact to ${path}`);
					console.log(obj);
					if (artifactTag && env.TURBO_CACHE_KV) {
						await env.TURBO_CACHE_KV.put(path, artifactTag);
					}
					return { urls: [path] };
				} catch (e) {
					console.error(e);
					return new Response("Error", { status: 500 });
				}
			})
			.get(`/${apiVer}/artifacts/:hash`, async (request, env, ctx) => {
				// Downloads a cache artifact indentified by its hash specified on the request path. The artifact is downloaded as an octet-stream. The client should verify the content-length header and response body.
				const hash = request.params.hash;
				const teamId = request.query.teamId ?? request.query.team ?? request.query.slug;
				if (!teamId) {
					return new Response("teamId is required", { status: 400 });
				}
				const path = `${teamId}/${hash}`;
				console.log(`Downloading artifact from ${path}`);
				const bucket = env.TURBO_CACHE_BUCKET;
				const artifact = await bucket.get(path);
				if (!artifact) {
					return new Response("Not found", { status: 404 });
				}
				const headers = new Headers();
				artifact.writeHttpMetadata(headers);
				headers.set("etag", artifact.httpEtag);
				return new Response(artifact.body, { headers })
			})
			.head(`/${apiVer}/artifacts/:hash`, async (request, env, ctx) => {
				// Check that a cache artifact with the given hash exists. This request returns response headers only and is equivalent to a GET request to this endpoint where the response contains no body.
				const hash = request.params.hash;
				const teamId = request.query.teamId ?? request.query.team ?? request.query.slug;
				if (!teamId) {
					return new Response("teamId is required", { status: 400 });
				}
				const path = `${teamId}/${hash}`;
				console.log(`Checking artifact exists at ${path}`);
				const bucket = env.TURBO_CACHE_BUCKET;
				const artifact = await bucket.get(path);
				if (!artifact) {
					return new Response("Not found", { status: 404 });
				}
				const headers = new Headers();
				artifact.writeHttpMetadata(headers);
				headers.set("etag", artifact.httpEtag);
				return new Response("Found", { headers })
			})
			.post(`/${apiVer}/artifacts`, async (request, env, ctx) => {
				// Query information about an array of artifacts.
				const teamId = request.query.teamId ?? request.query.team ?? request.query.slug;
				if (!teamId) {
					return new Response("teamId is required", { status: 400 });
				}
				type Query = { hashes: string[] }
				type ResponseType = {
					[hash: string]: {
						size: number,
						taskDurationMs: number,
						tag: string
					}
				}
				const query = await request.json<Query>();
				console.log(`Querying artifacts ${query.hashes}`);
				const bucket = env.TURBO_CACHE_BUCKET;
				const promises = query.hashes.map(async hash => {
					const path = `${teamId}/${hash}`;
					const artifact = await bucket.get(path);
					if (!artifact) {
						return null;
					}
					const tag = env.TURBO_CACHE_KV ? await env.TURBO_CACHE_KV.get(path) : undefined;
					return {
						size: artifact.size,
						taskDurationMs: 0,
						tag: tag ?? "",
					}
				});
				const responses = await Promise.all(promises);
				const response: ResponseType = {};
				query.hashes.forEach((hash, index) => {
					if (responses[index]) {
						response[hash] = responses[index];
					}
				});
				return response;
			})


export default router;
