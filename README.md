# BeatSaver Download & API Proxy

A fixed-origin BeatSaver proxy for Alibaba Cloud ESA Pages and Vercel:

- `https://api.beatsaver.com`
- `https://r2cdn.beatsaver.com`
- `https://cdn.beatsaver.com`
- `https://cfcdn.beatsaver.com`

ESA uses the edge function in `src/index.js`. Vercel uses external rewrites in
`vercel.json`, with no Vercel Function required.

## Routes

Replace `https://your-proxy.example` with your ESA or Vercel deployment URL.

| Proxy path | Upstream | Notes |
| --- | --- | --- |
| `/api/<path>` | `https://api.beatsaver.com/<path>` | Removes the `/api` prefix; preserves query parameters. |
| `/r2/<path>` | `https://r2cdn.beatsaver.com/<path>` | Uses R2 directly. |
| `/cdn/<path>` | `https://cdn.beatsaver.com/<path>` | Uses the regular CDN directly. |
| `/cfcdn/<path>` | `https://cfcdn.beatsaver.com/<path>` | Uses CF CDN directly; preserves query parameters. |
| `/<path>` | `https://r2cdn.beatsaver.com/<path>` | ESA falls back to the regular CDN on network errors, 404, 408, 429, or 5xx responses. Vercel uses R2 only. |

### BeatSaver API

Use `https://your-proxy.example/api` as the API base URL:

```text
https://your-proxy.example/api/maps/id/1
    -> https://api.beatsaver.com/maps/id/1

https://your-proxy.example/api/search/text/0?q=example&sortOrder=Latest
    -> https://api.beatsaver.com/search/text/0?q=example&sortOrder=Latest
```

Both `/api` and `/api/` target `https://api.beatsaver.com/`. API requests go
directly to the API upstream and do not fall back to a download CDN. Upstream
status codes and response bodies are passed through; ESA returns 502 on an API
network failure.

This proxy is intended for public API reads. ESA supports GET, HEAD, and OPTIONS
(CORS preflight), and does not forward Cookie or Authorization headers. Vercel
external rewrites forward requests through its routing layer; the configured CORS
methods advertise GET, HEAD, and OPTIONS, but do not enforce a method restriction.
API responses retain their original URLs, including map download URLs.

See the [BeatSaver API documentation](https://api.beatsaver.com/docs).

### Downloads

```text
https://your-proxy.example/abcdef.zip
https://your-proxy.example/r2/abcdef.zip
    -> https://r2cdn.beatsaver.com/abcdef.zip

https://your-proxy.example/cdn/abcdef.zip
    -> https://cdn.beatsaver.com/abcdef.zip

https://your-proxy.example/cfcdn/abcdef.zip
    -> https://cfcdn.beatsaver.com/abcdef.zip
```

Both `/cfcdn` and `/cfcdn/` target `https://cfcdn.beatsaver.com/`. This route
does not use the default download fallback; ESA returns 502 on a network failure.

ESA preserves Range requests, conditional request headers, and upstream 206
responses. On ESA, `/` and `/health` return service information instead of
proxying a download.

## BetterSongSearch

For `downloadUrlOverride`, use:

```text
https://your-proxy.example
```

for R2 (with CDN fallback on ESA), or:

```text
https://your-proxy.example/cdn
```

for the regular BeatSaver CDN, or:

```text
https://your-proxy.example/cfcdn
```

for CF CDN. BetterSongSearch appends `/<hash>.zip` itself.
The `/api` base URL is for API clients, not `downloadUrlOverride`.

## Deploy

### Alibaba Cloud ESA Pages

1. Push this repository to GitHub and import it into ESA Pages.
2. Use the repository root as the project directory.
3. Use `esa.jsonc`, which sets the edge function entry to `./src/index.js`.
4. Leave install and build commands empty, then deploy.

No environment variables are required. After deployment, visit `/health` to
check the service and `/api/maps/id/1` to check API forwarding.

### GitHub + Vercel

1. Push this repository to GitHub and import it into Vercel.
2. Use the repository root as the project directory.
3. Set Framework Preset to `Other`.
4. Leave the build command empty and deploy.

Vercel reads `vercel.json`; no environment variables are required. See
[Vercel external rewrites](https://vercel.com/docs/routing/rewrites).

### Vercel CLI

From this directory:

```sh
vercel
vercel --prod
```

## Notes

- This is a fixed-origin proxy, not an arbitrary open proxy.
- API query parameters are preserved, and upstream API rate limits still apply.
- Responses allow cross-origin reads with `Access-Control-Allow-Origin: *`.
- Whether this is faster depends on the network route between the player, your
  deployment platform, and BeatSaver.
- Large map traffic can consume significant platform transfer/bandwidth.
