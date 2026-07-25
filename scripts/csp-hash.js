#!/usr/bin/env node
'use strict';

// Prints the SHA-256 CSP hash of the single inline <script> in public/index.html.
// If that inline script ever changes, run this and paste the result into
// INLINE_SCRIPT_HASH in server/server.js, or the browser will block the page's
// own script under the Content-Security-Policy.
//
//   npm run csp-hash
//
// Also exports computeHash() for scripts/check-csp-hash.js (CI guard).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, '..', 'public', 'index.html');

// Returns the CSP source expression for the inline script, e.g. "'sha256-...'".
function computeHash() {
  const html = fs.readFileSync(FILE, 'utf8');
  // The inline script is the only <script> tag with no attributes.
  const OPEN = '<script>';
  const start = html.indexOf(OPEN);
  if (start < 0) throw new Error('No inline <script> found in ' + FILE);
  const contentStart = start + OPEN.length;
  const contentEnd = html.indexOf('</script>', contentStart);
  const content = html.slice(contentStart, contentEnd);
  const hash = crypto.createHash('sha256').update(content, 'utf8').digest('base64');
  return "'sha256-" + hash + "'";
}

if (require.main === module) {
  console.log(computeHash());
}

module.exports = { computeHash };
