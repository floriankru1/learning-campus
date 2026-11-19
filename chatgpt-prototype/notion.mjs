import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const serverUrl = new URL('https://mcp.notion.com/mcp');
export const callbackUrl = new URL('http://127.0.0.1:8790/notion/callback');

export function notionTransport(credentialsFile, onAuthorization) {
  let credentials = {};
  try {
    credentials = JSON.parse(readFileSync(credentialsFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!onAuthorization && !credentials.tokens?.access_token) {
    throw new Error('Notion muss zuerst autorisiert werden.');
  }

  function persist(key, value) {
    credentials[key] = value;
    mkdirSync(dirname(credentialsFile), { recursive: true, mode: 0o700 });
    const temporary = credentialsFile + '.' + randomUUID();
    writeFileSync(temporary, JSON.stringify(credentials), { mode: 0o600, flag: 'wx' });
    renameSync(temporary, credentialsFile);
  }

  let verifier;
  const state = randomUUID();
  return {
    state,
    transport: new StreamableHTTPClientTransport(serverUrl, {
      authProvider: {
        redirectUrl: callbackUrl,
        clientMetadata: {
          client_name: 'Learning Campus',
          redirect_uris: [callbackUrl.href],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        },
        state: () => state,
        clientInformation: () => credentials.client,
        saveClientInformation: value => persist('client', value),
        tokens: () => credentials.tokens,
        saveTokens: value => persist('tokens', value),
        saveCodeVerifier: value => { verifier = value; },
        codeVerifier: () => verifier,
        redirectToAuthorization: url => {
          if (!onAuthorization) throw new Error('Notion muss erneut autorisiert werden.');
          onAuthorization(url);
        },
      },
    }),
  };
}

function asMarkdown(value) {
  return value.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char])
    .replace(/[\\`*_~\[\]$]/g, '\\$&').replace(/\s+/g, ' ');
}

export function journalPage(entry, lesson) {
  const content = [
    '## Kernerkenntnisse',
    entry.insights.map(value => '- ' + asMarkdown(value)).join('\n'),
    ...(entry.openQuestion ? ['## Offene Frage', asMarkdown(entry.openQuestion)] : []),
    '## Nächster Praxisschritt',
    asMarkdown(entry.nextStep),
  ].join('\n\n');
  return {
    properties: {
      Titel: lesson.title + ' · ' + entry.date,
      'date:Datum:start': entry.date,
      Hauptkategorie: lesson.course,
      Quellen: lesson.sources.map(source => source.name + ' — ' + source.url).join('\n'),
    },
    content,
  };
}

export async function openNotion(credentialsFile) {
  const client = new Client({ name: 'learning-campus', version: '0.1.0' });
  try {
    await client.connect(notionTransport(credentialsFile).transport, { timeout: 15000 });
    return client;
  } catch (error) {
    await client.close();
    throw error;
  }
}

export async function saveNotionPage(client, dataSource, page, existing, started) {
  const name = existing ? 'notion-update-page' : 'notion-create-pages';
  if (!existing) await started();
  const result = await client.callTool({
    name,
    arguments: existing
      ? { command: 'update_content', page_id: existing.id, content_updates: [
        { old_str: existing.content, new_str: page.content },
      ] }
      : { parent: { type: 'data_source_id', data_source_id: dataSource }, pages: [page] },
  }, undefined, { timeout: 20000 });

  if (result.isError) throw new Error('Notion hat den Schreibvorgang nicht bestätigt.');
  const parsed = result.structuredContent ?? JSON.parse(result.content.find(item => item.type === 'text')?.text ?? '{}');
  if (parsed.error || parsed.warnings?.length) throw new Error('Notion hat den Schreibvorgang nicht eindeutig bestätigt.');
  if (existing) return { ...existing, content: page.content };

  const created = parsed.pages?.[0];
  if (!created?.id || typeof created.url !== 'string' || !created.url.startsWith('https://')) {
    throw new Error('Notion hat keine Seiten-ID zurückgegeben.');
  }
  return { id: created.id, url: created.url, content: page.content };
}
