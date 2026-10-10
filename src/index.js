const CDN_ORIGIN = "https://cdn.beatsaver.com";
const R2_ORIGIN = "https://r2cdn.beatsaver.com";
const API_ORIGIN = "https://api.beatsaver.com";

/*
Routes:
  /api/<path> -> api.beatsaver.com
  /cdn/<path> -> cdn.beatsaver.com
  /r2/<path>  -> r2cdn.beatsaver.com
  /<path>     -> r2cdn first, then cdn fallback
*/

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function makeUpstreamHeaders(request) {
  const headers = new Headers();

  // Only forward headers useful for downloads and conditional/range requests.
  // Avoid forwarding Host/Cookie/Authorization or other client-specific data.
  const pass = [
    "accept",
    "accept-encoding",
    "user-agent",
    "range",
    "if-range",
    "if-none-match",
    "if-modified-since",
  ];

  for (const name of pass) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }

  return headers;
}

function buildTarget(origin, pathname, search) {
  const target = new URL(origin);
  target.pathname = pathname || "/";
  target.search = search || "";
  return target.toString();
}

function proxiedResponse(response, upstreamName, method) {
  const headers = new Headers(response.headers);

  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, HEAD, OPTIONS");
  headers.set(
    "access-control-expose-headers",
    "Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified"
  );
  headers.set("x-robots-tag", "noindex, nofollow");
  headers.set("x-beatsaver-proxy-upstream", upstreamName);

  return new Response(method === "HEAD" ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function fetchUpstream(request, origin, pathname, upstreamName) {
  const incoming = new URL(request.url);
  const target = buildTarget(origin, pathname, incoming.search);

  const response = await fetch(target, {
    method: request.method,
    headers: makeUpstreamHeaders(request),
    redirect: "follow",
    // ESA Fetch otherwise transparently decompresses gzip.
    // Manual mode keeps Content-Length/body semantics intact.
    decompress: "manual",
  });

  return proxiedResponse(response, upstreamName, request.method);
}

function shouldFallback(status) {
  return (
    status === 404 ||
    status === 408 ||
    status === 429 ||
    status >= 500
  );
}

async function handleRequest(request) {
  const method = request.method.toUpperCase();
  const url = new URL(request.url);

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, HEAD, OPTIONS",
        "access-control-allow-headers":
          "Range, If-Range, If-None-Match, If-Modified-Since",
        "access-control-max-age": "86400",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  }

  if (method !== "GET" && method !== "HEAD") {
    return jsonResponse(
      {
        error: "Method Not Allowed",
        allowed: ["GET", "HEAD", "OPTIONS"],
      },
      405
    );
  }

  if (url.pathname === "/" || url.pathname === "/health") {
    return jsonResponse({
      ok: true,
      service: "BeatSaver ESA Pages Proxy",
      routes: {
        api: "/api/<path> -> api.beatsaver.com",
        default: "/<hash>.zip -> r2cdn first, cdn fallback",
        r2: "/r2/<hash>.zip -> r2cdn.beatsaver.com",
        cdn: "/cdn/<hash>.zip -> cdn.beatsaver.com",
      },
      range: "Range and 206 responses are passed through",
    });
  }

  // Fixed API route, including the bare /api endpoint.
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    const pathname = url.pathname.slice(4) || "/";
    try {
      return await fetchUpstream(request, API_ORIGIN, pathname, "api");
    } catch (error) {
      return jsonResponse(
        {
          error: "Bad Gateway",
          upstream: "api.beatsaver.com",
          message: String(error?.message || error),
        },
        502
      );
    }
  }

  // Fixed CDN route.
  if (url.pathname.startsWith("/cdn/")) {
    const pathname = url.pathname.slice(4) || "/";
    try {
      return await fetchUpstream(request, CDN_ORIGIN, pathname, "cdn");
    } catch (error) {
      return jsonResponse(
        {
          error: "Bad Gateway",
          upstream: "cdn.beatsaver.com",
          message: String(error?.message || error),
        },
        502
      );
    }
  }

  // Fixed R2 route.
  if (url.pathname.startsWith("/r2/")) {
    const pathname = url.pathname.slice(3) || "/";
    try {
      return await fetchUpstream(request, R2_ORIGIN, pathname, "r2");
    } catch (error) {
      return jsonResponse(
        {
          error: "Bad Gateway",
          upstream: "r2cdn.beatsaver.com",
          message: String(error?.message || error),
        },
        502
      );
    }
  }

  // Default route: R2 first, then regular CDN.
  try {
    const r2 = await fetchUpstream(
      request,
      R2_ORIGIN,
      url.pathname,
      "r2"
    );

    if (!shouldFallback(r2.status)) {
      return r2;
    }

    // We are not returning this body, so cancel it before retrying.
    if (method !== "HEAD" && r2.body) {
      try {
        await r2.body.cancel();
      } catch (_) {}
    }
  } catch (_) {
    // Network failure: proceed to the fallback CDN.
  }

  try {
    return await fetchUpstream(
      request,
      CDN_ORIGIN,
      url.pathname,
      "cdn-fallback"
    );
  } catch (error) {
    return jsonResponse(
      {
        error: "Bad Gateway",
        upstream: "both",
        message: String(error?.message || error),
      },
      502
    );
  }
}

export default {
  async fetch(request) {
    return handleRequest(request);
  },
};
