#!/usr/bin/env node
'use strict';

// CI guard: fails if INLINE_SCRIPT_HASH in server/server.js does not match the
// current inline <script> in public/index.html. Without this, editing the
// inline script without regenerating the hash ships a page whose own script is
// blocked by the Content-Security-Policy (a white-screen deploy).
//
//   npm run check-csp-hash

const fs = require('fs');
const path = require('path');
const { computeHash } = require('./csp-hash');

const serverPath = path.join(__dirname, '..', 'server', 'server.js');
const server = fs.readFileSync(serverPath, 'utf8');

const m = server.match(/INLINE_SCRIPT_HASH\s*=\s*"('sha256-[^']+')"/);
if (!m) {
  console.error('Could not find INLINE_SCRIPT_HASH in server/server.js');
  process.exit(1);
}

const committed = m[1];
const computed = computeHash();

if (committed !== computed) {
  console.error('CSP hash mismatch - the deployed page would be blocked by its own CSP.');
  console.error('  committed in server.js:   ' + committed);
  console.error('  computed from index.html: ' + computed);
  console.error('Fix: run `npm run csp-hash` and paste the value into INLINE_SCRIPT_HASH in server/server.js.');
  process.exit(1);
}

console.log('CSP hash OK: ' + committed);
