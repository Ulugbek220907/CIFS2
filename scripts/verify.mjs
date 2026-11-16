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
  assert.equal(subjectShortName('Math for Eco'), 'MfE');
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
  assert.equal(subjects.length, 15, 'Total 15 subjects (6 CIFS + 6 Level 4 + 3 Level 5)');
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
  assert.match(css, /body\.quiz-fullscreen \.ornament-strip\s*\{\s*display:\s*none !important;/);
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
  // Themes are optional: an exam may be made only of its own questions.
  for (const empty of [[], undefined, 'Theme 1', ['Theme 13'], ['theme 1']]) {
    const res = normalizeMockExamInput({ ...base, source_themes: empty }, MOCK_THEMES);
    assert.equal(res.ok, true, `no valid themes from ${JSON.stringify(empty)} is allowed`);
    assert.deepEqual(res.value.source_themes, []);
  }
  // Unknown entries are dropped.
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


test('pickMockQuestions: own questions first, themes fill the rest', async () => {
  const { pickMockQuestions } = await import('../src/mockExam.ts');
  const own = Array.from({ length: 6 }, (_, i) => ({ id: `own-${i}`, theme: null, mock_exam_id: 'exam-1' }));
  const themed = ['Theme 1', 'Theme 2', 'Theme 3'].flatMap((theme) =>
    Array.from({ length: 20 }, (_, i) => ({ id: `${theme}-${i}`, theme })),
  );
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // Fewer own questions than slots: every own question appears, the rest come evenly from the themes.
  const mixed = pickMockQuestions([...own, ...themed], 15, rng);
  assert.equal(mixed.length, 15);
  assert.equal(new Set(mixed.map((q) => q.id)).size, 15, 'no duplicates');
  assert.equal(mixed.filter((q) => q.mock_exam_id).length, 6, 'all own questions are included');
  const perTheme = {};
  for (const q of mixed.filter((q) => !q.mock_exam_id)) perTheme[q.theme] = (perTheme[q.theme] ?? 0) + 1;
  assert.deepEqual(Object.values(perTheme).sort(), [3, 3, 3], 'remaining 9 slots spread evenly over 3 themes');

  // At least as many own questions as slots: the exam is made of own questions only.
  const ownOnly = pickMockQuestions([...own, ...themed], 4, rng);
  assert.equal(ownOnly.length, 4);
  assert.ok(ownOnly.every((q) => q.mock_exam_id === 'exam-1'));

  // No themes at all: just the own questions, even if that is fewer than asked for.
  assert.equal(pickMockQuestions(own, 25, rng).length, 6);
  // No own questions: behaves like the balanced theme sampler.
  assert.equal(pickMockQuestions(themed, 25, rng).length, 25);
  // Input is not mutated.
  const snapshot = JSON.stringify(own);
  pickMockQuestions(own, 3, rng);
  assert.equal(JSON.stringify(own), snapshot);
});

test('Mock exam question migration (0009) links questions to exams safely', () => {
  const path = 'supabase/migrations/0009_mock_exam_questions.sql';
  assert.ok(fs.existsSync(path), `${path} exists`);
  const sql = fs.readFileSync(path, 'utf8');
  assert.match(sql, /add column if not exists mock_exam_id uuid references public\.mock_exams \(id\) on delete cascade/i);
  assert.match(sql, /alter column theme drop not null/i);
  assert.match(sql, /\(theme is null\) <> \(mock_exam_id is null\)/, 'a question has exactly one of theme / mock exam');
});

test('is_admin() is never loosened to "any signed-in user" in any migration', () => {
  const dir = 'supabase/migrations';
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.sql'))) {
    const sql = fs.readFileSync(`${dir}/${file}`, 'utf8');
    if (!/function public\.is_admin\(\)/.test(sql)) continue;
    assert.doesNotMatch(sql, /auth\.uid\(\) is not null/i, `${file} must not treat every signed-in user as admin`);
  }
  const strict = fs.readFileSync(`${dir}/0010_restore_strict_is_admin.sql`, 'utf8');
  assert.match(strict, /app_metadata'? ->> 'role'\) = 'admin'/);
  assert.match(strict, /ulugbekisoqov22@gmail\.com/);
});


test('Level 5: Econometrics is a subject under Level 5, and levels map correctly', async () => {
  const { level5Subjects, subjects, getSubjectLevel, subjectShortName } = await import('../src/constants.ts');
  assert.deepEqual(level5Subjects, ['Econometrics', 'Management Accounting', 'Intermediate Microeconomics']);
  assert.ok(subjects.includes('Econometrics'));
  assert.equal(subjectShortName('Econometrics'), 'EM');
  assert.equal(subjectShortName('Management Accounting'), 'MA');
  assert.equal(subjectShortName('Intermediate Microeconomics'), 'IM');
  assert.equal(getSubjectLevel('Intermediate Microeconomics'), 'Level 5');
  assert.ok(subjects.includes('Intermediate Microeconomics'));
  assert.equal(getSubjectLevel('Management Accounting'), 'Level 5');
  assert.ok(subjects.includes('Management Accounting'));
  assert.equal(getSubjectLevel('Econometrics'), 'Level 5');
  assert.equal(getSubjectLevel('Math for Eco'), 'Level 4');
  assert.equal(getSubjectLevel('Quantitative Methods'), 'CIFS');
  assert.equal(getSubjectLevel('Foundations of Economics'), 'CIFS');
});

test('normalizeNotesUrl: only clean https links get through', async () => {
  const { normalizeNotesUrl, NOTES_URL_MAX } = await import('../src/notesLink.ts');
  // blank removes the link
  for (const blank of ['', '   ', undefined, null]) {
    assert.deepEqual(normalizeNotesUrl(blank), { ok: true, value: '' });
  }
  // https kept, bare domain gets https://, surrounding space trimmed
  assert.equal(normalizeNotesUrl('https://www.notion.so/Lecture-1-abc123').value, 'https://www.notion.so/Lecture-1-abc123');
  assert.equal(normalizeNotesUrl('  notion.so/Lecture-1-abc123 ').value, 'https://notion.so/Lecture-1-abc123');
  assert.equal(normalizeNotesUrl('https://x.notion.site/Page?pvs=4#heading').value, 'https://x.notion.site/Page?pvs=4#heading');
  // everything that could run script or leave https is refused
  for (const bad of [
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>1</script>', 'http://notion.so/page',
    'ftp://notion.so/x', 'vbscript:x', '//evil.com', 'https://', 'https://localhost', 'not a link',
    'https://user:pass@notion.so/x', 'https://notion.so/with space',
  ]) {
    assert.equal(normalizeNotesUrl(bad).ok, false, `${bad} must be refused`);
  }
  assert.equal(normalizeNotesUrl(`https://notion.so/${'a'.repeat(NOTES_URL_MAX)}`).ok, false, 'too long');
  assert.equal(normalizeNotesUrl(12345).ok, true, 'non-strings count as blank');
});

test('getSubjectThemes carries the lecture notes link for each theme', async () => {
  const { getSubjectThemes, getSubjectOutline, updateThemeNotesCache, getThemeNotesUrl } = await import('../src/constants.ts');
  try {
    updateThemeNotesCache({ 'Math for Eco': { 'Theme 2': 'https://notion.so/lecture-2' } });
    const themes = getSubjectThemes('Math for Eco');
    assert.equal(themes[0].notesUrl, '');
    assert.equal(themes[1].notesUrl, 'https://notion.so/lecture-2');
    assert.equal(getThemeNotesUrl('Math for Eco', 'Theme 2'), 'https://notion.so/lecture-2');
    // other subjects never see it
    assert.equal(getSubjectThemes('Econometrics')[1].notesUrl, '');
    const outline = getSubjectOutline('Math for Eco').filter((item) => item.kind === 'theme');
    assert.equal(outline[1].notesUrl, 'https://notion.so/lecture-2');
  } finally {
    updateThemeNotesCache({});
  }
});

test('Migration 0011 adds Econometrics everywhere subjects are enforced, plus theme_notes', () => {
  const path = 'supabase/migrations/0011_level5_and_theme_notes.sql';
  assert.ok(fs.existsSync(path), `${path} exists`);
  const sql = fs.readFileSync(path, 'utf8');
  for (const table of ['questions', 'results', 'site_analytics', 'mock_exams']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} add constraint ${table}_subject_check`), `${table} subject check updated`);
  }
  assert.equal((sql.match(/^\s+'Econometrics'$/gm) ?? []).length, 4, 'Econometrics added to all four lists');
  assert.match(sql, /create table if not exists public\.theme_notes/i);
  assert.match(sql, /url ~ '\^https:\/\/\[\^\[:space:\]\]\+\$'/, 'https-only check on the url');
  assert.match(sql, /enable row level security/i);
  assert.equal((sql.match(/public\.is_admin\(\)/g) ?? []).length, 4, 'insert/update(x2)/delete are admin only');
});

test('ocean simulation: ripples spread, fade out, and never blow up', async () => {
  const { createGrid, addImpulse, stepWave, gridEnergy } = await import('../src/oceanSim.ts');
  const grid = createGrid(60, 40);
  assert.equal(gridEnergy(grid), 0, 'a flat sea has no energy');

  addImpulse(grid, 30, 20, 3, 1);
  const fresh = gridEnergy(grid);
  assert.ok(fresh > 0, 'the impulse adds energy');

  // The disturbance travels outwards: a cell ~10 cells away stays flat at first, then moves.
  const far = 20 * 60 + 40;
  assert.equal(grid.h[far], 0);
  let moved = false;
  for (let i = 0; i < 80; i += 1) {
    stepWave(grid);
    if (Math.abs(grid.h[far]) > 1e-4) moved = true;
    for (const value of grid.h) assert.ok(Number.isFinite(value) && Math.abs(value) <= 3, 'heights stay finite and clamped');
  }
  assert.ok(moved, 'the ripple reaches distant cells');

  for (let i = 0; i < 1500; i += 1) stepWave(grid);
  assert.ok(gridEnergy(grid) < fresh * 0.01, 'ripples fade away (damping works)');

  // Edges never move.
  const edgeGrid = createGrid(20, 12);
  addImpulse(edgeGrid, 10, 6, 5, 2);
  for (let i = 0; i < 200; i += 1) stepWave(edgeGrid);
  for (let x = 0; x < 20; x += 1) {
    assert.equal(edgeGrid.h[x], 0, 'top edge stays flat');
    assert.equal(edgeGrid.h[11 * 20 + x], 0, 'bottom edge stays flat');
  }
});

test('ocean simulation: impulses near or outside the edge are safe', async () => {
  const { createGrid, addImpulse, stepWave } = await import('../src/oceanSim.ts');
  const grid = createGrid(10, 8);
  for (const [x, y] of [[-50, -50], [500, 3], [4, 900], [0, 0], [9, 7], [Number.NaN, 2]]) {
    assert.doesNotThrow(() => addImpulse(grid, x, y, 4, 1));
  }
  assert.doesNotThrow(() => { for (let i = 0; i < 50; i += 1) stepWave(grid, 5, 1.5); }, 'out-of-range speed is clamped');
  assert.equal(grid.h.length, 80);
  assert.ok([...grid.h].every((v) => Number.isFinite(v)), 'no NaN leaks into the grid');
});

test('ocean swell and glyph mapping stay in range', async () => {
  const { swell, glyphIndex, OCEAN_GLYPHS } = await import('../src/oceanSim.ts');
  for (let x = -200; x <= 2200; x += 97) {
    for (let y = -200; y <= 1400; y += 89) {
      for (const t of [0, 1.3, 9.7, 1234.5]) {
        const s = swell(x, y, t);
        assert.ok(s >= -1.0001 && s <= 1.0001, `swell ${s} within -1..1`);
      }
    }
  }
  assert.equal(glyphIndex(0), 0);
  assert.equal(glyphIndex(1), OCEAN_GLYPHS.length - 1);
  assert.equal(glyphIndex(-5), 0);
  assert.equal(glyphIndex(7), OCEAN_GLYPHS.length - 1);
  assert.equal(glyphIndex(Number.NaN), 0);
  let previous = -1;
  for (let level = 0; level <= 1; level += 0.01) {
    const index = glyphIndex(level);
    assert.ok(index >= previous, 'denser glyphs for higher levels');
    previous = index;
  }
  assert.equal(new Set(OCEAN_GLYPHS).size, OCEAN_GLYPHS.length, 'no duplicate glyphs');
  const have = new Set(OCEAN_GLYPHS);
  for (const group of ['0123456789', 'abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '!@#$%^&*()_+-=[]{};:\'",.<>/?\\|`~']) {
    for (const ch of group) assert.ok(have.has(ch), `the ocean uses "${ch}"`);
  }
  assert.equal(OCEAN_GLYPHS.length, 94, 'all 94 printable ASCII characters (no space)');
  // The ends of the ramp are visually light vs heavy.
  assert.ok(['.', '`', "'", ','].includes(OCEAN_GLYPHS[0]) || OCEAN_GLYPHS.indexOf('.') < 3, 'faintest characters first');
  assert.ok(OCEAN_GLYPHS.slice(-6).includes('@') && OCEAN_GLYPHS.slice(-6).includes('W'), 'heaviest characters last');
});

test('ocean swell: the precomputed per-cell version equals the plain formula', async () => {
  const { swell, createSwellField, swellClock, swellAtCell } = await import('../src/oceanSim.ts');
  const cols = 40;
  const rows = 25;
  const cell = 17;
  const field = createSwellField(cols, rows, cell);
  let worst = 0;
  for (const t of [0, 0.37, 4.2, 99.9, 1234.567]) {
    const clock = swellClock(t);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = col * cell + cell / 2;
        const y = row * cell + cell / 2;
        worst = Math.max(worst, Math.abs(swellAtCell(field, clock, row, row * cols + col) - swell(x, y, t)));
      }
    }
  }
  assert.ok(worst < 1e-4, `largest difference ${worst}`);
});

test('Migration 0012 adds Management Accounting to every subject check', () => {
  const sql = fs.readFileSync('supabase/migrations/0012_management_accounting.sql', 'utf8');
  for (const table of ['questions', 'results', 'site_analytics', 'mock_exams']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} add constraint ${table}_subject_check`), `${table} updated`);
  }
  assert.equal((sql.match(/^\s+'Management Accounting'$/gm) ?? []).length, 4, 'added to all four lists');
  assert.equal((sql.match(/^\s+'Econometrics',?$/gm) ?? []).length, 4, 'Econometrics kept in all four lists');
});

test('Ornament strips frame the page top and bottom and use the bundled SVG tile', () => {
  const app = fs.readFileSync('src/app.ts', 'utf8');
  assert.equal((app.match(/class="ornament-strip/g) ?? []).length, 2, 'one strip above the header, one below the footer');
  assert.ok(app.indexOf('ornament-strip"') < app.indexOf('site-header'), 'top strip comes before the header');
  assert.ok(app.indexOf('ornament-strip ornament-strip-end') > app.indexOf('</footer>'), 'bottom strip comes after the footer');
  const css = fs.readFileSync('src/styles.css', 'utf8');
  assert.match(css, /\.ornament-strip::before[\s\S]*?mask:\s*url\('\.\/assets\/ornament-band\.svg'\)/);
  const svg = fs.readFileSync('src/assets/ornament-band.svg', 'utf8');
  assert.match(svg, /<svg[^>]*viewBox="0 0 64 20"/);
  assert.ok(!/<script|href=|http:\/\/(?!www\.w3\.org)/i.test(svg), 'tile is plain shapes only');
});

test('Migration 0013 adds Intermediate Microeconomics and keeps every earlier subject in all four checks', async () => {
  const { subjects } = await import('../src/constants.ts');
  const sql = fs.readFileSync('supabase/migrations/0013_intermediate_microeconomics.sql', 'utf8');
  for (const table of ['questions', 'results', 'site_analytics', 'mock_exams']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} add constraint ${table}_subject_check`), `${table} updated`);
  }
  // Every subject the app knows (plus the legacy IBE name) must be allowed by all four checks.
  for (const name of [...subjects, 'Foundations of Economics']) {
    const lines = sql.split('\n').filter((line) => line.trim().replace(/,$/, '') === `'${name}'`);
    assert.equal(lines.length, 4, `${name} is in all four lists`);
  }
  assert.equal((sql.match(/^\s+'Intermediate Microeconomics'$/gm) ?? []).length, 4, 'new subject is the last entry of all four lists');
});

// ---------------------------------------------------------------------------------------------------------------------
// Academic Communication Skills (ACS)
// ---------------------------------------------------------------------------------------------------------------------
test('ACS: normalizeAcsRows always returns exactly 8 clean Listening items', async () => {
  const { normalizeAcsRows, ACS_SLOTS, ACS_KINDS } = await import('../src/acsModel.ts');
  assert.deepEqual([...ACS_KINDS], ['listening'], 'Argumentation Preparation is gone: one section only');
  const empty = normalizeAcsRows(undefined);
  assert.equal(empty.length, ACS_SLOTS);
  assert.deepEqual(empty.map((item) => item.position), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(empty.every((item) => item.kind === 'listening'));

  const rows = normalizeAcsRows([
    { kind: 'listening', position: 2, title: '  Trade  ', audio_path: 'listening/2-abc.mp3', audio_name: 'a.mp3', audio_size: 10, arguments: [' one ', '', 5, 'two'] },
    { kind: 'argumentation', position: 3, title: 'Old section row', arguments: ['ignored'] },
    { kind: 'listening', position: 9, title: 'out of range' },
    { kind: 'nonsense', position: 1 },
    null,
    'text',
  ]);
  assert.equal(rows.length, 8);
  const l2 = rows.find((item) => item.position === 2);
  assert.equal(l2.title, 'Trade', 'titles are trimmed');
  assert.equal(l2.audio_path, 'listening/2-abc.mp3');
  assert.deepEqual(l2.arguments, ['one', 'two'], 'a listening can now hold arguments: blank and non-text ones are dropped, text is trimmed');
  const l3 = rows.find((item) => item.position === 3);
  assert.equal(l3.title, '', 'a row of the removed Argumentation section is ignored, not shown');
  assert.deepEqual(l3.arguments, []);
});

test('ACS: only audio paths this app creates are ever used', async () => {
  const { isSafeAudioPath, normalizeAcsRows } = await import('../src/acsModel.ts');
  for (const good of ['listening/1-abc123.mp3', 'listening/8-k2j9x.m4a']) assert.equal(isSafeAudioPath(good), true, good);
  for (const bad of ['../evil.mp3', 'listening/../x.mp3', 'http://evil.example/x.mp3', 'listening/', '/listening/1-a.mp3', 'listening/A B.mp3', null, 5, 'argumentation/1-a.mp3', 'listening/' + 'a'.repeat(130)]) {
    assert.equal(isSafeAudioPath(bad), false, String(bad));
  }
  const row = normalizeAcsRows([{ kind: 'listening', position: 1, audio_path: 'javascript:alert(1)' }]).find((item) => item.kind === 'listening' && item.position === 1);
  assert.equal(row.audio_path, null, 'an unsafe stored path is discarded');
});

test('ACS: labels and status chips', async () => {
  const { acsSlotLabel, acsFullLabel, acsItemStatus, blankAcsItem, acsItemHasContent } = await import('../src/acsModel.ts');
  assert.equal(acsSlotLabel('listening', 3), 'Listening 3');
  assert.equal(acsFullLabel({ ...blankAcsItem('listening', 3), title: 'Trade' }), 'Listening 3: Trade');
  assert.equal(acsFullLabel({ ...blankAcsItem('listening', 3), title: '   ' }), 'Listening 3');
  assert.equal(acsItemStatus(blankAcsItem('listening', 1)), 'Coming soon');
  assert.equal(acsItemStatus({ ...blankAcsItem('listening', 1), audio_path: 'listening/1-a.mp3' }), 'Audio ready');
  assert.equal(acsItemStatus({ ...blankAcsItem('listening', 1), arguments: ['a'] }), '1 argument');
  assert.equal(acsItemStatus({ ...blankAcsItem('listening', 1), arguments: ['a', 'b', 'c'] }), '3 arguments');
  assert.equal(acsItemStatus({ ...blankAcsItem('listening', 1), audio_path: 'listening/1-a.mp3', arguments: ['a'] }), 'Audio ready');
  assert.equal(acsItemHasContent(blankAcsItem('listening', 1)), false);
  assert.equal(acsItemHasContent({ ...blankAcsItem('listening', 1), arguments: ['a'] }), true);
});

test('ACS: audio file checks and upload paths', async () => {
  const { checkAudioFile, buildAudioPath, isSafeAudioPath, ACS_AUDIO_MAX_BYTES, formatBytes } = await import('../src/acsModel.ts');
  assert.equal(checkAudioFile({ name: 'Lecture 1.MP3', size: 1000, type: 'audio/mpeg' }).ok, true);
  assert.equal(checkAudioFile({ name: 'x.m4a', size: 1000, type: '' }).ok, true, 'some systems report no MIME type');
  assert.equal(checkAudioFile({ name: 'x.m4a', size: 1000, type: '' }).contentType, 'audio/mp4');
  assert.equal(checkAudioFile({ name: 'x.wav', size: 1000, type: 'audio/x-wav' }).contentType, 'audio/x-wav');
  assert.equal(checkAudioFile({ name: 'notes.txt', size: 10, type: 'text/plain' }).ok, false);
  assert.equal(checkAudioFile({ name: 'x.exe', size: 10, type: 'audio/mpeg' }).ok, false, 'the extension must be an audio one too');
  assert.equal(checkAudioFile({ name: 'x.mp3', size: 10, type: 'image/png' }).ok, false);
  assert.equal(checkAudioFile({ name: 'x.mp3', size: 0, type: 'audio/mpeg' }).ok, false);
  assert.equal(checkAudioFile({ name: 'x.mp3', size: ACS_AUDIO_MAX_BYTES + 1, type: 'audio/mpeg' }).ok, false);
  assert.equal(checkAudioFile({ name: 'x.mp3', size: ACS_AUDIO_MAX_BYTES, type: 'audio/mpeg' }).ok, true);
  assert.match(checkAudioFile({ name: 'x.mp3', size: ACS_AUDIO_MAX_BYTES + 1, type: 'audio/mpeg' }).error, /50 MB/);
  for (const [pos, ext, token] of [[1, 'mp3', 'ABC123'], [8, 'wav', 'x y!z'], [3, 'exe', 'tok'], [2, 'mp3', '']]) {
    const path = buildAudioPath(pos, ext, token);
    assert.equal(isSafeAudioPath(path), true, path);
  }
  assert.equal(buildAudioPath(3, 'exe', 'tok'), 'listening/3-tok.mp3', 'an unknown extension falls back to mp3');
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(formatBytes(50 * 1024 * 1024), '50 MB');
});

test('ACS: arguments are cleaned and limited before saving', async () => {
  const { prepareArgumentsForSave, ACS_ARGUMENT_MAX, ACS_ARGUMENTS_MAX } = await import('../src/acsModel.ts');
  assert.deepEqual(prepareArgumentsForSave(['  a ', '', '   ', 'b\nc']), { ok: true, value: ['a', 'b\nc'] });
  assert.equal(prepareArgumentsForSave(['x'.repeat(ACS_ARGUMENT_MAX + 1)]).ok, false);
  assert.equal(prepareArgumentsForSave(['x'.repeat(ACS_ARGUMENT_MAX)]).ok, true);
  assert.equal(prepareArgumentsForSave(Array.from({ length: ACS_ARGUMENTS_MAX + 1 }, () => 'a')).ok, false);
  assert.equal(prepareArgumentsForSave(Array.from({ length: ACS_ARGUMENTS_MAX }, () => 'a')).ok, true);
});

test('ACS: three note areas, "Your Notes" keeps its original storage key', () => {
  const code = fs.readFileSync('src/acsNotes.ts', 'utf8');
  assert.match(code, /title: 'Your Notes'/);
  assert.match(code, /title: 'Listening summary'/);
  assert.match(code, /title: 'Argumentation'/);
  assert.ok(code.indexOf("title: 'Your Notes'") < code.indexOf("title: 'Listening summary'") && code.indexOf("title: 'Listening summary'") < code.indexOf("title: 'Argumentation'"), 'shown in this order');
  assert.match(code, /field === 'notes' \? `acs-notes:\$\{kind\}:\$\{position\}`/, 'notes typed before the other areas existed are still found');
  assert.match(code, /`acs-notes:\$\{kind\}:\$\{position\}:\$\{field\}`/);
});

test('ACS: clock text and notes helpers', async () => {
  const { formatClock, clampNotes, countWords, ACS_NOTES_MAX } = await import('../src/acsModel.ts');
  assert.equal(formatClock(0), '0:00');
  assert.equal(formatClock(83.9), '1:23');
  assert.equal(formatClock(3725), '1:02:05');
  for (const odd of [NaN, Infinity, -5, undefined]) assert.equal(formatClock(odd), '0:00');
  assert.equal(clampNotes('x'.repeat(ACS_NOTES_MAX + 50)).length, ACS_NOTES_MAX);
  assert.equal(countWords('  one two\nthree  '), 3);
  assert.equal(countWords('   '), 0);
});

test('ACS migration 0014: table, rules, public audio bucket writable only by admins', () => {
  const sql = fs.readFileSync('supabase/migrations/0014_acs_listening_argumentation.sql', 'utf8');
  assert.match(sql, /create table if not exists public\.acs_items/i);
  assert.match(sql, /primary key \(kind, position\)/i);
  assert.match(sql, /position between 1 and 8/i);
  assert.match(sql, /kind in \('listening', 'argumentation'\)/i);
  assert.match(sql, /alter table public\.acs_items enable row level security/i);
  assert.match(sql, /create policy "acs_items are readable by anyone" on public\.acs_items for select using \(true\)/i);
  for (const [name, cmd] of [['insertable', 'insert'], ['updatable', 'update'], ['deletable', 'delete']]) {
    assert.match(sql, new RegExp(`create policy "acs_items are ${name} by admins" on public\\.acs_items for ${cmd}[^;]*public\\.is_admin\\(\\)`, 'i'), `${cmd} is admin-only`);
  }
  assert.match(sql, /insert into storage\.buckets[\s\S]*'acs-audio'[\s\S]*true/i, 'bucket is public so students can stream');
  assert.match(sql, /file_size_limit[\s\S]*52428800/i);
  for (const cmd of ['select', 'insert', 'update', 'delete']) {
    assert.match(sql, new RegExp(`on storage\\.objects\\s+for ${cmd} to authenticated[^;]*public\\.is_admin\\(\\)`, 'is'), `storage ${cmd} is admin-only`);
  }
  assert.doesNotMatch(sql, /for (insert|update|delete)[^;]*to (anon|public)/i, 'no public writes');
  assert.match(sql, /pg_notify\('pgrst',\s*'reload schema'\)/i);
});

test('ACS migration 0016: one Listening section; arguments live on listenings; old rows carried over then removed', () => {
  const sql = fs.readFileSync('supabase/migrations/0016_acs_listening_only.sql', 'utf8');
  assert.match(sql, /drop constraint if exists acs_items_arguments_only_for_argumentation/i, 'listenings may now hold arguments');
  // the carry-over runs before the delete, so nothing an admin typed is lost
  const carry = sql.search(/set arguments = argumentation\.arguments/i);
  const del = sql.search(/delete from public\.acs_items where kind = 'argumentation'/i);
  assert.ok(carry > 0 && del > carry, 'arguments and names are copied over before the Argumentation rows are deleted');
  assert.match(sql, /set title = argumentation\.title/i);
  assert.match(sql, /add constraint acs_items_kind_check check \(kind = 'listening'\)/i);
  assert.match(sql, /pg_notify\('pgrst',\s*'reload schema'\)/i);
});

// ---------------------------------------------------------------------------------------------------------------------
// Admin speed: paged questions, counts, server-side telemetry
// ---------------------------------------------------------------------------------------------------------------------
test('Admin paging: search filter escapes every special character', async () => {
  const { escapeRegexTerm, quoteFilterValue, buildSearchFilter, normalizeSearchTerm, SEARCH_MAX_LENGTH } = await import('../src/admin/questionQuery.ts');
  assert.equal(buildSearchFilter('   '), null);
  assert.equal(buildSearchFilter(''), null);
  assert.equal(escapeRegexTerm('a.b*c+d?(e)[f]{g}|h^$\\i'), 'a\\.b\\*c\\+d\\?\\(e\\)\\[f\\]\\{g\\}\\|h\\^\\$\\\\i');
  assert.equal(quoteFilterValue('say "hi", (ok)'), '"say \\"hi\\", (ok)"');
  const filter = buildSearchFilter('100%, "x"');
  // every column is searched, with the same quoted value, so a comma or quote in the term cannot add a condition
  for (const column of ['question_text', 'explanation', 'options->>0', 'options->>1', 'options->>2', 'options->>3']) {
    assert.ok(filter.includes(`${column}.imatch.`), column);
  }
  assert.equal(filter.split('.imatch.').length - 1, 6);
  assert.equal(normalizeSearchTerm('  hello  '), 'hello');
  assert.equal(normalizeSearchTerm('x'.repeat(500)).length, SEARCH_MAX_LENGTH);
  // a typed regex like ".*" must be taken literally
  const literal = buildSearchFilter('.*');
  assert.ok(literal.includes('"\\\\.\\\\*"') || literal.includes('imatch."\\\\.\\\\*"'), literal);
});

test('Admin paging: keyset cursor, ties broken by id', async () => {
  const { buildKeysetFilter, cursorOf, QUESTION_PAGE_SIZE } = await import('../src/admin/questionQuery.ts');
  const cursor = cursorOf({ id: '0a92ba74-0f44-4e02-ad87-9289b4aa2886', created_at: '2026-10-01T18:45:52.43737+00:00', extra: 1 });
  assert.deepEqual(cursor, { id: '0a92ba74-0f44-4e02-ad87-9289b4aa2886', created_at: '2026-10-01T18:45:52.43737+00:00' });
  assert.equal(
    buildKeysetFilter(cursor),
    'created_at.lt."2026-10-01T18:45:52.43737+00:00",and(created_at.eq."2026-10-01T18:45:52.43737+00:00",id.lt."0a92ba74-0f44-4e02-ad87-9289b4aa2886")',
  );
  assert.ok(QUESTION_PAGE_SIZE >= 12 && QUESTION_PAGE_SIZE <= 50, 'a page is big enough to fill a screen and small enough to be quick');
});

test('Admin paging: client-side filters mirror the database filters', async () => {
  const { questionMatchesFilters, questionTarget, sameFilters } = await import('../src/admin/questionQuery.ts');
  const q = { id: '1', subject: 'Econometrics', theme: 'Theme 3', mock_exam_id: null, question_text: 'What is Heteroskedasticity?', options: ['a', 'Var(u|x) constant', 'c', 'd'], correct_index: 0, explanation: 'Because', created_at: 'x' };
  const mock = { ...q, id: '2', theme: null, mock_exam_id: 'abc' };
  const all = { subject: 'All', theme: 'All', search: '' };
  assert.equal(questionMatchesFilters(q, all), true);
  assert.equal(questionMatchesFilters(q, { ...all, subject: 'Econometrics' }), true);
  assert.equal(questionMatchesFilters(q, { ...all, subject: 'Math for Eco' }), false);
  assert.equal(questionMatchesFilters(q, { ...all, theme: 'Theme 3' }), true);
  assert.equal(questionMatchesFilters(q, { ...all, theme: 'Theme 4' }), false);
  assert.equal(questionMatchesFilters(mock, { ...all, theme: 'mock:abc' }), true);
  assert.equal(questionMatchesFilters(mock, { ...all, theme: 'Theme 3' }), false);
  assert.equal(questionTarget(mock), 'mock:abc');
  assert.equal(questionMatchesFilters(q, { ...all, search: 'heteroSKEDAS' }), true, 'case-insensitive, matches the prompt');
  assert.equal(questionMatchesFilters(q, { ...all, search: 'var(u|x)' }), true, 'matches an option, symbols taken literally');
  assert.equal(questionMatchesFilters(q, { ...all, search: 'because' }), true, 'matches the explanation');
  assert.equal(questionMatchesFilters(q, { ...all, search: 'nope' }), false);
  assert.equal(sameFilters({ ...all, search: ' a ' }, { ...all, search: 'a' }), true);
  assert.equal(sameFilters(all, { ...all, subject: 'Econometrics' }), false);
});

test('Admin counts: totals per subject / theme / mock exam, kept right between refreshes', async () => {
  const c = await import('../src/admin/questionCounts.ts');
  const { getSubjectAliases } = await import('../src/constants.ts');
  const rows = c.parseQuestionCounts([
    { subject: 'Econometrics', theme: 'Theme 1', mock_exam_id: null, question_count: 25 },
    { subject: 'Econometrics', theme: 'Theme 2', mock_exam_id: null, question_count: '10' },
    { subject: 'Introduction to Business and Economics', theme: 'Theme 1', mock_exam_id: null, question_count: 5 },
    { subject: 'Foundations of Economics', theme: 'Theme 1', mock_exam_id: null, question_count: 7 },
    { subject: 'Econometrics', theme: null, mock_exam_id: 'm1', question_count: 4 },
    { subject: 5, question_count: 1 },
    { subject: 'Bad', question_count: -3 },
    'junk',
  ]);
  assert.equal(rows.length, 5, 'unusable rows are dropped');
  assert.equal(c.totalQuestions(rows), 51);
  assert.equal(c.countThemeQuestions(rows, getSubjectAliases('Econometrics'), 'Theme 1'), 25);
  assert.equal(c.countThemeQuestions(rows, getSubjectAliases('Introduction to Business and Economics'), 'Theme 1'), 12, 'the legacy IBE name counts too');
  assert.equal(c.countAvailableQuestions(rows, getSubjectAliases('Econometrics'), ['Theme 1', 'Theme 2']), 35, 'a mock exam only borrows from themes, never other exams\' questions');
  assert.equal(c.countOwnQuestions(rows, 'm1'), 4);
  assert.equal(c.countOwnQuestions(rows, null), 0);
  const q = { subject: 'Econometrics', theme: 'Theme 1', mock_exam_id: null };
  const up = c.adjustQuestionCounts(rows, q, 1);
  assert.equal(c.totalQuestions(up), 52);
  assert.equal(c.totalQuestions(rows), 51, 'the original array is not changed');
  assert.equal(c.countThemeQuestions(up, getSubjectAliases('Econometrics'), 'Theme 1'), 26);
  assert.equal(c.countThemeQuestions(c.adjustQuestionCounts(up, q, -1), getSubjectAliases('Econometrics'), 'Theme 1'), 25);
  assert.equal(c.countThemeQuestions(c.adjustQuestionCounts(rows, { subject: 'Econometrics', theme: 'Theme 9', mock_exam_id: null }, 1), getSubjectAliases('Econometrics'), 'Theme 9'), 1, 'a new theme row appears');
  assert.equal(c.countOwnQuestions(c.adjustQuestionCounts(rows, { subject: 'Econometrics', theme: null, mock_exam_id: 'm1' }, -4), 'm1'), 0);
  assert.equal(c.totalQuestions(c.removeExamFromCounts(rows, 'm1')), 47);
});

test('Telemetry: the database summary gives exactly the numbers the event-by-event maths gives', async () => {
  const a = await import('../src/admin/analyticsSummary.ts');
  // a messy little history: repeat visitors, completions with and without score/time, mock exams, odd subjects
  const events = [];
  let n = 0;
  const add = (event_type, session_id, extra = {}) => events.push({ id: String(n++), event_type, session_id, created_at: '2026-10-01T00:00:00Z', ...extra });
  for (const s of ['a', 'a', 'b', 'c', 'c', 'c']) add('page_visit', s);
  add('quiz_start', 'a', { subject: 'Econometrics', theme: 'Theme 1' });
  add('quiz_start', 'a', { subject: 'Econometrics', theme: 'Theme 1' });
  add('quiz_start', 'b', { subject: 'Econometrics', theme: 'Theme 2' });
  add('quiz_start', 'b', { subject: 'Math for Eco', theme: null, metadata: { mock_exam_title: '  Mock 1  ' } });
  add('quiz_start', 'c', { subject: 'Math for Eco', theme: 'Theme 7' });
  add('quiz_complete', 'a', { subject: 'Econometrics', theme: 'Theme 1', score: 20, time_taken_seconds: 700 });
  add('quiz_complete', 'b', { subject: 'Math for Eco', theme: null, metadata: { mock_exam_title: '  Mock 1  ' }, score: 17, time_taken_seconds: 1000 });
  add('quiz_complete', 'c', { subject: 'Math for Eco', theme: 'Theme 7', score: null, time_taken_seconds: null });
  add('quiz_complete', 'c', { subject: 'Math for Eco', theme: 'Theme 7', score: 11, time_taken_seconds: 333 });

  const slow = a.viewFromEvents(events);
  // what admin_analytics_summary() would return for these events
  const totals = {
    totalVisitors: new Set(events.filter((e) => e.event_type === 'page_visit').map((e) => e.session_id)).size,
    totalVisits: 6, quizzesStarted: 5, quizzesCompleted: 4, scoreSum: 20 + 17 + 11, scoreCount: 3, timeSum: 700 + 1000 + 333, timeCount: 3,
  };
  const summary = a.parseAnalyticsSummary({
    ...totals,
    subjects: [
      { subject: 'Econometrics', starts: 3, completions: 1, themes: [{ theme: 'Theme 1', starts: 2, completions: 1 }, { theme: 'Theme 2', starts: 1, completions: 0 }] },
      { subject: 'Math for Eco', starts: 2, completions: 3, themes: [{ theme: 'Mock Exam: Mock 1', starts: 1, completions: 1 }, { theme: 'Theme 7', starts: 1, completions: 2 }] },
    ],
  });
  const fast = a.viewFromSummary(summary);
  assert.deepEqual(fast.kpis, slow.kpis);
  assert.deepEqual(fast.funnel, slow.funnel);
  assert.deepEqual(fast.breakdown, slow.breakdown);
  assert.equal(fast.kpis.totalVisitors, 3);
  assert.equal(fast.kpis.avgScore, 16);
  assert.equal(fast.kpis.avgTimeSeconds, 678);
  assert.equal(fast.kpis.completionRate, 80);
});

test('Telemetry: empty and malformed summaries never break the dashboard', async () => {
  const a = await import('../src/admin/analyticsSummary.ts');
  assert.equal(a.parseAnalyticsSummary(null), null);
  assert.equal(a.parseAnalyticsSummary([]), null);
  assert.equal(a.parseAnalyticsSummary({ hello: 'world' }), null);
  const empty = a.parseAnalyticsSummary({ totalVisitors: 0, totalVisits: 0, quizzesStarted: 0, quizzesCompleted: 0, subjects: [] });
  const view = a.viewFromSummary(empty);
  assert.equal(view.kpis.completionRate, 0);
  assert.equal(view.kpis.avgScore, null);
  assert.equal(view.kpis.avgTimeSeconds, null);
  assert.equal(view.funnel[0].count, 0);
  assert.deepEqual(view.breakdown, []);
  const odd = a.parseAnalyticsSummary({ totalVisitors: 'x', quizzesStarted: -4, quizzesCompleted: null, subjects: [null, { subject: 3 }, { subject: 'S', starts: '2', themes: [{ theme: 5 }, { theme: 'Theme 1', starts: 1, completions: 1 }] }] });
  assert.equal(odd.totals.totalVisitors, 0);
  assert.equal(odd.subjects.length, 1);
  assert.equal(odd.subjects[0].themes.length, 1);
});

test('Telemetry: time ranges', async () => {
  const { analyticsSince } = await import('../src/admin/analyticsSummary.ts');
  const now = new Date('2026-11-15T14:30:00');
  assert.equal(analyticsSince('all', now), null);
  assert.equal(new Date(analyticsSince('7d', now)).getTime(), now.getTime() - 7 * 86400000);
  const today = new Date(analyticsSince('today', now));
  assert.equal(today.getHours(), 0);
  assert.equal(today.getDate(), now.getDate());
});

test('Migration 0015: admin functions run with the caller\'s rights, and only for admins', () => {
  const sql = fs.readFileSync('supabase/migrations/0015_admin_speed.sql', 'utf8');
  assert.match(sql, /create or replace function public\.admin_analytics_summary\(p_since timestamptz default null\)/i);
  assert.match(sql, /create or replace function public\.admin_question_counts\(\)/i);
  assert.equal((sql.match(/security invoker/gi) ?? []).length, 2, 'both functions respect row-level security');
  assert.doesNotMatch(sql, /security definer/i, 'neither function bypasses row-level security');
  assert.match(sql, /revoke all on function public\.admin_analytics_summary\(timestamptz\) from public, anon/i);
  assert.match(sql, /grant execute on function public\.admin_analytics_summary\(timestamptz\) to authenticated/i);
  assert.match(sql, /create index if not exists questions_created_at_id_idx on public\.questions \(created_at desc, id desc\)/i);
  assert.match(sql, /pg_notify\('pgrst',\s*'reload schema'\)/i);
});

test('Smooth scrolling: mouse and trackpad only, with a watchdog and a kill switch', () => {
  const code = fs.readFileSync('src/smoothScroll.ts', 'utf8');
  assert.doesNotMatch(code, /syncTouch:\s*true/, 'phones and tablets keep the browser\'s own scrolling');
  assert.match(code, /\(hover: hover\) and \(pointer: fine\)/, 'only devices whose main input is a mouse or trackpad');
  assert.match(code, /prefers-reduced-motion/);
  assert.match(code, /el\.tagName === 'TEXTAREA'\) \{\s*if \(el\.scrollHeight > el\.clientHeight \+ 1\) return true;/, 'a text box only takes the wheel when it has hidden text to scroll');
  assert.doesNotMatch(code, /type === 'range'/, 'the seek bar does not interrupt page scrolling');
  assert.match(code, /watchSmoothing\(lenis\)/, 'the watchdog is started with the smoothing');
  assert.match(code, /failures >= 3/, 'it gives up after three dead wheel turns');
  assert.match(code, /lenis\.destroy\(\)/, 'and hands scrolling back to the browser completely');
  assert.match(code, /get\('smooth'\)/, '?smooth=off / ?smooth=on');
  const css = fs.readFileSync('src/admin.css', 'utf8');
  assert.doesNotMatch(css, /content-visibility/, 'no layout tricks that fight smooth scrolling');
});
