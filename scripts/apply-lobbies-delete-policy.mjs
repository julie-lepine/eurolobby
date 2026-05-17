/**
 * Applique la policy DELETE sur public.lobbies (une fois).
 *
 * Option A — Management API (recommandé) :
 *   1. https://supabase.com/dashboard/account/tokens → créer un token
 *   2. Dans .env.local : SUPABASE_ACCESS_TOKEN=sbp_...
 *   3. node scripts/apply-lobbies-delete-policy.mjs
 *
 * Option B — connexion Postgres directe :
 *   1. Dashboard → Settings → Database → mot de passe
 *   2. Dans .env.local : SUPABASE_DB_PASSWORD=...
 *   3. node scripts/apply-lobbies-delete-policy.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnvLocal() {
  const path = resolve(root, '.env.local');
  try {
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      const key = t.slice(0, i).trim();
      const val = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    /* ignore */
  }
}

loadEnvLocal();

const SQL = `
drop policy if exists "lobbies_delete" on public.lobbies;
create policy "lobbies_delete" on public.lobbies for delete using (true);
`.trim();

const url = process.env.VITE_SUPABASE_URL || '';
const refMatch = url.match(/https:\/\/([^.]+)\.supabase\.co/);
const projectRef = refMatch?.[1];
if (!projectRef) {
  console.error('VITE_SUPABASE_URL manquant ou invalide dans .env.local');
  process.exit(1);
}

async function viaManagementApi() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) return false;

  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: SQL }),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error('Management API:', res.status, body);
    process.exit(1);
  }
  console.log('Policy lobbies_delete appliquée (Management API).');
  if (body) console.log(body);
  return true;
}

async function viaPg() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password) return false;

  let pg;
  try {
    pg = await import('pg');
  } catch {
    console.error('Installe pg : npm install -D pg');
    process.exit(1);
  }

  const connectionString =
    process.env.SUPABASE_DB_URL ||
    `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`;

  const client = new pg.default.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(SQL);
    console.log('Policy lobbies_delete appliquée (Postgres).');
  } finally {
    await client.end();
  }
  return true;
}

const ok = (await viaManagementApi()) || (await viaPg());
if (!ok) {
  console.error(`
Impossible d'appliquer la policy : aucun accès admin configuré.

Ajoute UNE de ces variables dans .env.local (fichier gitignored), puis relance :

  SUPABASE_ACCESS_TOKEN=sbp_...     (compte Supabase → Access Tokens)
  ou
  SUPABASE_DB_PASSWORD=...          (projet → Settings → Database)

Puis : node scripts/apply-lobbies-delete-policy.mjs
`);
  process.exit(1);
}
