import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.argv[2] || 'dist');
const config = JSON.parse(process.env.CAMPUS_PUBLIC_CONFIG || '{}');
let url;
try {
  url = new URL(config.url);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error();
  }
} catch {
  throw new Error('CAMPUS_PUBLIC_CONFIG braucht eine gültige HTTPS-Projekt-URL.');
}
if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey ?? '')) {
  throw new Error('Für GitHub Pages wird ausschließlich der Supabase Publishable Key akzeptiert.');
}

await mkdir(output, { recursive: true });
const files = ['app.js', 'data.js', 'styles.css', 'cloud.js'];
await Promise.all(files.map(file => copyFile(join(root, file), join(output, file))));
const html = await readFile(join(root, 'index.html'), 'utf8');
const marker = '<!-- CAMPUS_CLOUD_SCRIPTS -->';
if (!html.includes(marker)) throw new Error('Platzhalter für die Online-Konfiguration fehlt.');
await writeFile(join(output, 'index.html'), html.replace('<body>', '<body data-campus-online>')
  .replace(marker, '<script src="cloud-config.js"></script><script type="module" src="cloud.js"></script>'));
await writeFile(join(output, 'cloud-config.js'), 'window.learningCampusCloudConfig = ' + JSON.stringify({
  url: url.origin, publishableKey: config.publishableKey,
}) + ';\n');
