import {
  getProxyHeaders,
  getAfterResponseHeaders,
  getBlacklistedHeaders,
} from '@/utils/headers';
import { specificProxyRequest } from '@/utils/proxy';

/**
 * Rewrites relative and absolute URLs in M3U8 manifest to go through the proxy.
 */
function rewriteM3U8(content: string, baseUrl: string, proxyUrl: string): string {
  const lines = content.split('\n');
  const rewrittenLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // Handle URI attributes in tags (Keys, Maps, etc)
    const uriMatch = line.match(/(URI=["'])([^"']+)(["'])/);
    if (uriMatch) {
      const originalUri = uriMatch[2];
      const absoluteUri = new URL(originalUri, baseUrl).href;
      const proxiedUri = `${proxyUrl}/?destination=${encodeURIComponent(absoluteUri)}`;
      return line.replace(uriMatch[0], `${uriMatch[1]}${proxiedUri}${uriMatch[3]}`);
    }

    // Handle segment/playlist URLs (lines not starting with #)
    if (!trimmed.startsWith('#')) {
      const absoluteUri = new URL(trimmed, baseUrl).href;
      return `${proxyUrl}/?destination=${encodeURIComponent(absoluteUri)}`;
    }

    return line;
  });
  return rewrittenLines.join('\n');
}

export default defineEventHandler(async (event) => {
  // handle cors
  if (isPreflightRequest(event)) return handleCors(event, {});

  const query = getQuery(event);
  let destination = (query.destination || query.url) as string;

  // Handle catch-all for relative paths (if destination is missing)
  if (!destination) {
    const referer = getHeader(event, 'referer');
    if (referer && referer.includes('destination=')) {
      try {
        const refererUrl = new URL(referer);
        const prevDest = refererUrl.searchParams.get('destination') || refererUrl.searchParams.get('url');
        if (prevDest) {
          const base = new URL(prevDest);
          destination = new URL(event.path, base.origin + base.pathname).href;
        }
      } catch (e) {
        // ignore
      }
    }
  }

  if (!destination) {
    return {
      message: `Proxy is working (v${useRuntimeConfig(event).version})`,
      usage: '/?destination=<url> or /?url=<url>',
    };
  }

  const proxyUrl = `${getRequestProtocol(event)}://${getRequestHost(event)}`;

  try {
    return await specificProxyRequest(event, destination, {
      blacklistedHeaders: getBlacklistedHeaders(),
      fetchOptions: {
        redirect: 'follow',
        headers: getProxyHeaders(event.headers),
      },
      async onResponse(outputEvent, response) {
        const headers = getAfterResponseHeaders(response.headers, response.url);
        setResponseHeaders(outputEvent, headers);

        const contentType = response.headers.get('content-type') || '';
        const isM3U8 = contentType.includes('mpegurl') || destination.endsWith('.m3u8');

        if (isM3U8) {
          const body = await response.text();
          const rewritten = rewriteM3U8(body, destination, proxyUrl);
          // @ts-ignore
          outputEvent.node.res.end(rewritten);
        }
      },
    });
  } catch (e: any) {
    console.error('Proxy error:', e);
    return sendJson({
      event,
      status: 500,
      data: { error: e.message },
    });
  }
});
