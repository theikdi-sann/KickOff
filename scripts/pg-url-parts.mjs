// Splits a PostgreSQL connection URL into its parts.
//
// The pgTAP runner needs the password separately from the connection string:
// a URL that carries the password shows up in `ps` for every user on the
// machine, so the runner keeps the password in the environment and hands psql
// a connection string without it.
//
// Usage:
//   node scripts/pg-url-parts.mjs <url>        # prints "<conninfo>\n<password>"
//
// The connection string is printed first so the caller can read it with a
// single command substitution; the password is on the second line.
//
// Exit codes:
//   0  success
//   2  the URL is not parseable, or carries no password
import { argv, exit, stdout } from 'node:process';

const url = argv[2];

if (!url) {
  stderr('usage: pg-url-parts.mjs <url>');
  exit(2);
}

let parsed;
try {
  parsed = new URL(url);
} catch {
  stderr(`not a valid URL: ${url}`);
  exit(2);
}

const password = decodeURIComponent(parsed.password);
if (!password) {
  stderr('the URL carries no password');
  exit(2);
}

const connection = [
  `host=${parsed.hostname}`,
  `port=${parsed.port || 5432}`,
  `dbname=${decodeURIComponent(parsed.pathname.replace(/^\//, ''))}`,
  `user=${decodeURIComponent(parsed.username)}`,
].join(' ');

stdout.write(`${connection}\n${password}\n`);

/**
 * Writes a message to stderr.
 * @param {string} message the message
 */
function stderr(message) {
  process.stderr.write(`${message}\n`);
}
