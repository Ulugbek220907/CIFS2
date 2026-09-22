import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Constants: cifsSubjects, level4Subjects, subjects', async () => {
  const constantsContent = fs.readFileSync('src/constants.ts', 'utf8');

  // Verify cifsSubjects contains Introduction to Business and Economics and NOT Foundations of Economics
  const cifsArrayMatch = constantsContent.match(/export const cifsSubjects: Subject\[\] = \[([\s\S]*?)\];/);
  assert.ok(cifsArrayMatch, 'cifsSubjects array found');
  assert.match(cifsArrayMatch[1], /'Introduction to Business and Economics'/);
  assert.doesNotMatch(cifsArrayMatch[1], /'Foundations of Economics'/);

  // Verify level4Subjects contains the 3 required subjects
  const level4Match = constantsContent.match(/export const level4Subjects: Subject\[\] = \[([\s\S]*?)\];/);
  assert.ok(level4Match, 'level4Subjects array found');
  assert.match(level4Match[1], /'Math for Eco'/);
  assert.match(level4Match[1], /'Exploring Economics'/);
  assert.match(level4Match[1], /'Contemporary Issues in Global Economy'/);
});

test('Abbreviation mapping in subjectShortName', async () => {
  const { subjectShortName, getQuizThemeTitle } = await import('../src/constants.ts');

  assert.equal(subjectShortName('Quantitative Methods'), 'QM');
  assert.equal(subjectShortName('Academic Communication Skills'), 'ACS');
  assert.equal(subjectShortName('Professional Skills & Employability'), 'PSE');
  assert.equal(subjectShortName('Critical Thinking & Citizenship'), 'CTC');
  assert.equal(subjectShortName('Introduction to Business and Economics'), 'IBE');
  assert.equal(subjectShortName('Foundations of Economics'), 'IBE');
  assert.equal(subjectShortName('Understanding Finance'), 'UF');

  // Level 4
  assert.equal(subjectShortName('Math for Eco'), 'ME');
  assert.equal(subjectShortName('Exploring Economics'), 'EE');
  assert.equal(subjectShortName('Contemporary Issues in Global Economy'), 'CIGE');

  // getQuizThemeTitle
  assert.equal(getQuizThemeTitle('Quantitative Methods', 'Theme 1'), 'Data and data representations');
  assert.equal(getQuizThemeTitle(undefined, 'Theme 1'), 'Data and data representations');
  assert.equal(getQuizThemeTitle('Quantitative Methods', 'Theme 2'), 'Theme 2');
  assert.equal(getQuizThemeTitle('Math for Eco', 'Theme 1'), 'Theme 1');
});

test('Sample questions JSON schema and content', () => {
  const raw = fs.readFileSync('supabase/sample-questions.json', 'utf8');
  const data = JSON.parse(raw);
  assert.ok(Array.isArray(data.questions));

  const subjectsInSample = new Set(data.questions.map((q) => q.subject));
  assert.ok(subjectsInSample.has('Introduction to Business and Economics'));
  assert.ok(subjectsInSample.has('Math for Eco'));
  assert.ok(subjectsInSample.has('Exploring Economics'));
  assert.ok(subjectsInSample.has('Contemporary Issues in Global Economy'));

  for (const q of data.questions) {
    assert.equal(typeof q.subject, 'string');
    assert.equal(typeof q.theme, 'string');
    assert.equal(typeof q.question_text, 'string');
    assert.equal(Array.isArray(q.options), true);
    assert.equal(q.options.length, 4);
    assert.equal(typeof q.correct_index, 'number');
    assert.ok(q.correct_index >= 0 && q.correct_index < 4);
    assert.equal(typeof q.explanation, 'string');
  }
});

test('SQL Migration 0003_level4_and_ibe.sql', () => {
  const sql = fs.readFileSync('supabase/migrations/0003_level4_and_ibe.sql', 'utf8');
  assert.match(sql, /Introduction to Business and Economics/);
  assert.match(sql, /Math for Eco/);
  assert.match(sql, /Exploring Economics/);
  assert.match(sql, /Contemporary Issues in Global Economy/);
  assert.match(sql, /questions_subject_check/);
  assert.match(sql, /results_subject_check/);
});

test('Admin sample template contains all Level 4 subjects', () => {
  const adminCode = fs.readFileSync('src/admin/index.ts', 'utf8');
  assert.match(adminCode, /"subject": "Introduction to Business and Economics"/);
  assert.match(adminCode, /"subject": "Math for Eco"/);
  assert.match(adminCode, /"subject": "Exploring Economics"/);
  assert.match(adminCode, /"subject": "Contemporary Issues in Global Economy"/);
});

test('CSS fullscreen and layout rules', () => {
  const css = fs.readFileSync('src/styles.css', 'utf8');
  assert.match(css, /body\.quiz-fullscreen \.site-header\s*\{\s*display:\s*none !important;/);
  assert.match(css, /body\.quiz-fullscreen \.site-footer\s*\{\s*display:\s*none !important;/);
  assert.match(css, /body\.quiz-fullscreen \.leadership-banner/);
  assert.match(css, /\.quiz-topbar-centered/);
  assert.match(css, /\.quiz-title-centered/);
  assert.match(css, /\.quiz-progress-centered/);
  assert.match(css, /body\.quiz-fullscreen \.quiz-shell \.question-card\s*\{[\s\S]*?border:\s*none/);
});

test('Typescript compiler check (npx tsc --noEmit)', async () => {
  const { execSync } = await import('node:child_process');
  const stdout = execSync('npx tsc --noEmit', { encoding: 'utf8' });
  assert.equal(stdout.trim(), '');
});
