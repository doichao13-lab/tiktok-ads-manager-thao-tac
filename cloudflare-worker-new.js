// ═══════════════════════════════════════════════════════════
// Cloudflare Worker — TikTok Ads Proxy + Cloud Config Sync
// ═══════════════════════════════════════════════════════════
// Cần tạo KV Namespace "TIKTOK_CONFIG" và bind vào Worker:
//   Workers & Pages → KV → Create namespace "TIKTOK_CONFIG"
//   Vào Worker → Settings → Variables → KV Namespace Bindings
//   → Add binding: Variable = CONFIG_STORE, KV = TIKTOK_CONFIG
// ═══════════════════════════════════════════════════════════

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);
    const json = (data) => new Response(JSON.stringify(data), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

    // ── LƯU CẤU HÌNH (TikTok API config) ─────────────────
    if (url.pathname === '/config/save' && request.method === 'POST') {
      if (!env.CONFIG_STORE) return json({ ok: false, error: 'KV chưa được cấu hình — xem hướng dẫn' });
      try {
        const { pin, config, personal } = await request.json();
        if (!pin || pin.length < 4) return json({ ok: false, error: 'PIN cần ít nhất 4 ký tự' });
        if (!config?.token) return json({ ok: false, error: 'Thiếu Access Token trong cài đặt' });
        await env.CONFIG_STORE.put('cfg:' + pin.toLowerCase(), JSON.stringify(config));
        // Also save personal data if provided
        if (personal) {
          await env.CONFIG_STORE.put('data:' + pin.toLowerCase(), JSON.stringify(personal));
        }
        return json({ ok: true });
      } catch(e) { return json({ ok: false, error: e.message }); }
    }

    // ── TẢI CẤU HÌNH ──────────────────────────────────────
    if (url.pathname === '/config/load') {
      if (!env.CONFIG_STORE) return json({ ok: false, error: 'KV chưa được cấu hình — xem hướng dẫn' });
      const pin = (url.searchParams.get('pin') || '').toLowerCase();
      if (!pin) return json({ ok: false, error: 'Thiếu PIN' });
      try {
        const raw = await env.CONFIG_STORE.get('cfg:' + pin);
        if (!raw) return json({ ok: false, error: 'Không tìm thấy cài đặt với PIN này' });
        // Also load personal data if exists
        const rawData = await env.CONFIG_STORE.get('data:' + pin);
        const personal = rawData ? JSON.parse(rawData) : null;
        return json({ ok: true, config: JSON.parse(raw), personal });
      } catch(e) { return json({ ok: false, error: e.message }); }
    }

    // ── LƯU DỮ LIỆU CÁ NHÂN (Todo / Tài liệu / Ghi chú) ─
    if (url.pathname === '/data/save' && request.method === 'POST') {
      if (!env.CONFIG_STORE) return json({ ok: false, error: 'KV chưa được cấu hình' });
      try {
        const { pin, todos, docs, notes } = await request.json();
        if (!pin || pin.length < 4) return json({ ok: false, error: 'PIN cần ít nhất 4 ký tự' });
        const payload = JSON.stringify({ todos: todos || [], docs: docs || [], notes: notes || [], savedAt: new Date().toISOString() });
        if (payload.length > 20 * 1024 * 1024) return json({ ok: false, error: 'Dữ liệu quá lớn (> 20 MB). Xóa bớt ảnh trong ghi chú.' });
        await env.CONFIG_STORE.put('data:' + pin.toLowerCase(), payload);
        return json({ ok: true, savedAt: new Date().toISOString() });
      } catch(e) { return json({ ok: false, error: e.message }); }
    }

    // ── TẢI DỮ LIỆU CÁ NHÂN ──────────────────────────────
    if (url.pathname === '/data/load') {
      if (!env.CONFIG_STORE) return json({ ok: false, error: 'KV chưa được cấu hình' });
      const pin = (url.searchParams.get('pin') || '').toLowerCase();
      if (!pin) return json({ ok: false, error: 'Thiếu PIN' });
      try {
        const raw = await env.CONFIG_STORE.get('data:' + pin);
        if (!raw) return json({ ok: false, error: 'Không tìm thấy dữ liệu với PIN này' });
        return json({ ok: true, ...JSON.parse(raw) });
      } catch(e) { return json({ ok: false, error: e.message }); }
    }

    // ── CORS PROXY cho TikTok API ──────────────────────────
    try {
      const rawTarget = url.searchParams.get('url') || request.url.replace(url.origin + '/', '');
      const target = decodeURIComponent(rawTarget);
      const resp = await fetch(target, {
        method: request.method,
        headers: {
          'Access-Token': request.headers.get('Access-Token') || '',
          'Content-Type': 'application/json',
        },
        body: request.method === 'POST' ? request.body : undefined,
      });
      const text = await resp.text();
      return new Response(text, { headers: { ...cors, 'Content-Type': 'application/json' } });
    } catch(e) {
      return new Response(
        JSON.stringify({ code: -1, message: e.message, data: null }),
        { headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }
  }
};
