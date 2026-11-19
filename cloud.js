import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const config = window.learningCampusCloudConfig;
if (config?.url && config.publishableKey?.startsWith('sb_publishable_')) {
  connectDashboard(createClient(config.url, config.publishableKey));
}

function connectDashboard(client) {
  const panel = document.createElement('section');
  panel.className = 'section cloud-account';
  panel.innerHTML = `
    <form id="cloud-login">
      <label class="field"><span>E-Mail für Learning Campus</span><input type="email" autocomplete="email" required></label>
      <button class="button primary">Anmeldelink senden</button>
    </form>
    <button class="button" id="cloud-logout" type="button" hidden>Abmelden</button>
    <p role="status" id="cloud-status"></p>
  `;
  const form = panel.querySelector('form');
  const logout = panel.querySelector('#cloud-logout');
  const status = panel.querySelector('#cloud-status');
  document.querySelector('main').before(panel);

  let userId;
  window.learningCampusCloud = {
    get userId() { return userId; },
    async entries() {
      if (!userId) return [];
      const entries = [];
      for (let offset = 0;; offset += 500) {
        const { data, error } = await client.from('campus_lerntage')
          .select('lerntag,lektion,erkenntnisse,offene_frage,naechster_schritt,notion_url')
          .order('lerntag', { ascending: false }).order('lektion')
          .range(offset, offset + 499);
        if (error) throw error;
        entries.push(...data.map(row => ({
          date: row.lerntag, lessonId: row.lektion, insights: row.erkenntnisse,
          openQuestion: row.offene_frage, nextStep: row.naechster_schritt, notionUrl: row.notion_url,
        })));
        if (data.length < 500) return entries;
      }
    },
    async notes() {
      if (!userId) return [];
      const notes = [];
      for (let offset = 0;; offset += 500) {
        const { data, error } = await client.from('campus_browser_notizen').select('lerntag,lektion,zusammenfassung')
          .order('lerntag', { ascending: false }).order('lektion').range(offset, offset + 499);
        if (error) throw error;
        notes.push(...data);
        if (data.length < 500) return notes;
      }
    },
    async saveNote(date, lessonId, summary) {
      if (!userId) throw new Error('Anmeldung erforderlich.');
      const { error } = await client.from('campus_browser_notizen').upsert({
        user_id: userId, lerntag: date, lektion: lessonId, zusammenfassung: summary,
      }, { onConflict: 'user_id,lerntag,lektion' });
      if (error) throw error;
    },
  };

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const { error } = await client.auth.signInWithOtp({
        email: form.querySelector('input').value.trim(),
        options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname },
      });
      status.textContent = error ? 'Der Anmeldelink konnte nicht gesendet werden.' : 'Prüfe dein Postfach und öffne den Anmeldelink.';
    } catch {
      status.textContent = 'Anmeldung vorübergehend nicht verfügbar.';
    } finally {
      button.disabled = false;
    }
  });
  logout.addEventListener('click', async () => {
    const { error } = await client.auth.signOut();
    if (error) status.textContent = 'Abmeldung fehlgeschlagen.';
  });

  client.auth.onAuthStateChange((event, session) => {
    const nextUser = session?.user.id;
    form.hidden = Boolean(nextUser);
    logout.hidden = !nextUser;
    if (event === 'INITIAL_SESSION' || nextUser !== userId) {
      userId = nextUser;
      document.body.toggleAttribute('data-campus-signed-in', Boolean(nextUser));
      document.querySelector('.footer').textContent = 'Teamcoaching-Zusammenfassungen aus ChatGPT und online gespeicherte Browser-Notizen erscheinen in der Tagesübersicht.';
      status.textContent = nextUser ? 'Angemeldet' : '';
      window.dispatchEvent(new Event('campus-cloud-change'));
    }
  });
}
