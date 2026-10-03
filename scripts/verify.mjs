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
  assert.equal(subjectShortName('Financial Accounting'), 'FA');
  assert.equal(subjectShortName('Fundamentals of Statistics'), 'FoS');
  assert.equal(subjectShortName('Essentials of Economics'), 'EoE');

  // getQuizThemeTitle
  assert.equal(getQuizThemeTitle('Quantitative Methods', 'Theme 1'), 'Theme 1');
  assert.equal(getQuizThemeTitle(undefined, 'Theme 1'), 'Theme 1');
  assert.equal(getQuizThemeTitle('Quantitative Methods', 'Theme 2'), 'Theme 2');
  assert.equal(getQuizThemeTitle('Math for Eco', 'Theme 1'), 'Theme 1');

  // getQuizThemeTitle for FA, FoS, EoE
  assert.equal(getQuizThemeTitle('Financial Accounting', 'Theme 1'), 'Intro to Accounting');
  assert.equal(getQuizThemeTitle('Financial Accounting', 'Theme 2'), 'Accounting Cycle');
  assert.equal(getQuizThemeTitle('Financial Accounting', 'Theme 3'), 'Accounting Cycle 2');

  assert.equal(getQuizThemeTitle('Fundamentals of Statistics', 'Theme 1'), 'Intro to Statistics');
  assert.equal(getQuizThemeTitle('Fundamentals of Statistics', 'Theme 2'), 'Probability topics');
  assert.equal(getQuizThemeTitle('Fundamentals of Statistics', 'Theme 3'), 'Discrete Probability Distributions');
  assert.equal(getQuizThemeTitle('Fundamentals of Statistics', 'Theme 4'), 'Continuous Probability Distributions');

  assert.equal(getQuizThemeTitle('Essentials of Economics', 'Theme 1'), '10 principles of economics');
  assert.equal(getQuizThemeTitle('Essentials of Economics', 'Theme 2'), 'The market forces of supply and demand');
  assert.equal(getQuizThemeTitle('Essentials of Economics', 'Theme 3'), 'Elasticity');
  assert.equal(getQuizThemeTitle('Essentials of Economics', 'Theme 4'), 'Consumers, Producers, and the efficiency of markets');
  assert.equal(getQuizThemeTitle('Essentials of Economics', 'Theme 5'), 'The data on macroeconomics');
  assert.equal(getQuizThemeTitle('Essentials of Economics', 'Theme 6'), 'Production and growth');
});

test('Subject theme counts and options in getSubjectThemes & resolveTheme', async () => {
  const { getSubjectThemes, resolveTheme } = await import('../src/constants.ts');

  const faThemes = getSubjectThemes('Financial Accounting');
  assert.equal(faThemes.length, 3);
  assert.equal(faThemes[0].theme, 'Theme 1');
  assert.equal(faThemes[0].title, 'Intro to Accounting');
  assert.equal(faThemes[1].theme, 'Theme 2');
  assert.equal(faThemes[1].title, 'Accounting Cycle');
  assert.equal(faThemes[2].theme, 'Theme 3');
  assert.equal(faThemes[2].title, 'Accounting Cycle 2');

  const fosThemes = getSubjectThemes('Fundamentals of Statistics');
  assert.equal(fosThemes.length, 4);
  assert.equal(fosThemes[0].title, 'Intro to Statistics');
  assert.equal(fosThemes[1].title, 'Probability topics');
  assert.equal(fosThemes[2].title, 'Discrete Probability Distributions');
  assert.equal(fosThemes[3].title, 'Continuous Probability Distributions');

  const eoeThemes = getSubjectThemes('Essentials of Economics');
  assert.equal(eoeThemes.length, 6);
  assert.equal(eoeThemes[0].title, '10 principles of economics');
  assert.equal(eoeThemes[1].title, 'The market forces of supply and demand');
  assert.equal(eoeThemes[2].title, 'Elasticity');
  assert.equal(eoeThemes[3].title, 'Consumers, Producers, and the efficiency of markets');
  assert.equal(eoeThemes[4].title, 'The data on macroeconomics');
  assert.equal(eoeThemes[5].title, 'Production and growth');

  const meThemes = getSubjectThemes('Math for Eco');
  assert.equal(meThemes.length, 12);

  // resolveTheme
  assert.equal(resolveTheme('Financial Accounting', 'Intro to Accounting'), 'Theme 1');
  assert.equal(resolveTheme('Financial Accounting', '1. Intro to Accounting'), 'Theme 1');
  assert.equal(resolveTheme('Financial Accounting', 'Accounting Cycle 2'), 'Theme 3');
  assert.equal(resolveTheme('Financial Accounting', 'Theme 2'), 'Theme 2');
  assert.equal(resolveTheme('Fundamentals of Statistics', 'Continuous Probability Distributions'), 'Theme 4');
  assert.equal(resolveTheme('Essentials of Economics', '10 principles of economics'), 'Theme 1');
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
