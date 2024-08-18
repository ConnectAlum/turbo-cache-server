# Turborepo cache server (cloudflare worker)

This is a CloudFlare worker that implements the [TurboRepo remote cache OpenAPI spec](https://turbo.build/api/remote-cache-spec).

## Usage:
To deploy this worker, simply create a r2 bucket, and (optionally) a KV namespace (see below). Replace these values in wrangler.toml

Additionally, add a secret called `TURBO_TOKEN` to your worker, and populate it with your token.


### KV Namespace
This worker uses CloudFlare KV to implement, and keep track of tags. (see `/v8/artifacts/{hash}` and `/v8/artifacts` on the [OpenAPI spec](https://turbo.build/api/remote-cache-spec).)
However, from my testing, tags don't seem to be used, so the KV is optional. I do recommend adding a KV namespace to stay compliant with the spec, and since it's basically free.
