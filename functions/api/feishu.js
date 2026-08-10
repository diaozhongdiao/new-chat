export async function onRequest(context) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...headers,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400'
      }
    });
  }

  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Method not allowed'
    }), { status: 405, headers });
  }

  const webhook = context.env.FEISHU_WEBHOOK;
  if (!webhook) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'FEISHU_WEBHOOK is not configured'
    }), { status: 500, headers });
  }

  let body;
  try {
    body = await context.request.json();
  } catch (_) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Invalid JSON body'
    }), { status: 400, headers });
  }

  const text = String(body.text || '').trim();
  if (!text) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Message text is empty'
    }), { status: 400, headers });
  }

  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      msg_type: 'text',
      content: { text }
    })
  });

  const resultText = await response.text();
  if (!response.ok) {
    return new Response(JSON.stringify({
      ok: false,
      error: `Feishu HTTP ${response.status}`,
      detail: resultText
    }), { status: 502, headers });
  }

  return new Response(JSON.stringify({
    ok: true,
    detail: resultText
  }), { status: 200, headers });
}
