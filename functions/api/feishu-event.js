export async function onRequest(context) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  };

  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Method not allowed'
    }), { status: 405, headers });
  }

  const verificationToken = context.env.FEISHU_VERIFICATION_TOKEN;
  let payload;
  try {
    payload = await context.request.json();
  } catch (_) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Invalid JSON body'
    }), { status: 400, headers });
  }

  if (verificationToken && payload.token && payload.token !== verificationToken) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Invalid verification token'
    }), { status: 403, headers });
  }

  if (payload.type === 'url_verification' && payload.challenge) {
    return new Response(JSON.stringify({
      challenge: payload.challenge
    }), { status: 200, headers });
  }

  return new Response(JSON.stringify({
    ok: true
  }), { status: 200, headers });
}
