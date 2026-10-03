import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const suiteFiles = [
  path.join(__dirname, 'suites/tier1_features.test.mjs'),
  path.join(__dirname, 'suites/tier2_boundaries.test.mjs'),
  path.join(__dirname, 'suites/tier3_cross_feature.test.mjs'),
  path.join(__dirname, 'suites/tier4_real_world.test.mjs'),
];

console.log('===========================================================');
console.log('🚀 Running CIFS Analytics E2E Test Suite (Tiers 1-4)');
console.log('===========================================================');

const testStream = run({
  files: suiteFiles,
  concurrency: true,
});

testStream.on('test:fail', () => {
  process.exitCode = 1;
});

testStream.compose(new spec()).pipe(process.stdout);
