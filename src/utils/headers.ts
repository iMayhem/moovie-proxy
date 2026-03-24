const headerMap: Record<string, string> = {
  'X-Cookie': 'Cookie',
  'X-Referer': 'Referer',
  'X-Origin': 'Origin',
  'X-User-Agent': 'User-Agent',
  'X-X-Real-Ip': 'X-Real-Ip',
};

const blacklistedHeaders = [
  'cf-connecting-ip',
  'cf-worker',
  'cf-ray',
  'cf-visitor',
  'cf-ew-via',
  'cdn-loop',
  'x-amzn-trace-id',
  'cf-ipcountry',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'forwarded',
  'x-real-ip',
  'content-length',
  ...Object.keys(headerMap),
];

function copyHeader(
  headers: Headers,
  outputHeaders: Headers,
  inputKey: string,
  outputKey: string,
) {
  if (headers.has(inputKey))
    outputHeaders.set(outputKey, headers.get(inputKey) ?? '');
}

export function getProxyHeaders(headers: Headers): Headers {
  const output = new Headers();

  // Forward all headers from the incoming request except Cloudflare infra headers
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (!blacklistedHeaders.includes(lower)) {
      output.set(key, value);
    }
  });

  // Apply X-* header remappings (e.g. X-Cookie -> Cookie)
  Object.entries(headerMap).forEach((entry) => {
    if (headers.has(entry[0])) {
      output.set(entry[1], headers.get(entry[0]) ?? '');
    }
  });

  // Use a modern Chrome UA if none was provided
  if (!output.has('User-Agent')) {
    output.set(
      'User-Agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    );
  }

  return output;
}


export function getAfterResponseHeaders(
  headers: Headers,
  finalUrl: string,
): Record<string, string> {
  const output: Record<string, string> = {};

  if (headers.has('Set-Cookie'))
    output['X-Set-Cookie'] = headers.get('Set-Cookie') ?? '';

  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Expose-Headers': '*',
    Vary: 'Origin',
    'X-Final-Destination': finalUrl,
    ...output,
  };
}

export function getBlacklistedHeaders() {
  return blacklistedHeaders;
}
