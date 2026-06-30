import { NextResponse } from 'next/server';

function getTargetUrl(reqUrl: string): string {
  const prefix = '/api/proxy/';
  const index = reqUrl.indexOf(prefix);
  if (index === -1) return '';
  
  const targetPart = reqUrl.substring(index + prefix.length);
  
  if (targetPart.startsWith('https/')) {
    return 'https://' + targetPart.substring(6);
  } else if (targetPart.startsWith('http/')) {
    return 'http://' + targetPart.substring(5);
  } else if (targetPart.startsWith('https:/')) {
    return 'https://' + targetPart.substring(7);
  } else if (targetPart.startsWith('http:/')) {
    return 'http://' + targetPart.substring(6);
  } else if (targetPart.startsWith('https://')) {
    return targetPart;
  } else if (targetPart.startsWith('http://')) {
    return targetPart;
  } else {
    return 'https://' + targetPart;
  }
}

async function handleProxy(request: Request, method: string) {
  const targetUrl = getTargetUrl(request.url);
  if (!targetUrl) {
    return new Response('Invalid proxy URL', { status: 400 });
  }

  try {
    const headers = new Headers();
    // Copy browser headers and set referrer
    headers.set('User-Agent', request.headers.get('User-Agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    headers.set('Referer', 'https://viu.lk/');
    headers.set('Origin', 'https://viu.lk');

    // Forward content-type for POST requests (Widevine license payload)
    const contentType = request.headers.get('Content-Type');
    if (contentType) {
      headers.set('Content-Type', contentType);
    }

    let body: any = null;
    if (method === 'POST') {
      body = await request.arrayBuffer();
    }

    // Perform the fetch, but do not follow redirects automatically.
    // We want to handle redirects manually to rewrite the Location headers to our proxy URL structure.
    const res = await fetch(targetUrl, {
      method,
      headers,
      body,
      redirect: 'manual',
    });

    // Handle redirects (301, 302, 307, 308)
    if (res.status >= 300 && res.status < 400) {
      const redirectLocation = res.headers.get('Location');
      if (redirectLocation) {
        // Resolve relative redirect location against the current target URL
        const absoluteLocation = new URL(redirectLocation, targetUrl).toString();
        
        // Reconstruct host details from the incoming request
        const reqHost = request.headers.get('host') || 'localhost:3000';
        const reqProto = request.url.startsWith('https') ? 'https' : 'http';
        
        // Convert to our proxy redirect structure: http://host/api/proxy/https/new-domain/path
        const proxyRedirectUrl = `${reqProto}://${reqHost}/api/proxy/${absoluteLocation.replace('://', '/')}`;
        
        const redirectHeaders = new Headers();
        redirectHeaders.set('Location', proxyRedirectUrl);
        redirectHeaders.set('Access-Control-Allow-Origin', '*');
        
        return new Response(null, {
          status: res.status,
          headers: redirectHeaders,
        });
      }
    }

    const responseBody = await res.arrayBuffer();

    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    responseHeaders.set('Access-Control-Allow-Headers', '*');
    
    const resContentType = res.headers.get('Content-Type');
    if (resContentType) {
      responseHeaders.set('Content-Type', resContentType);
    }

    return new Response(responseBody, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(`Proxy error for ${targetUrl}:`, error);
    return new Response('Proxy error: ' + String(error), { status: 500 });
  }
}

export async function GET(request: Request) {
  return handleProxy(request, 'GET');
}

export async function POST(request: Request) {
  return handleProxy(request, 'POST');
}

export async function OPTIONS() {
  const responseHeaders = new Headers();
  responseHeaders.set('Access-Control-Allow-Origin', '*');
  responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  responseHeaders.set('Access-Control-Allow-Headers', '*');
  return new Response(null, {
    status: 204,
    headers: responseHeaders,
  });
}
