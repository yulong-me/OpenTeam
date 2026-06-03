import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const oldPascal = ['Open', 'Council'].join('');
const oldLower = ['open', 'council'].join('');
const oldUpper = oldLower.toUpperCase();
const oldKebab = ['open', 'council'].join('-');
const oldSpaced = ['Open', 'Council'].join(' ');
const legacyTerms = [oldPascal, oldLower, oldUpper, oldKebab, oldSpaced];

const ignoredPathPatterns = [
  /^backend\/dist\//,
  /^frontend\/\.next\//,
  /^release\//,
];

function isIgnoredPath(filePath) {
  return ignoredPathPatterns.some(pattern => pattern.test(filePath));
}

const trackedFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter(filePath => !isIgnoredPath(filePath));

const offenders = [];
for (const filePath of trackedFiles) {
  for (const term of legacyTerms) {
    if (filePath.includes(term)) offenders.push(`${filePath}: path contains ${term}`);
  }

  const source = readFileSync(filePath, 'utf8');
  for (const term of legacyTerms) {
    if (source.includes(term)) offenders.push(`${filePath}: content contains ${term}`);
  }
}

assert.deepEqual(offenders, []);

console.log('project-rename: ok');
