#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const publishTarget = packageJson.build.publish?.[0] ?? {};
const defaultRepo = `${publishTarget.owner}/${publishTarget.repo}`;
const defaultSigningDir = resolve(homedir(), '.openteam-signing');
const defaultKeyPath = resolve(defaultSigningDir, 'openteam-developer-id.key');
const defaultCertificatePath = resolve(homedir(), 'Downloads', 'developerID_application.cer');
const defaultP12Path = resolve(defaultSigningDir, 'mac-codesign.p12');
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(`Usage:
  node scripts/configure-macos-signing-secrets.mjs --certificate ~/Downloads/developerID_application.cer

Options:
  --certificate <path>  Apple Developer ID Application .cer path.
  --key <path>          Private key used to create the CSR.
  --p12 <path>          Output p12 path.
  --repo <owner/repo>   GitHub repository for Actions secrets.
  --dry-run            Validate inputs and build the p12 without setting GitHub secrets.

Environment values are used before prompting:
  MAC_CSC_KEY_PASSWORD
  APPLE_ID
  APPLE_APP_SPECIFIC_PASSWORD
  APPLE_TEAM_ID`);
  process.exit(0);
}

const certificatePath = expandPath(args.certificate ?? defaultCertificatePath);
const keyPath = expandPath(args.key ?? defaultKeyPath);
const p12Path = expandPath(args.p12 ?? defaultP12Path);
const repo = args.repo ?? defaultRepo;
const dryRun = Boolean(args['dry-run']);

if (!existsSync(certificatePath)) {
  fail(`Missing Developer ID certificate: ${certificatePath}`);
}

if (!existsSync(keyPath)) {
  fail(`Missing private key: ${keyPath}`);
}

if (!repo || repo.includes('undefined')) {
  fail('Missing GitHub repository target. Pass --repo owner/repo.');
}

mkdirSync(dirname(p12Path), { recursive: true, mode: 0o700 });

const certificatePemPath = resolve(dirname(p12Path), 'developer-id-application.pem');
convertCertificateToPem(certificatePath, certificatePemPath);
assertDeveloperIdApplicationCertificate(certificatePemPath);
assertCertificateMatchesKey(certificatePemPath, keyPath);

const rl = createInterface({ input: process.stdin, output: process.stdout });
const p12Password = await readSecret(rl, 'P12 export password / MAC_CSC_KEY_PASSWORD', 'MAC_CSC_KEY_PASSWORD');
const appleId = await readValue(rl, 'Apple ID email / APPLE_ID', 'APPLE_ID');
const appPassword = await readSecret(rl, 'Apple app-specific password / APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_APP_SPECIFIC_PASSWORD');
const teamId = await readValue(rl, 'Apple Team ID / APPLE_TEAM_ID', 'APPLE_TEAM_ID');
rl.close();

if (!/^[A-Z0-9]{10}$/.test(teamId)) {
  fail('APPLE_TEAM_ID must be the 10-character Apple Developer Team ID.');
}

run('openssl', [
  'pkcs12',
  '-legacy',
  '-export',
  '-inkey',
  keyPath,
  '-in',
  certificatePemPath,
  '-out',
  p12Path,
  '-name',
  'OpenTeam Developer ID',
  '-passout',
  `pass:${p12Password}`,
]);

const p12 = readFileSync(p12Path);
const cscLink = p12.toString('base64');
const secrets = {
  MAC_CSC_LINK: cscLink,
  MAC_CSC_KEY_PASSWORD: p12Password,
  APPLE_ID: appleId,
  APPLE_APP_SPECIFIC_PASSWORD: appPassword,
  APPLE_TEAM_ID: teamId,
};

if (dryRun) {
  console.log(`macOS signing inputs ok; p12 written to ${p12Path}`);
  process.exit(0);
}

for (const [name, value] of Object.entries(secrets)) {
  setGitHubSecret(repo, name, value);
}

const listedSecrets = capture('gh', ['secret', 'list', '--repo', repo]);
for (const name of Object.keys(secrets)) {
  if (!listedSecrets.includes(name)) {
    fail(`GitHub secret was not listed after setting it: ${name}`);
  }
}

console.log(`macOS signing secrets configured for ${repo}`);

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (key === 'dry-run') {
        parsed[key] = true;
      } else {
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
          fail(`Missing value for ${arg}`);
        }
        parsed[key] = value;
        index += 1;
      }
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function expandPath(path) {
  if (path === '~') return homedir();
  if (path.startsWith('~/')) return resolve(homedir(), path.slice(2));
  return resolve(path);
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    ...options,
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    fail(`${command} ${commandArgs.join(' ')} failed${output ? `:\n${output}` : ''}`);
  }

  return result;
}

function capture(command, commandArgs) {
  const result = run(command, commandArgs);
  return [result.stdout, result.stderr].filter(Boolean).join('\n');
}

function convertCertificateToPem(inputPath, outputPath) {
  const derResult = spawnSync('openssl', ['x509', '-inform', 'DER', '-in', inputPath, '-out', outputPath], {
    cwd: root,
    encoding: 'utf8',
  });

  if (derResult.status === 0) return;

  run('openssl', ['x509', '-in', inputPath, '-out', outputPath]);
}

function assertDeveloperIdApplicationCertificate(certificatePemPath) {
  const certificateInfo = capture('openssl', ['x509', '-in', certificatePemPath, '-noout', '-subject', '-issuer']);
  if (!/Developer ID Application/.test(certificateInfo)) {
    fail(`Certificate is not a Developer ID Application certificate:\n${certificateInfo}`);
  }
}

function assertCertificateMatchesKey(certificatePemPath, privateKeyPath) {
  const certificateModulus = capture('openssl', ['x509', '-in', certificatePemPath, '-noout', '-modulus']);
  const keyModulus = capture('openssl', ['rsa', '-in', privateKeyPath, '-noout', '-modulus']);
  const certificateHash = hash(certificateModulus);
  const keyHash = hash(keyModulus);

  if (certificateHash !== keyHash) {
    fail('Developer ID certificate does not match the private key used to create the CSR.');
  }
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function readValue(rl, label, envName) {
  const fromEnv = process.env[envName];
  if (fromEnv) return fromEnv.trim();

  const answer = (await rl.question(`${label}: `)).trim();
  if (!answer) fail(`${envName} is required.`);
  return answer;
}

async function readSecret(rl, label, envName) {
  const fromEnv = process.env[envName];
  if (fromEnv) return fromEnv.trim();

  process.stdout.write(`${label}: `);
  spawnSync('stty', ['-echo'], { stdio: ['inherit', 'inherit', 'inherit'] });
  try {
    const answer = await rl.question('');
    process.stdout.write('\n');
    if (!answer) fail(`${envName} is required.`);
    return answer.trim();
  } finally {
    spawnSync('stty', ['echo'], { stdio: ['inherit', 'inherit', 'inherit'] });
  }
}

function setGitHubSecret(repo, name, value) {
  const result = spawnSync('gh', ['secret', 'set', name, '--repo', repo], {
    cwd: root,
    input: value,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    fail(`Failed to set GitHub secret ${name}${output ? `:\n${output}` : ''}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
