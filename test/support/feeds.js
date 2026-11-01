// fake network: per-url bodies; ETag/304 support; programmable failures/delays
const crypto = require('crypto');
module.exports = () => {
  const N = { bodies: {}, fail: false, failUrl: () => false, delay: 0, calls: [], gate: null };
  const ago = h => new Date(Date.now() - h * 36e5).toUTCString();
  N.rss = items => `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>${items.map(([t,l,h=1])=>`<item><title><![CDATA[${t}]]></title><link>${l}</link><pubDate>${ago(h)}</pubDate></item>`).join('')}</channel></rss>`;
  N.fetch = async (u, o) => {
    N.calls.push(u);
    if (N.gate) await N.gate;
    if (N.fail || N.failUrl(u)) throw new Error('offline');
    let body = N.bodies[u]; if (body === undefined) for (const k in N.bodies) if (k.startsWith('re:') && new RegExp(k.slice(3)).test(u)) body = N.bodies[k];
    body = body || N.rss([]);
    const et = '"' + crypto.createHash('md5').update(body).digest('hex') + '"';
    const hdr = { etag: et };
    if (o.headers['If-None-Match'] === et) return { status: 304, ok: false, url: u, headers: { get: () => null }, text: async () => '' };
    return { status: 200, ok: true, url: u, headers: { get: k => hdr[k.toLowerCase()] ?? null }, text: async () => body };
  };
  return N;
};
