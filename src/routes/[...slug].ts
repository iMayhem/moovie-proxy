import {
  getProxyHeaders,
  getAfterResponseHeaders,
  getBlacklistedHeaders,
} from '@/utils/headers';
import { specificProxyRequest } from '@/utils/proxy';

/**
 * Catch-all route for resolving relative paths (e.g., HLS segments/keys)
 * using the Referer header to determine the base URL.
 */
export default defineEventHandler(async (event) => {
  // handle cors
  if (isPreflightRequest(event)) return handleCors(event, {});

  const referer = getHeader(event, 'referer');
  let destination = '';

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      // Try to find the original target URL from the referer's query params
      const prevDest = refererUrl.searchParams.get('destination') || refererUrl.searchParams.get('url');
      if (prevDest) {
        const base = new URL(prevDest);
        // Resolve the current relative path against the previous destination's base
        destination = new URL(event.path, base.origin + base.pathname).href;
      }
    } catch (e) {
      // ignore
    }
  }

  if (!destination) {
    throw createError({
      statusCode: 404,
      statusMessage: `Cannot resolve relative path: ${event.path}. No valid Referer found.`,
    });
  }

  try {
    return await specificProxyRequest(event, destination, {
      blacklistedHeaders: getBlacklistedHeaders(),
      fetchOptions: {
        redirect: 'follow',
        headers: getProxyHeaders(event.headers),
      },
      onResponse(outputEvent, response) {
        const headers = getAfterResponseHeaders(response.headers, response.url);
        setResponseHeaders(outputEvent, headers);
      },
    });
  } catch (e: any) {
    console.error('Catch-all proxy error:', e);
    throw createError({
      statusCode: 500,
      statusMessage: e.message,
    });
  }
});
