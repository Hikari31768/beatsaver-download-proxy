# BeatSaver Vercel Proxy

A minimal Vercel external-rewrite proxy for:

- `https://r2cdn.beatsaver.com`
- `https://cdn.beatsaver.com`

No Vercel Function is used. Requests are handled as external rewrites by Vercel's routing/CDN layer.

## Routes

Assume your deployment is:

    https://your-project.vercel.app

### Default / R2

These two URLs both proxy to `r2cdn.beatsaver.com`:

    https://your-project.vercel.app/<path>
    https://your-project.vercel.app/r2/<path>

Examples:

    https://your-project.vercel.app/abcdef.zip
    https://your-project.vercel.app/r2/abcdef.zip

Upstream:

    https://r2cdn.beatsaver.com/abcdef.zip

### CDN

    https://your-project.vercel.app/cdn/<path>

Example:

    https://your-project.vercel.app/cdn/abcdef.zip

Upstream:

    https://cdn.beatsaver.com/abcdef.zip

## BetterSongSearch

For `downloadUrlOverride`, use either:

    https://your-project.vercel.app

for R2, or:

    https://your-project.vercel.app/cdn

for the regular BeatSaver CDN.

BetterSongSearch appends `/<hash>.zip` itself.

## Deploy

### GitHub + Vercel

1. Create a new GitHub repository.
2. Upload `vercel.json`.
3. Import the repository into Vercel.
4. Framework Preset: `Other`.
5. Deploy.

There is no build command and no environment variable.

### Vercel CLI

From this directory:

    vercel
    vercel --prod

## Notes

- This is a fixed-origin proxy, not an arbitrary open proxy.
- `/cdn/*` can only reach `cdn.beatsaver.com`.
- `/r2/*` and the root fallback can only reach `r2cdn.beatsaver.com`.
- Whether this is faster depends on the network route between the player, Vercel, and BeatSaver.
- Large map traffic can consume significant Vercel transfer/bandwidth.
