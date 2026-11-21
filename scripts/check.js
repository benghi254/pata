// Build check: loads every module and compiles every EJS template, so a typo fails the build
// instead of a page at runtime.
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

process.env.SESSION_SECRET ||= 'build-check';
const app = require('../server'); // exported, not listening
if (typeof app !== 'function') throw new Error('server.js must export the Express app');

const viewsDir = path.join(__dirname, '..', 'views');
const files = fs.readdirSync(viewsDir, { recursive: true }).filter((f) => f.endsWith('.ejs'));
for (const f of files) {
  const file = path.join(viewsDir, f);
  ejs.compile(fs.readFileSync(file, 'utf8'), { filename: file });
}
console.log(`check: server loads, ${files.length} templates compile.`);
