#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const frontendDir = resolve(root, 'frontend');
const standaloneDir = resolve(frontendDir, '.next', 'standalone');

if (!existsSync(standaloneDir)) {
  throw new Error('Missing frontend standalone output. Ensure frontend/next.config.js sets output: standalone and run pnpm build first.');
}

function copyIfExists(from, to) {
  if (!existsSync(from)) return;
  rmSync(to, { recursive: true, force: true });
  mkdirSync(resolve(to, '..'), { recursive: true });
  cpSync(from, to, { recursive: true });
}

copyIfExists(resolve(frontendDir, '.next', 'static'), resolve(standaloneDir, '.next', 'static'));
copyIfExists(resolve(frontendDir, 'public'), resolve(standaloneDir, 'public'));

console.log('frontend standalone assets ready');
