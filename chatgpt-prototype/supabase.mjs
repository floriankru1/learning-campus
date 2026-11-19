export function supabaseJournal(env = process.env, request = fetch) {
  const { CAMPUS_SUPABASE_URL: url, CAMPUS_SUPABASE_SECRET: secret, CAMPUS_USER_ID: userId } = env;
  if (!url && !secret && !userId) return null;
  if (!url || !secret?.startsWith('sb_secret_') || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(userId ?? '')) {
    throw new Error('Supabase benötigt Projekt-URL, Server-Schlüssel und Nutzer-ID.');
  }
  const base = new URL('/rest/v1/campus_lerntage', url);
  if (base.protocol !== 'https:' || base.username || base.password) throw new Error('Supabase benötigt eine HTTPS-Projekt-URL.');

  async function query(params, options = {}) {
    const endpoint = new URL(base);
    endpoint.search = new URLSearchParams(params);
    const response = await request(endpoint, {
      ...options,
      headers: { apikey: secret, 'Content-Type': 'application/json', ...options.headers },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Supabase-Lerntage: HTTP ' + response.status);
    return response;
  }

  return {
    async read(date, id) {
      const response = await query({
        user_id: 'eq.' + userId, lerntag: 'eq.' + date, lektion: 'eq.' + id, select: 'eintrag',
      });
      const [row] = await response.json();
      return row?.eintrag ?? null;
    },
    async list() {
      const entries = [];
      for (let offset = 0;; offset += 500) {
        const response = await query({
          user_id: 'eq.' + userId, select: 'eintrag', order: 'lerntag.desc,lektion.asc', limit: '500', offset: String(offset),
        });
        const rows = await response.json();
        entries.push(...rows.map(row => row.eintrag));
        if (rows.length < 500) return entries;
      }
    },
    async write(entry, importOnly = false) {
      const response = await query({ on_conflict: 'user_id,lerntag,lektion', select: 'lektion,lerntag' }, {
        method: 'POST',
        headers: { Prefer: 'resolution=' + (importOnly ? 'ignore' : 'merge') + '-duplicates,return=representation' },
        body: JSON.stringify({ user_id: userId, lerntag: entry.date, lektion: entry.lessonId, eintrag: entry }),
      });
      return (await response.json()).length > 0;
    },
  };
}
