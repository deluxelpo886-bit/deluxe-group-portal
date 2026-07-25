#!/usr/bin/env node
'use strict';

// Prints the SHA-256 CSP hash of the single inline <script> in public/index.html.
// If that inline script ever changes, run this and paste the result into
// INLINE_SCRIPT_HASH in server/server.js, or the browser will block the page's
// own script under the Content-Security-Policy.
//
//   npm run csp-hash

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, '..', 'public', 'index.html');
const html = fs.readFileSync(FILE, 'utf8');

// The inline script is the only <script> tag with no attributes.
const OPEN = '<script>';
const start = html.indexOf(OPEN);
if (start < 0) {
  console.error('No inline <script> found in ' + FILE);
  process.exit(1);
}
const contentStart = start + OPEN.length;
const contentEnd = html.indexOf('</script>', contentStart);
const content = html.slice(contentStart, contentEnd);

const hash = crypto.createHash('sha256').update(content, 'utf8').digest('base64');
console.log("'sha256-" + hash + "'");
