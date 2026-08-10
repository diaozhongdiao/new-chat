function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmtPrice(value) {
  return n(value).toFixed(2);
}

function fmtPct(value) {
  const parsed = n(value);
  return `${parsed > 0 ? '+' : ''}${parsed.toFixed(2)}%`;
}

function fmtAmount(value) {
  return `${(n(value) / 100000000).toFixed(2)}亿`;
}

function sectorKey(value) {
  return String(value || '')
    .replace(/[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/g, '')
    .replace(/[一二三四五六七八九十]+级/g, '')
    .replace(/[（）()\s]/g, '')
    .trim();
}

async function fetchJson(url, timeout = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSinaPage(page) {
  const url = new URL('https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData');
  url.searchParams.set('page', page);
  url.searchParams.set('num', 80);
  url.searchParams.set('sort', 'amount');
  url.searchParams.set('asc', 0);
  url.searchParams.set('node', 'hs_a');
  url.searchParams.set('symbol', '');
  url.searchParams.set('_s_r_a', 'init');
  const payload = await fetchJson(url.toString(), 8000);
  return Array.isArray(payload) ? payload : [];
}

async function fetchMarketData() {
  const url = new URL('https://push2.eastmoney.com/api/qt/ulist.np/get');
  url.searchParams.set('fltt', 2);
  url.searchParams.set('invt', 2);
  url.searchParams.set('fields', 'f12,f13,f14,f2,f3,f4,f5,f6,f15,f16,f17,f18,f124');
  url.searchParams.set('secids', '1.000001,0.399001,0.399006,1.000688');
  const payload = await fetchJson(url.toString(), 6000);
  const rows = payload && payload.data && Array.isArray(payload.data.diff) ? payload.data.diff : [];
  return rows.map((row) => ({
    name: String(row.f14 || ''),
    price: n(row.f2),
    change: n(row.f3),
    amount: n(row.f6)
  })).filter((item) => item.name);
}

async function fetchSectorHeat() {
  const requests = ['m:90+t:2', 'm:90+t:3'].map((fs) => {
    const url = new URL('https://push2.eastmoney.com/api/qt/clist/get');
    url.searchParams.set('pn', 1);
    url.searchParams.set('pz', 600);
    url.searchParams.set('po', 1);
    url.searchParams.set('np', 1);
    url.searchParams.set('fltt', 2);
    url.searchParams.set('invt', 2);
    url.searchParams.set('fid', 'f3');
    url.searchParams.set('fs', fs);
    url.searchParams.set('fields', 'f12,f14,f3,f6,f8,f104,f105,f128,f136');
    return fetchJson(url.toString(), 6000);
  });
  const settled = await Promise.allSettled(requests);
  const rows = settled
    .filter((item) => item.status === 'fulfilled')
    .flatMap((item) => item.value && item.value.data && Array.isArray(item.value.data.diff) ? item.value.data.diff : []);
  return rows.map((row) => ({
    name: String(row.f14 || ''),
    change: n(row.f3),
    leaderName: String(row.f128 || ''),
    leaderChange: n(row.f136)
  })).filter((item) => item.name).slice(0, 5);
}

function normalizeStock(item) {
  return {
    symbol: String(item.symbol || ''),
    code: String(item.code || ''),
    name: String(item.name || ''),
    price: n(item.trade),
    change: n(item.changepercent),
    amount: n(item.amount),
    turnover: n(item.turnoverratio)
  };
}

function scoreStock(stock) {
  const total = Math.round(
    Math.max(0, 30 - Math.abs(stock.turnover - 12) * 1.2) +
    Math.min(stock.amount / 1000000000, 1) * 25 +
    Math.max(0, stock.change) * 2 +
    (stock.price >= 5 && stock.price <= 35 ? 15 : 0)
  );
  return { total };
}

async function buildDigest() {
  const pages = [1, 2, 3, 4];
  const results = await Promise.allSettled(pages.map(fetchSinaPage));
  const raw = results
    .filter((item) => item.status === 'fulfilled')
    .flatMap((item) => item.value)
    .filter(Boolean)
    .map(normalizeStock)
    .filter((stock) => stock.symbol.startsWith('sh') || stock.symbol.startsWith('sz'))
    .filter((stock) => !/^(N|C)/.test(stock.name) && !/ST|退/.test(stock.name))
    .filter((stock) => stock.price >= 5 && stock.price <= 35)
    .filter((stock) => stock.amount >= 300000000 && stock.turnover >= 5 && stock.turnover <= 25)
    .sort((a, b) => (b.amount * 0.00000001 + b.turnover * 0.8 + b.change * 2) - (a.amount * 0.00000001 + a.turnover * 0.8 + a.change * 2))
    .slice(0, 24);

  const candidates = raw.slice(0, 7).map((stock) => ({
    ...stock,
    score: scoreStock(stock)
  })).sort((a, b) => b.score.total - a.score.total).slice(0, 7);

  const board = candidates.slice(0, 5).map((stock) => ({
    ...stock,
    boardScore: Math.min(100, Math.max(60, stock.score.total + 10))
  }));

  const market = await fetchMarketData().catch(() => []);
  const themes = await fetchSectorHeat().catch(() => []);
  const now = new Date().toLocaleString('zh-CN', { hour12: false });
  const marketLine = market.length ? `大盘：${market.map((item) => `${item.name}${fmtPct(item.change)}`).join('，')}` : '大盘：暂无数据';
  const themeLine = themes.length ? `热门题材：${themes.map((item) => `${item.name}${fmtPct(item.change)} 领涨:${item.leaderName || '-'}`).join('；')}` : '热门题材：暂无数据';
  const candidateLines = candidates.length ? candidates.map((stock, index) => `${index + 1}. ${stock.name} ${stock.symbol} 总分${stock.score.total} 涨跌${fmtPct(stock.change)} 成交${fmtAmount(stock.amount)} 换手${n(stock.turnover).toFixed(2)}%`).join('\n') : '暂无候选股';
  const boardLines = board.length ? board.map((stock, index) => `${index + 1}. ${stock.name} ${stock.symbol} 打板${stock.boardScore} 涨跌${fmtPct(stock.change)}`).join('\n') : '暂无打板观察';

  return [
    `短线训练台 ${now}`,
    '',
    marketLine,
    themeLine,
    '',
    '候选池',
    candidateLines,
    '',
    '打板观察',
    boardLines
  ].join('\n');
}

function isTrigger(payload) {
  const text = String(
    payload?.event?.message?.content ||
    payload?.event?.message?.text ||
    ''
  );
  return /发送|推送|训练台|复盘|@/.test(text);
}

export async function onRequest(context) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  };

  if (context.request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), { status: 405, headers });
  }

  let payload;
  try {
    payload = await context.request.json();
  } catch (_) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON body' }), { status: 400, headers });
  }

  const verificationToken = context.env.FEISHU_VERIFICATION_TOKEN;
  const incomingToken = payload.token || payload.header?.token;
  if (verificationToken && incomingToken && incomingToken !== verificationToken) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid verification token' }), { status: 403, headers });
  }

  if (payload.type === 'url_verification' && payload.challenge) {
    return new Response(JSON.stringify({ challenge: payload.challenge }), { status: 200, headers });
  }

  if (!isTrigger(payload)) {
    return new Response(JSON.stringify({ ok: true, ignored: true }), { status: 200, headers });
  }

  const webhook = context.env.FEISHU_WEBHOOK;
  if (!webhook) {
    return new Response(JSON.stringify({ ok: false, error: 'FEISHU_WEBHOOK is not configured' }), { status: 500, headers });
  }

  const text = await buildDigest();
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

  return new Response(JSON.stringify({ ok: true, detail: resultText }), { status: 200, headers });
}
