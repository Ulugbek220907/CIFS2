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

  // Verify level4Subjects contains all 6 required subjects
  const level4Match = constantsContent.match(/export const level4Subjects: Subject\[\] = \[([\s\S]*?)\];/);
  assert.ok(level4Match, 'level4Subjects array found');
  assert.match(level4Match[1], /'Math for Eco'/);
  assert.match(level4Match[1], /'Exploring Economics'/);
  assert.match(level4Match[1], /'Contemporary Issues in Global Economy'/);
  assert.match(level4Match[1], /'Financial Accounting'/);
  assert.match(level4Match[1], /'Fundamentals of Statistics'/);
  assert.match(level4Match[1], /'Essentials of Economics'/);
});

test('Abbreviation mapping in subjectShortName', async () => {
  const { subjectShortName, getQuizThemeTitle, updateCustomThemeTitlesCache } = await import('../src/constants.ts');

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
  assert.equal(subjectShortName('Financial Accounting'), 'FA');
  assert.equal(subjectShortName('Fundamentals of Statistics'), 'FoS');
  assert.equal(subjectShortName('Essentials of Economics'), 'EoE');

  // Default theme titles (when blank, defaults to Theme 1, Theme 2, etc.)
  assert.equal(getQuizThemeTitle('Quantitative Methods', 'Theme 1'), 'Theme 1');
  assert.equal(getQuizThemeTitle(undefined, 'Theme 1'), 'Theme 1');
  assert.equal(getQuizThemeTitle('Financial Accounting', 'Theme 1'), 'Theme 1');

  // Dynamic custom titles
  updateCustomThemeTitlesCache({
    'Financial Accounting': {
      'Theme 1': 'Intro to Accounting',
      'Theme 2': 'Accounting Cycle',
      'Theme 3': 'Accounting Cycle 2',
    },
    'Fundamentals of Statistics': {
      'Theme 1': 'Intro to Statistics',
    },
    'Essentials of Economics': {
      'Theme 1': '10 principles of economics',
    },
  });

  assert.equal(getQuizThemeTitle('Financial Accounting', 'Theme 1'), 'Intro to Accounting');
  assert.equal(getQuizThemeTitle('Financial Accounting', 'Theme 2'), 'Accounting Cycle');
  assert.equal(getQuizThemeTitle('Financial Accounting', 'Theme 3'), 'Accounting Cycle 2');
  assert.equal(getQuizThemeTitle('Fundamentals of Statistics', 'Theme 1'), 'Intro to Statistics');
  assert.equal(getQuizThemeTitle('Essentials of Economics', 'Theme 1'), '10 principles of economics');
  assert.equal(getQuizThemeTitle('Financial Accounting', 'Theme 4'), 'Theme 4');
});

test('Subject theme counts and options in getSubjectThemes & resolveTheme', async () => {
  const { getSubjectThemes, resolveTheme, subjects } = await import('../src/constants.ts');

  // Verify all 12 subjects have all 12 themes
  assert.equal(subjects.length, 12, 'Total 12 subjects (6 CIFS + 6 Level 4)');
  for (const subject of subjects) {
    const subjectThemes = getSubjectThemes(subject);
    assert.equal(subjectThemes.length, 12, `${subject} must have 12 themes`);
    assert.equal(subjectThemes[0].theme, 'Theme 1');
    assert.equal(subjectThemes[11].theme, 'Theme 12');
  }

  // Dynamic theme titles reflected in getSubjectThemes
  const faThemes = getSubjectThemes('Financial Accounting');
  assert.equal(faThemes.length, 12);
  assert.equal(faThemes[0].theme, 'Theme 1');
  assert.equal(faThemes[0].title, 'Intro to Accounting');
  assert.equal(faThemes[0].hasCustomTitle, true);
  assert.equal(faThemes[1].theme, 'Theme 2');
  assert.equal(faThemes[1].title, 'Accounting Cycle');
  assert.equal(faThemes[1].hasCustomTitle, true);
  assert.equal(faThemes[3].theme, 'Theme 4');
  assert.equal(faThemes[3].title, 'Theme 4');
  assert.equal(faThemes[3].hasCustomTitle, false);

  // resolveTheme
  assert.equal(resolveTheme('Financial Accounting', 'Intro to Accounting'), 'Theme 1');
  assert.equal(resolveTheme('Financial Accounting', 'Accounting Cycle 2'), 'Theme 3');
  assert.equal(resolveTheme('Financial Accounting', 'Theme 2'), 'Theme 2');
  assert.equal(resolveTheme('Financial Accounting', 'Theme 12'), 'Theme 12');
  assert.equal(resolveTheme('Fundamentals of Statistics', 'Intro to Statistics'), 'Theme 1');
  assert.equal(resolveTheme('Essentials of Economics', '10 principles of economics'), 'Theme 1');
  assert.equal(resolveTheme('Math for Eco', 'Theme 5'), 'Theme 5');
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
  assert.ok(subjectsInSample.has('Financial Accounting'));
  assert.ok(subjectsInSample.has('Fundamentals of Statistics'));
  assert.ok(subjectsInSample.has('Essentials of Economics'));

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

test('SQL Migration 0004_add_level4_subjects.sql', () => {
  const sql = fs.readFileSync('supabase/migrations/0004_add_level4_subjects.sql', 'utf8');
  assert.match(sql, /Financial Accounting/);
  assert.match(sql, /Fundamentals of Statistics/);
  assert.match(sql, /Essentials of Economics/);
  assert.match(sql, /questions_subject_check/);
  assert.match(sql, /results_subject_check/);
});

test('SQL Migration 0007_site_analytics.sql schema, constraints, indexes, and RLS', () => {
  assert.ok(fs.existsSync('supabase/migrations/0007_site_analytics.sql'), 'Migration 0007 file exists');
  const sql = fs.readFileSync('supabase/migrations/0007_site_analytics.sql', 'utf8');

  // Table creation & columns
  assert.match(sql, /create table (if not exists )?public\.site_analytics/i);
  assert.match(sql, /id\s+uuid\s+primary key/i);
  assert.match(sql, /event_type\s+text\s+not null/i);
  assert.match(sql, /session_id\s+text\s+not null/i);
  assert.match(sql, /subject\s+text\s+null/i);
  assert.match(sql, /theme\s+text\s+null/i);
  assert.match(sql, /score\s+integer\s+null/i);
  assert.match(sql, /total_questions\s+integer\s+null/i);
  assert.match(sql, /time_taken_seconds\s+integer\s+null/i);
  assert.match(sql, /metadata\s+jsonb\s+not null/i);
  assert.match(sql, /created_at\s+timestamptz\s+not null/i);

  // Check constraints
  assert.match(sql, /event_type in \('page_visit',\s*'quiz_start',\s*'quiz_complete'\)/);
  assert.match(sql, /score is null or score >= 0/);
  assert.match(sql, /total_questions is null or total_questions > 0/);
  assert.match(sql, /time_taken_seconds is null or time_taken_seconds >= 0/);

  // Subject check constraint includes all subjects
  const requiredSubjects = [
    'Quantitative Methods',
    'Academic Communication Skills',
    'Professional Skills & Employability',
    'Critical Thinking & Citizenship',
    'Introduction to Business and Economics',
    'Foundations of Economics',
    'Understanding Finance',
    'Math for Eco',
    'Exploring Economics',
    'Contemporary Issues in Global Economy',
    'Financial Accounting',
    'Fundamentals of Statistics',
    'Essentials of Economics',
  ];
  for (const s of requiredSubjects) {
    assert.match(sql, new RegExp(`'${s}'`));
  }

  // Theme check constraint includes Theme 1 to Theme 12
  for (let i = 1; i <= 12; i++) {
    assert.match(sql, new RegExp(`'Theme ${i}'`));
  }

  // Indexes
  assert.match(sql, /create index (if not exists )?site_analytics_event_type_created_at_idx\s+on public\.site_analytics\s*\(\s*event_type,\s*created_at desc\s*\)/i);
  assert.match(sql, /create index (if not exists )?site_analytics_subject_theme_created_at_idx\s+on public\.site_analytics\s*\(\s*subject,\s*theme,\s*created_at desc\s*\)\s*where subject is not null/i);
  assert.match(sql, /create index (if not exists )?site_analytics_session_id_idx\s+on public\.site_analytics\s*\(\s*session_id\s*\)/i);
  assert.match(sql, /create index (if not exists )?site_analytics_created_at_idx\s+on public\.site_analytics\s*\(\s*created_at desc\s*\)/i);

  // RLS enablement
  assert.match(sql, /alter table public\.site_analytics enable row level security/i);

  // RLS Policies
  assert.match(sql, /create policy ["']site_analytics are insertable by anyone["']/i);
  assert.match(sql, /for insert\s+to anon,\s*authenticated\s+with check\s*\(\s*true\s*\)/i);

  assert.match(sql, /create policy ["']site_analytics are readable by admins only["']/i);
  assert.match(sql, /for select\s+to authenticated\s+using\s*\(\s*public\.is_admin\(\)\s*\)/i);

  assert.match(sql, /create policy ["']site_analytics are deletable by admins only["']/i);
  assert.match(sql, /for delete\s+to authenticated\s+using\s*\(\s*public\.is_admin\(\)\s*\)/i);

  // Schema cache reload
  assert.match(sql, /pg_notify\('pgrst',\s*'reload schema'\)/i);
});

test('Admin sample template contains all Level 4 subjects', () => {
  const adminCode = fs.readFileSync('src/admin/index.ts', 'utf8');
  assert.match(adminCode, /"subject": "Introduction to Business and Economics"/);
  assert.match(adminCode, /"subject": "Math for Eco"/);
  assert.match(adminCode, /"subject": "Exploring Economics"/);
  assert.match(adminCode, /"subject": "Contemporary Issues in Global Economy"/);
  assert.match(adminCode, /"subject": "Financial Accounting"/);
  assert.match(adminCode, /"subject": "Fundamentals of Statistics"/);
  assert.match(adminCode, /"subject": "Essentials of Economics"/);
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

test('KaTeX math rendering (renderMathText)', async () => {
  const { renderMathText } = await import('../src/math.ts');

  // Standard notation
  const std1 = renderMathText('A production function is Q = 4K^0.5 L^0.5. What is...');
  assert.match(std1, /class="katex"/);
  assert.match(std1, /Q = 4K\^\{0\.5\} L\^\{0\.5\}/);
  // Preserves punctuation and spacing after math
  assert.match(std1, /\.\s+What is\.\.\./);

  const std2 = renderMathText('What is the derivative of f(x) = x^2 with respect to x?');
  assert.match(std2, /class="katex"/);

  const std3 = renderMathText('Using the power rule, the derivative of x^2 is 2x.');
  assert.match(std3, /class="katex"/);

  // Compound equations: entire formula rendered in single KaTeX span, not split
  const compoundEq1 = renderMathText('The demand function is P = 100 - 2Q and supply is P = 20 + 3Q.');
  assert.match(compoundEq1, /P = 100 - 2Q/);
  assert.match(compoundEq1, /P = 20 \+ 3Q/);
  assert.match(compoundEq1, /<\/span>\s+and supply is\s+<span/);

  const compoundEq2 = renderMathText('Total cost is TC = 50 + 4Q + Q^2. What is MC?');
  assert.match(compoundEq2, /TC = 50 \+ 4Q \+ Q\^\{2\}/);
  assert.match(compoundEq2, /\.\s+What is/);

  // Negative exponents in formulas
  const negExp = renderMathText('Marginal product is MP_K = 2K^-0.5 L^0.5.');
  assert.match(negExp, /2K\^\{-0\.5\} L\^\{0\.5\}/);

  // Inequalities
  const ineq = renderMathText('The firm shuts down if P < AVC.');
  assert.match(ineq, /P &lt; AVC/);

  // Accounting natural language equations must not be broken or falsely matched
  const acct = renderMathText('The fundamental accounting equation is Assets = Liabilities + Equity.');
  assert.match(acct, /Assets = Liabilities \+ Equity/);
  assert.doesNotMatch(acct, /class="katex"/);

  // Explicit LaTeX delimiters
  const delim1 = renderMathText('A production function is $Q = 4K^{0.5} L^{0.5}$. What is...');
  assert.match(delim1, /class="katex"/);

  const delim2 = renderMathText('Calculate \\( f(x) = \\frac{1}{2} x^2 \\) for x=2.');
  assert.match(delim2, /class="katex"/);

  // Currency amounts must not be mangled (including parenthesized)
  const curr = renderMathText('The price is $50 and the revenue is $100.');
  assert.doesNotMatch(curr, /class="katex"/);
  assert.match(curr, /\$50/);
  assert.match(curr, /\$100/);

  const currParen = renderMathText('Costs are ($50) and revenue is ($100).');
  assert.doesNotMatch(currParen, /class="katex"/);
  assert.match(currParen, /\(\$50\)/);
  assert.match(currParen, /\(\$100\)/);

  // HTML escaping for safety
  const xss = renderMathText('<script>alert("xss")</script>');
  assert.doesNotMatch(xss, /<script>/);
  assert.match(xss, /&lt;script&gt;/);
});

test('Typescript compiler check (npx tsc --noEmit)', async () => {
  const { execSync } = await import('node:child_process');
  const stdout = execSync('npx tsc --noEmit', { encoding: 'utf8' });
  assert.equal(stdout.trim(), '');
});

// ---------------------------------------------------------------------------
// Mock exams
// ---------------------------------------------------------------------------

const MOCK_THEMES = Array.from({ length: 12 }, (_, i) => `Theme ${i + 1}`);

function makeExam(overrides = {}) {
  return {
    id: 'exam-1',
    subject: 'Quantitative Methods',
    title: 'Mock Exam',
    after_theme: 4,
    source_themes: ['Theme 1', 'Theme 2'],
    question_count: 25,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// Small deterministic PRNG (mulberry32) so shuffles are reproducible.
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makePool(perTheme) {
  const out = [];
  for (const [theme, n] of Object.entries(perTheme)) {
    for (let i = 0; i < n; i += 1) out.push({ id: `${theme}#${i}`, theme });
  }
  return out;
}

function outlineLabels(outline) {
  return outline.map((item) => (item.kind === 'theme' ? item.theme : `mock:${item.exam.id}`));
}

async function withCleanMockCaches(fn) {
  const { updateMockExamsCache, updateCustomThemeTitlesCache } = await import('../src/constants.ts');
  try {
    await fn();
  } finally {
    updateMockExamsCache([]);
    updateCustomThemeTitlesCache({});
  }
}

test('getSubjectOutline: no mock exams gives exactly the 12 themes', async () => {
  await withCleanMockCaches(async () => {
    const { getSubjectOutline } = await import('../src/constants.ts');
    const outline = getSubjectOutline('Quantitative Methods');
    assert.equal(outline.length, 12);
    assert.deepEqual(outlineLabels(outline), MOCK_THEMES);
    assert.ok(outline.every((item) => item.kind === 'theme'));
  });
});

test('getSubjectOutline: exams are placed by after_theme', async () => {
  await withCleanMockCaches(async () => {
    const { getSubjectOutline, updateMockExamsCache } = await import('../src/constants.ts');

    updateMockExamsCache([makeExam({ id: 'first', after_theme: 0 })]);
    let labels = outlineLabels(getSubjectOutline('Quantitative Methods'));
    assert.equal(labels.length, 13);
    assert.equal(labels[0], 'mock:first');
    assert.equal(labels[1], 'Theme 1');

    updateMockExamsCache([makeExam({ id: 'mid', after_theme: 4 })]);
    labels = outlineLabels(getSubjectOutline('Quantitative Methods'));
    assert.equal(labels.indexOf('mock:mid'), 4);
    assert.equal(labels[3], 'Theme 4');
    assert.equal(labels[5], 'Theme 5');

    updateMockExamsCache([makeExam({ id: 'last', after_theme: 12 })]);
    labels = outlineLabels(getSubjectOutline('Quantitative Methods'));
    assert.equal(labels.length, 13);
    assert.equal(labels[12], 'mock:last');
    assert.equal(labels[11], 'Theme 12');
  });
});

test('getSubjectOutline: several exams at one position keep creation order', async () => {
  await withCleanMockCaches(async () => {
    const { getSubjectOutline, updateMockExamsCache } = await import('../src/constants.ts');
    updateMockExamsCache([
      makeExam({ id: 'c', after_theme: 4, created_at: '2026-03-01T00:00:00.000Z' }),
      makeExam({ id: 'b', after_theme: 4, created_at: '2026-02-01T00:00:00.000Z' }),
      // Same timestamp as 'b': id breaks the tie.
      makeExam({ id: 'a', after_theme: 4, created_at: '2026-02-01T00:00:00.000Z' }),
    ]);
    const labels = outlineLabels(getSubjectOutline('Quantitative Methods'));
    assert.deepEqual(labels.slice(3, 8), ['Theme 4', 'mock:a', 'mock:b', 'mock:c', 'Theme 5']);
  });
});

test('getSubjectOutline: exams for another subject never leak', async () => {
  await withCleanMockCaches(async () => {
    const { getSubjectOutline, getMockExams, updateMockExamsCache } = await import('../src/constants.ts');
    updateMockExamsCache([
      makeExam({ id: 'qm', subject: 'Quantitative Methods', after_theme: 2 }),
      makeExam({ id: 'fa', subject: 'Financial Accounting', after_theme: 3 }),
    ]);
    const qm = outlineLabels(getSubjectOutline('Quantitative Methods'));
    assert.ok(qm.includes('mock:qm'));
    assert.ok(!qm.includes('mock:fa'));
    const fa = outlineLabels(getSubjectOutline('Financial Accounting'));
    assert.ok(fa.includes('mock:fa'));
    assert.ok(!fa.includes('mock:qm'));
    assert.equal(getSubjectOutline('Understanding Finance').length, 12);
    assert.deepEqual(getMockExams(undefined), []);
  });
});

test('getSubjectOutline: out-of-range after_theme still appears at the end', async () => {
  await withCleanMockCaches(async () => {
    const { getSubjectOutline, updateMockExamsCache } = await import('../src/constants.ts');
    updateMockExamsCache([
      makeExam({ id: 'big', after_theme: 99 }),
      makeExam({ id: 'neg', after_theme: -3, created_at: '2026-01-02T00:00:00.000Z' }),
    ]);
    const labels = outlineLabels(getSubjectOutline('Quantitative Methods'));
    assert.equal(labels.length, 14);
    assert.deepEqual(labels.slice(0, 12), MOCK_THEMES);
    assert.deepEqual([...labels.slice(12)].sort(), ['mock:big', 'mock:neg']);
  });
});

test('getSubjectOutline: custom theme titles still flow through', async () => {
  await withCleanMockCaches(async () => {
    const { getSubjectOutline, updateMockExamsCache, updateCustomThemeTitlesCache } = await import(
      '../src/constants.ts'
    );
    updateCustomThemeTitlesCache({ 'Quantitative Methods': { 'Theme 2': 'Algebra' } });
    updateMockExamsCache([makeExam({ id: 'm', after_theme: 2 })]);
    const outline = getSubjectOutline('Quantitative Methods');
    const theme2 = outline.find((item) => item.kind === 'theme' && item.theme === 'Theme 2');
    assert.equal(theme2.title, 'Algebra');
    assert.equal(theme2.hasCustomTitle, true);
    assert.equal(theme2.themeNumber, 2);
    const theme1 = outline.find((item) => item.kind === 'theme' && item.theme === 'Theme 1');
    assert.equal(theme1.title, 'Theme 1');
    assert.equal(theme1.hasCustomTitle, false);
    assert.equal(outline[1].kind, 'theme');
    assert.equal(outline[2].kind, 'mock');
    assert.equal(outline[2].exam.id, 'm');
  });
});

test('normalizeMockExamInput: accepts and cleans valid input', async () => {
  const { normalizeMockExamInput } = await import('../src/mockExam.ts');
  const res = normalizeMockExamInput(
    {
      title: '   Midterm \t  Mock\n Exam  ',
      after_theme: 4,
      source_themes: ['Theme 3', 'Theme 1', 'Theme 3', 'Theme 2'],
      question_count: 30,
    },
    MOCK_THEMES,
  );
  assert.equal(res.ok, true);
  assert.deepEqual(res.value, {
    title: 'Midterm Mock Exam',
    after_theme: 4,
    source_themes: ['Theme 1', 'Theme 2', 'Theme 3'],
    question_count: 30,
  });
});

test('normalizeMockExamInput: title rules', async () => {
  const { normalizeMockExamInput, MOCK_EXAM_TITLE_MAX } = await import('../src/mockExam.ts');
  const base = { after_theme: 1, source_themes: ['Theme 1'], question_count: 10 };
  for (const title of ['', '   ', '\n\t', undefined, null, 42]) {
    assert.equal(normalizeMockExamInput({ ...base, title }, MOCK_THEMES).ok, false, `title ${String(title)}`);
  }
  assert.equal(normalizeMockExamInput({ ...base, title: 'x'.repeat(MOCK_EXAM_TITLE_MAX) }, MOCK_THEMES).ok, true);
  assert.equal(normalizeMockExamInput({ ...base, title: 'x'.repeat(MOCK_EXAM_TITLE_MAX + 1) }, MOCK_THEMES).ok, false);
  // Length is measured after whitespace is collapsed and trimmed.
  const padded = `  ${'x'.repeat(MOCK_EXAM_TITLE_MAX)}  `;
  assert.equal(normalizeMockExamInput({ ...base, title: padded }, MOCK_THEMES).ok, true);
  const collapsed = `${'x'.repeat(40)}${' '.repeat(50)}${'y'.repeat(30)}`;
  const res = normalizeMockExamInput({ ...base, title: collapsed }, MOCK_THEMES);
  assert.equal(res.ok, true);
  assert.equal(res.value.title.length, 71);
});

test('normalizeMockExamInput: after_theme rules', async () => {
  const { normalizeMockExamInput } = await import('../src/mockExam.ts');
  const base = { title: 'Mock', source_themes: ['Theme 1'], question_count: 10 };
  for (const after_theme of [0, 1, 12, '0', '7', '12']) {
    assert.equal(normalizeMockExamInput({ ...base, after_theme }, MOCK_THEMES).ok, true, `after ${after_theme}`);
  }
  const seven = normalizeMockExamInput({ ...base, after_theme: '7' }, MOCK_THEMES);
  assert.equal(seven.value.after_theme, 7);
  for (const after_theme of [-1, 13, 1.5, NaN, Infinity, 'abc', undefined]) {
    assert.equal(normalizeMockExamInput({ ...base, after_theme }, MOCK_THEMES).ok, false, `after ${after_theme}`);
  }
});

test('normalizeMockExamInput: source_themes rules', async () => {
  const { normalizeMockExamInput } = await import('../src/mockExam.ts');
  const base = { title: 'Mock', after_theme: 1, question_count: 10 };
  assert.equal(normalizeMockExamInput({ ...base, source_themes: [] }, MOCK_THEMES).ok, false);
  assert.equal(normalizeMockExamInput({ ...base, source_themes: undefined }, MOCK_THEMES).ok, false);
  assert.equal(normalizeMockExamInput({ ...base, source_themes: 'Theme 1' }, MOCK_THEMES).ok, false);
  assert.equal(normalizeMockExamInput({ ...base, source_themes: ['Theme 13'] }, MOCK_THEMES).ok, false);
  assert.equal(normalizeMockExamInput({ ...base, source_themes: ['theme 1'] }, MOCK_THEMES).ok, false);
  // Unknown entries are dropped as long as something valid remains.
  const mixed = normalizeMockExamInput({ ...base, source_themes: ['Theme 99', 'Theme 12', 'Theme 2'] }, MOCK_THEMES);
  assert.equal(mixed.ok, true);
  assert.deepEqual(mixed.value.source_themes, ['Theme 2', 'Theme 12']);
  // Syllabus order, not lexicographic order (Theme 10 after Theme 9).
  const ordered = normalizeMockExamInput(
    { ...base, source_themes: ['Theme 10', 'Theme 9', 'Theme 1', 'Theme 10'] },
    MOCK_THEMES,
  );
  assert.deepEqual(ordered.value.source_themes, ['Theme 1', 'Theme 9', 'Theme 10']);
});

test('normalizeMockExamInput: question_count bounds', async () => {
  const { normalizeMockExamInput, MOCK_EXAM_MIN_QUESTIONS, MOCK_EXAM_MAX_QUESTIONS } = await import(
    '../src/mockExam.ts'
  );
  assert.equal(MOCK_EXAM_MIN_QUESTIONS, 5);
  assert.equal(MOCK_EXAM_MAX_QUESTIONS, 100);
  const base = { title: 'Mock', after_theme: 1, source_themes: ['Theme 1'] };
  const check = (question_count) => normalizeMockExamInput({ ...base, question_count }, MOCK_THEMES);
  for (const n of [5, 25, 100, '5', '25', '100', ' 40 ']) {
    assert.equal(check(n).ok, true, `count ${n}`);
  }
  assert.equal(check('25').value.question_count, 25);
  for (const n of [4, 101, 0, -5, 25.5, NaN, Infinity, '4', '101', '25.5', 'abc', undefined]) {
    assert.equal(check(n).ok, false, `count ${n}`);
  }
  // Number('') is 0, which is below the minimum.
  assert.equal(check('').ok, false);
});

test('normalizeMockExamInput: failures carry a readable error', async () => {
  const { normalizeMockExamInput } = await import('../src/mockExam.ts');
  const res = normalizeMockExamInput({ title: '', after_theme: 1, source_themes: ['Theme 1'], question_count: 10 }, MOCK_THEMES);
  assert.equal(res.ok, false);
  assert.equal(typeof res.error, 'string');
  assert.ok(res.error.length > 0);
});

test('pickBalancedQuestions: exact count, no duplicates, no mutation', async () => {
  const { pickBalancedQuestions } = await import('../src/mockExam.ts');
  const pool = makePool({ 'Theme 1': 20, 'Theme 2': 20, 'Theme 3': 20 });
  const snapshot = JSON.stringify(pool);
  const picked = pickBalancedQuestions(pool, 25, seededRandom(1));
  assert.equal(picked.length, 25);
  assert.equal(new Set(picked.map((q) => q.id)).size, 25);
  assert.equal(JSON.stringify(pool), snapshot, 'input array and items untouched');
  for (const q of picked) assert.ok(pool.includes(q), 'returns the original question objects');
});

test('pickBalancedQuestions: spreads evenly across themes', async () => {
  const { pickBalancedQuestions } = await import('../src/mockExam.ts');
  const pool = makePool({ 'Theme 1': 30, 'Theme 2': 30, 'Theme 3': 30, 'Theme 4': 30 });
  for (const [count, seed] of [[25, 3], [26, 4], [27, 5], [10, 6], [100, 7]]) {
    const picked = pickBalancedQuestions(pool, count, seededRandom(seed));
    assert.equal(picked.length, count);
    const tally = {};
    for (const q of picked) tally[q.theme] = (tally[q.theme] ?? 0) + 1;
    const counts = Object.values(tally);
    assert.equal(counts.length, 4, `all themes represented for count ${count}`);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `count ${count}: ${JSON.stringify(tally)}`);
  }
});

test('pickBalancedQuestions: small pools are exhausted and the rest comes from larger ones', async () => {
  const { pickBalancedQuestions } = await import('../src/mockExam.ts');
  const pool = makePool({ 'Theme 1': 2, 'Theme 2': 50, 'Theme 3': 50 });
  const picked = pickBalancedQuestions(pool, 20, seededRandom(11));
  assert.equal(picked.length, 20);
  assert.equal(new Set(picked.map((q) => q.id)).size, 20);
  const tally = {};
  for (const q of picked) tally[q.theme] = (tally[q.theme] ?? 0) + 1;
  assert.equal(tally['Theme 1'], 2);
  assert.equal(tally['Theme 2'] + tally['Theme 3'], 18);
  assert.ok(Math.abs(tally['Theme 2'] - tally['Theme 3']) <= 1);
});

test('pickBalancedQuestions: returns the whole pool when it is smaller than count', async () => {
  const { pickBalancedQuestions } = await import('../src/mockExam.ts');
  const pool = makePool({ 'Theme 1': 3, 'Theme 2': 4 });
  const picked = pickBalancedQuestions(pool, 25, seededRandom(2));
  assert.equal(picked.length, 7);
  assert.deepEqual(
    picked.map((q) => q.id).sort(),
    pool.map((q) => q.id).sort(),
  );
  assert.deepEqual(pickBalancedQuestions([], 10, seededRandom(2)), []);
  assert.deepEqual(pickBalancedQuestions(pool, 0, seededRandom(2)), []);
});

test('pickBalancedQuestions: is deterministic for a seed and result is shuffled', async () => {
  const { pickBalancedQuestions } = await import('../src/mockExam.ts');
  const pool = makePool({ 'Theme 1': 20, 'Theme 2': 20, 'Theme 3': 20 });
  const a = pickBalancedQuestions(pool, 24, seededRandom(42));
  const b = pickBalancedQuestions(pool, 24, seededRandom(42));
  assert.deepEqual(a.map((q) => q.id), b.map((q) => q.id));

  // Not grouped by theme: across several seeds, themes interleave (more than 3 theme "runs").
  let interleaved = 0;
  for (let seed = 1; seed <= 10; seed += 1) {
    const picked = pickBalancedQuestions(pool, 24, seededRandom(seed));
    let runs = 1;
    for (let i = 1; i < picked.length; i += 1) if (picked[i].theme !== picked[i - 1].theme) runs += 1;
    if (runs > 3) interleaved += 1;
  }
  assert.equal(interleaved, 10);

  // Different seeds give different orders.
  const c = pickBalancedQuestions(pool, 24, seededRandom(43));
  assert.notDeepEqual(a.map((q) => q.id), c.map((q) => q.id));
});

test('describeCoverage: labels the themes an exam covers', async () => {
  const { describeCoverage } = await import('../src/mockExam.ts');
  assert.equal(describeCoverage([]), '');
  assert.equal(describeCoverage(['Theme 7']), 'Theme 7');
  assert.equal(describeCoverage(['Theme 1', 'Theme 2', 'Theme 3', 'Theme 4']), 'Themes 1–4');
  assert.equal(describeCoverage(['Theme 1', 'Theme 2']), 'Themes 1, 2');
  assert.equal(describeCoverage(['Theme 1', 'Theme 3', 'Theme 5']), 'Themes 1, 3, 5');
  assert.equal(describeCoverage(['Theme 1', 'Theme 2', 'Theme 3', 'Theme 6', 'Theme 7', 'Theme 8']), 'Themes 1–3, 6–8');
  assert.equal(describeCoverage(['Theme 1', 'Theme 2', 'Theme 3', 'Theme 5', 'Theme 6']), 'Themes 1–3, 5, 6');
  assert.equal(describeCoverage(['Theme 4', 'Theme 2', 'Theme 3', 'Theme 2', 'Theme 1']), 'Themes 1–4');
  assert.equal(describeCoverage(['Theme 3', 'Theme 3']), 'Theme 3');
  assert.equal(describeCoverage(['Theme 10', 'Theme 9', 'Theme 2']), 'Themes 2, 9, 10');
  assert.equal(describeCoverage(['Theme 11', 'Theme 12', 'Theme 10', 'Theme 1']), 'Themes 1, 10–12');
  assert.equal(
    describeCoverage(Array.from({ length: 12 }, (_, i) => `Theme ${12 - i}`)),
    'Themes 1–12',
  );
});

test('Mock exam migration (0008) exists and is locked down', () => {
  const path = 'supabase/migrations/0008_mock_exams.sql';
  assert.ok(fs.existsSync(path), `${path} exists`);
  const sql = fs.readFileSync(path, 'utf8');
  for (let i = 1; i <= 12; i += 1) {
    assert.ok(sql.includes(`'Theme ${i}'`), `mentions 'Theme ${i}'`);
  }
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /is_admin\(\)/);
  assert.match(sql, /create table if not exists public\.mock_exams/i);
});
