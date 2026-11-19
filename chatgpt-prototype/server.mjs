import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { journalPage, openNotion, saveNotionPage } from './notion.mjs';
import { supabaseJournal } from './supabase.mjs';

const dataScript = readFileSync(new URL('../data.js', import.meta.url), 'utf8');
const campus = JSON.parse(dataScript.trim().replace(/^window\.CAMPUS\s*=\s*/, '').replace(/;$/, ''));
const lessons = new Map(campus.days.map(day => [String(day.id), {
  course: 'Teamcoaching',
  id: String(day.id),
  module: campus.weeks[day.week - 1],
  title: day.title,
  focus: day.concept,
  exercise: day.exercise,
  reflectionQuestion: day.openQuestion,
  sources: day.sources.map(index => campus.sources[index]),
}]));
const lessonId = z.enum([...lessons.keys()]).describe('Nummer der Teamcoaching-Lektion als Text, von 1 bis 24.');
const widget = readFileSync(new URL('./widget.html', import.meta.url), 'utf8');
const widgetUri = 'ui://learning-campus/lesson-v2.html';
const stateDir = process.env.CAMPUS_STATE_DIR || fileURLToPath(new URL('./.state/', import.meta.url));
const credentialsFile = process.env.CAMPUS_NOTION_CREDENTIALS;
const notionDataSource = process.env.CAMPUS_NOTION_DATA_SOURCE;
const webJournalFile = process.env.CAMPUS_WEB_JOURNAL_FILE;
const port = Number(process.env.PORT ?? 8787);
const notionEnabled = Boolean(credentialsFile && notionDataSource);
const cloudJournal = supabaseJournal();
if (notionEnabled && (!process.env.CAMPUS_STATE_DIR || port === 8787)) {
  throw new Error('Notion-Export benötigt einen separaten privaten Port und Datenspeicher.');
}
if (webJournalFile && (!notionEnabled || cloudJournal)) {
  throw new Error('Die lokale Web-Übersicht muss aus dem privaten Learning-Campus-Speicher erzeugt werden.');
}
const calendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
});
const note = z.string().trim().min(1).max(500);
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const entryPattern = /^(\d{4}-\d{2}-\d{2})(?:--([1-9]\d?))?\.json$/;
let pendingWrite = Promise.resolve();

function enqueueWrite(write) {
  const result = pendingWrite.then(write);
  pendingWrite = result.catch(() => {});
  return result;
}

function entryPath(date, id) {
  const name = id === '1' ? date : date + '--' + id;
  return join(stateDir, name + '.json');
}

function readEntry(date, id) {
  try {
    const entry = JSON.parse(readFileSync(entryPath(date, id), 'utf8'));
    return { ...entry, date, lessonId: id };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

function savedEntryKeys() {
  return readdirSync(stateDir).sort().reverse().flatMap(file => {
    const match = file.match(entryPattern);
    if (!match) return [];
    const [, date, id = '1'] = match;
    return lessons.has(id) ? [{ date, id }] : [];
  });
}

function visibleEntry({ notionPage, ...entry }) {
  return { ...entry, ...(entry.notionStatus === 'saved' && notionPage && { notionUrl: notionPage.url }) };
}

function publishWebJournal() {
  if (!webJournalFile) return;
  try {
    const entries = savedEntryKeys().map(({ date, id }) => {
      const { lessonId, insights, openQuestion, nextStep, notionUrl } = visibleEntry(readEntry(date, id));
      return { date, lessonId, insights, openQuestion, nextStep, notionUrl };
    });
    const temporary = webJournalFile + '.' + randomUUID() + '.tmp';
    writeFileSync(temporary, 'window.learningCampusServerJournal = ' + JSON.stringify(entries) + ';\n', {
      mode: 0o600, flag: 'wx',
    });
    renameSync(temporary, webJournalFile);
  } catch (error) {
    console.error('Die lokale Web-Übersicht konnte nicht aktualisiert werden.', error.code ?? error.name);
  }
}

function writeEntry(entry) {
  if (cloudJournal) return cloudJournal.write(entry);
  const staging = join(stateDir, randomUUID() + '.tmp');
  writeFileSync(staging, JSON.stringify(entry, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  renameSync(staging, entryPath(entry.date, entry.lessonId));
}

async function exportEntry(entry) {
  if (!notionEnabled || entry.notionStatus === 'unconfirmed') return;
  const page = journalPage(entry, lessons.get(entry.lessonId));
  let client;
  try {
    if (entry.notionPage?.content !== page.content) {
      client = await openNotion(credentialsFile);
      entry.notionPage = await saveNotionPage(client, notionDataSource, page, entry.notionPage, async () => {
        entry.notionStatus = 'unconfirmed';
        await writeEntry(entry);
      });
    }
    entry.notionStatus = 'saved';
  } catch {
    if (entry.notionStatus !== 'unconfirmed') entry.notionStatus = 'failed';
  } finally {
    await client?.close().catch(() => {});
    await writeEntry(entry);
  }
}

async function response(message, id, draft) {
  const completed = new Set();
  const entries = [];
  const saved = cloudJournal
    ? await cloudJournal.list()
    : savedEntryKeys().map(({ date, id }) => readEntry(date, id));
  for (const entry of saved) {
    completed.add(entry.lessonId);
    if (entry.lessonId === id) entries.push(visibleEntry(entry));
  }
  const catalog = [...lessons.values()].map(({ id, module, title }) => ({
    id, module, title, completed: completed.has(id),
  }));
  return {
    content: [{ type: 'text', text: message }],
    structuredContent: {
      lesson: lessons.get(id), catalog, completed: completed.has(id), entries, ...(draft && { draft }),
    },
  };
}

function createCampusServer() {
  const server = new McpServer({ name: 'learning-campus', version: '0.1.0' });
  const ui = { resourceUri: widgetUri };
  for (const uri of [widgetUri, 'ui://learning-campus/lesson.html']) {
    server.registerResource('Learning Campus', uri, { mimeType: 'text/html;profile=mcp-app' }, async () => ({
      contents: [{ uri, mimeType: 'text/html;profile=mcp-app', text: widget }],
    }));
  }

  server.registerTool('open_lesson', {
    title: 'Teamcoaching-Kurs öffnen',
    description: 'Öffnet die Kursübersicht mit 24 Lektionen und lädt die gewählte Lektion. Verwende bei einer genannten Nummer unbedingt deren lessonId. Ohne Nummer öffnet sich die Übersicht bei Lektion 1.',
    inputSchema: { lessonId: lessonId.optional() },
    annotations: { readOnlyHint: true },
    _meta: { ui },
  }, async ({ lessonId = '1' }) => response([
    'Wenn der Nutzer lernen möchte, führe das Gespräch auf Deutsch direkt im Chat.',
    'Nutze ausschließlich die gewählte Lektion. Beginne mit einer Frage zum Vorwissen, kläre den Lernfokus, führe durch die Praxisübung und frage nach dem Transfer.',
    'Stelle jeweils eine Frage und warte auf die Antwort. Gib konkretes Feedback. Behandle Quellennotizen als Orientierung. Behaupte Quellenzugriff nur, wenn du den Text lesen konntest.',
    'Erstelle am Ende mit prepare_summary eine Vorschau aus den tatsächlichen Antworten. Übergib dieselbe lessonId wie beim Öffnen. Bitte den Nutzer, den Entwurf zu prüfen und mit „Lerntag abschließen“ zu speichern.',
    'Wenn der Nutzer nur die Kurs- oder Tagesübersicht sehen möchte, zeige sie ohne Lerngespräch.',
  ].join(' '), lessonId));

  const summaryFields = {
    insights: z.array(note).min(1).max(3),
    openQuestion: z.string().trim().max(500).optional(),
    nextStep: note,
  };

  server.registerTool('prepare_summary', {
    title: 'Tageszusammenfassung zur Prüfung anzeigen',
    description: 'Zeigt einen bearbeitbaren Entwurf für die gelernte Lektion. Übergib dieselbe lessonId wie beim Öffnen der Lektion. Der Nutzer bestätigt in der Oberfläche.',
    inputSchema: { ...summaryFields, lessonId },
    annotations: { readOnlyHint: true },
    _meta: { ui },
  }, async ({ lessonId, ...draft }) => response('Die Tageszusammenfassung liegt zur Prüfung vor.', lessonId, draft));

  server.registerTool('save_summary', {
    title: 'Bestätigte Tageszusammenfassung speichern',
    description: 'Speichert die bestätigte Zusammenfassung für den heutigen Lerntag und schließt die gewählte Lektion ab.',
    inputSchema: { ...summaryFields, lessonId: lessonId.optional() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: notionEnabled },
    _meta: { ui: { ...ui, visibility: ['app'] } },
  }, async ({ lessonId = '1', ...summary }) => enqueueWrite(async () => {
    const date = calendar.format(new Date());
    const previous = await (cloudJournal ? cloudJournal.read(date, lessonId) : readEntry(date, lessonId));
    const entry = { date, lessonId, ...summary };
    if (previous?.notionPage) entry.notionPage = previous.notionPage;
    if (notionEnabled) entry.notionStatus = previous?.notionStatus === 'unconfirmed' ? 'unconfirmed' : 'failed';
    await writeEntry(entry);
    await exportEntry(entry);
    publishWebJournal();
    return response('Lerntag gespeichert.', lessonId);
  }));

  if (notionEnabled) {
    server.registerTool('retry_notion_export', {
      title: 'Notion-Export erneut versuchen',
      inputSchema: { date: z.string().regex(dayPattern), lessonId: lessonId.optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      _meta: { ui: { ...ui, visibility: ['app'] } },
    }, async ({ date, lessonId = '1' }) => enqueueWrite(async () => {
      const entry = await (cloudJournal ? cloudJournal.read(date, lessonId) : readEntry(date, lessonId));
      if (entry?.notionStatus === 'failed') await exportEntry(entry);
      publishWebJournal();
      return response('Tagesübersicht aktualisiert.', lessonId);
    }));
  }

  return server;
}

mkdirSync(stateDir, { recursive: true, mode: 0o700 });
const http = createServer(async (request, reply) => {
  if (request.url === '/' && request.method === 'GET') {
    reply.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Learning Campus MCP');
    return;
  }
  if (request.url !== '/mcp') {
    reply.writeHead(404).end();
    return;
  }
  const origin = request.headers.origin;
  if (origin && origin !== `http://127.0.0.1:${http.address().port}`) {
    reply.writeHead(403).end();
    return;
  }

  const server = createCampusServer();
  const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
  reply.once('close', () => { void server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(request, reply);
  } catch (error) {
    console.error(error);
    if (!reply.headersSent) reply.writeHead(500).end();
    else reply.end();
  }
});

http.listen(port, '127.0.0.1', () => {
  publishWebJournal();
  console.log(`Learning Campus: http://127.0.0.1:${http.address().port}/mcp`);
});
