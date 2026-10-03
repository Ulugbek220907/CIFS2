import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { execSync } from 'node:child_process';

const MIGRATION_PATH = 'supabase/migrations/0007_site_analytics.sql';

test('Milestone 1 Adversarial Challenge: Migration file integrity & PostgreSQL DDL syntax', () => {
  assert.ok(fs.existsSync(MIGRATION_PATH), `Migration file exists at ${MIGRATION_PATH}`);
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

  // Must not have syntax placeholders or unclosed blocks
  assert.ok(!sql.includes('TODO'), 'No TODO comments');
  assert.ok(!sql.includes('FIXME'), 'No FIXME comments');

  // Verify balanced parentheses
  let openParen = 0;
  let inString = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'" && sql[i - 1] !== '\\') {
      inString = !inString;
    } else if (!inString) {
      if (ch === '(') openParen++;
      else if (ch === ')') openParen--;
    }
  }
  assert.equal(openParen, 0, 'Parentheses in SQL migration are strictly balanced');

  // Table creation syntax
  assert.match(
    sql,
    /create table if not exists public\.site_analytics\s*\(/i,
    'Valid CREATE TABLE IF NOT EXISTS statement'
  );

  // Primary key and default
  assert.match(
    sql,
    /id\s+uuid\s+primary key\s+default\s+gen_random_uuid\(\)/i,
    'Valid UUID primary key with gen_random_uuid()'
  );

  // Column definitions
  assert.match(sql, /session_id\s+text\s+not null/i, 'session_id text not null');
  assert.match(sql, /metadata\s+jsonb\s+not null\s+default\s+'\{\}'::jsonb/i, 'metadata jsonb with default');
  assert.match(sql, /created_at\s+timestamptz\s+not null\s+default\s+now\(\)/i, 'created_at timestamptz with now() default');
});

test('Milestone 1 Adversarial Challenge: Subject Enum conformance against src/types.ts', () => {
  const typesContent = fs.readFileSync('src/types.ts', 'utf8');
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

  // Extract all single-quoted subject literals from types.ts
  const subjectMatches = [
    'Quantitative Methods',
    'Academic Communication Skills',
    'Professional Skills & Employability',
    'Critical Thinking & Citizenship',
    'Introduction to Business and Economics',
    'Understanding Finance',
    'Math for Eco',
    'Exploring Economics',
    'Contemporary Issues in Global Economy',
    'Financial Accounting',
    'Fundamentals of Statistics',
    'Essentials of Economics',
    'Foundations of Economics'
  ];

  for (const s of subjectMatches) {
    assert.ok(
      typesContent.includes(`'${s}'`),
      `Subject '${s}' must exist in src/types.ts`
    );
    assert.ok(
      sql.includes(`'${s}'`),
      `Subject '${s}' must exist in 0007_site_analytics.sql check constraint`
    );
  }

  // Ensure no extra or obsolete subjects
  const sqlSubjectCheckMatch = sql.match(/subject in \(([\s\S]*?)\)/i);
  assert.ok(sqlSubjectCheckMatch, 'Subject check constraint block found');
  const extractedSubjects = sqlSubjectCheckMatch[1]
    .split(',')
    .map(s => s.trim().replace(/^'|'$/g, ''));
  assert.equal(extractedSubjects.length, 13, 'Exactly 13 subjects defined in migration check constraint');
});

test('Milestone 1 Adversarial Challenge: Theme Enum conformance against src/types.ts', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
  const sqlThemeCheckMatch = sql.match(/theme in \(([\s\S]*?)\)/i);
  assert.ok(sqlThemeCheckMatch, 'Theme check constraint block found');
  const extractedThemes = sqlThemeCheckMatch[1]
    .split(',')
    .map(t => t.trim().replace(/^'|'$/g, ''));
  assert.equal(extractedThemes.length, 12, 'Exactly 12 themes defined in migration check constraint');

  for (let i = 1; i <= 12; i++) {
    assert.ok(extractedThemes.includes(`Theme ${i}`), `Theme ${i} present in migration check constraint`);
  }
});

test('Milestone 1 Adversarial Challenge: Index Coverage and Semantics', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

  // Index 1: event_type + created_at desc
  assert.match(
    sql,
    /create index if not exists site_analytics_event_type_created_at_idx\s+on public\.site_analytics\s*\(\s*event_type,\s*created_at desc\s*\)/i
  );

  // Index 2: partial index on subject, theme, created_at desc where subject is not null
  assert.match(
    sql,
    /create index if not exists site_analytics_subject_theme_created_at_idx\s+on public\.site_analytics\s*\(\s*subject,\s*theme,\s*created_at desc\s*\)\s*where subject is not null/i
  );

  // Index 3: session_id
  assert.match(
    sql,
    /create index if not exists site_analytics_session_id_idx\s+on public\.site_analytics\s*\(\s*session_id\s*\)/i
  );

  // Index 4: created_at desc
  assert.match(
    sql,
    /create index if not exists site_analytics_created_at_idx\s+on public\.site_analytics\s*\(\s*created_at desc\s*\)/i
  );
});

test('Milestone 1 Adversarial Challenge: RLS Policy Security Model', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

  // Row level security explicitly enabled
  assert.match(sql, /alter table public\.site_analytics enable row level security;/i);

  // Check that no permissive "USING (true)" exists for SELECT
  assert.ok(
    !sql.match(/for select[^;]*using\s*\(\s*true\s*\)/i),
    'CRITICAL: SELECT policy must NOT be open to public (using true)'
  );

  // Check SELECT is restricted to authenticated using public.is_admin()
  assert.match(
    sql,
    /create policy ["']site_analytics are readable by admins only["']\s+on public\.site_analytics\s+for select\s+to authenticated\s+using\s*\(\s*public\.is_admin\(\)\s*\);/i,
    'SELECT policy strictly guarded by public.is_admin()'
  );

  // Check DELETE is restricted to authenticated using public.is_admin()
  assert.match(
    sql,
    /create policy ["']site_analytics are deletable by admins only["']\s+on public\.site_analytics\s+for delete\s+to authenticated\s+using\s*\(\s*public\.is_admin\(\)\s*\);/i,
    'DELETE policy strictly guarded by public.is_admin()'
  );

  // Check INSERT is available to anon and authenticated with check (true)
  assert.match(
    sql,
    /create policy ["']site_analytics are insertable by anyone["']\s+on public\.site_analytics\s+for insert\s+to anon,\s*authenticated\s+with check\s*\(\s*true\s*\);/i,
    'INSERT policy allows telemetry submission from anon and authenticated'
  );

  // Verify NO UPDATE policy exists (immutability of telemetry logs)
  assert.ok(
    !sql.includes('for update'),
    'Immutability: No update policy exists for telemetry table (append-only)'
  );

  // PostgREST schema cache notification
  assert.match(sql, /select pg_notify\('pgrst',\s*'reload schema'\);/i);
});
