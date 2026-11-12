// Phase C4 — the database gate must be runnable locally, repeatably.
//
// The pgTAP suites are the only proof of what the database actually enforces:
// RLS, order expiry, seat holds, scan concurrency. They were written against
// the *hosted* project, where the runner injects the worker's credentials:
//
//   set kickoff.dblink_password = '<password>';
//
// The local Docker stack needs the same thing. Its `pg_hba.conf` maps the
// container network to `scram-sha-256`, and the dblink workers in the two
// concurrency suites reconnect with a conninfo that has no password — so the
// workers are refused with "password or GSSAPI delegated credentials
// required" and both suites fail before their first assertion.
//
// The gate is therefore only green locally if the local runner sets the same
// GUC. That has to be automatic, not a step a developer remembers.
//
//   DB-1  the local pgTAP runner sets the dblink password for the workers
//   DB-2  the concurrency suites read the password from that GUC
//   DB-3  the runner never writes a password into the repository
//   DB-4  the password reaches SQL as a quoted psql variable, not as a literal
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('DB-1 the local pgTAP runner provides the worker password', () => {
  const runner = read('scripts/run-pgtap.sh');

  assert.match(
    runner,
    /kickoff\.dblink_password/,
    'the local runner must set kickoff.dblink_password for the dblink workers',
  );
  assert.doesNotMatch(
    runner,
    /local Docker uses trust auth and needs no password/,
    'the local stack maps the container network to scram-sha-256 — it is not trust auth',
  );
});

test('DB-2 the concurrency suites read the password from the GUC', () => {
  for (const file of [
    'supabase/tests/hold-concurrency.test.sql',
    'supabase/tests/scan-concurrency.test.sql',
  ]) {
    const source = read(file);
    assert.match(
      source,
      /current_setting\('kickoff\.dblink_password', true\)/,
      `${file} must read the worker password from the GUC`,
    );
    assert.match(
      source,
      /password=%s/,
      `${file} must put the password into the worker conninfo`,
    );
  }
});

test('DB-3 no credential is written into the repository', () => {
  // The local password is the well-known Supabase development password, but it
  // still must not be hard-coded: it is read from the stack at runtime.
  const runner = read('scripts/run-pgtap.sh');
  assert.doesNotMatch(
    runner,
    /DB_PASSWORD\s*=\s*['"]postgres['"]/,
    'the runner must not hard-code the database password',
  );

  // The gate must run the local stack, not the hosted project.
  const output = execFileSync('bash', ['-n', 'scripts/run-pgtap.sh'], { cwd: root });
  assert.equal(output.toString(), '');
});

test('DB-4 the password reaches SQL as a quoted variable, not a literal', () => {
  const runner = read('scripts/run-pgtap.sh');

  // A password containing a single quote would otherwise break the statement
  // — or, worse, be able to inject SQL into the preamble that runs before
  // every suite. psql's `:'name'` quoting is the safe way to pass it.
  assert.doesNotMatch(
    runner,
    /dblink_password\s*=\s*'\$\{?[A-Za-z_]/,
    "the password must not be interpolated into the SQL literal — use psql's :'variable' quoting",
  );
  assert.match(
    runner,
    /\\getenv\s+dblink_password\s+KICKOFF_DBLINK_PASSWORD/,
    'psql must read the password from the environment, so it never touches a file',
  );
  assert.match(
    runner,
    /:'[a-z_]*dblink_password[a-z_]*'/,
    "the preamble must set the GUC through a quoted psql variable",
  );

  // The password travels in the environment, so the temporary preamble file
  // must stay secret-free.
  assert.doesNotMatch(
    runner,
    /echo\s+"\$?\{?(DB_PASSWORD|SUPABASE_DB_PASSWORD)\}?"\s*>>?\s*"\$tmp"/,
    'the password must not be written into the temporary preamble file',
  );
});

test('DB-5 the password never reaches the psql command line', () => {
  const runner = read('scripts/run-pgtap.sh');

  // A connection string with the password in it is visible in `ps` to every
  // user on the machine, so the runner must keep the password in the
  // environment and hand psql a connection string without it.
  assert.doesNotMatch(
    runner,
    /psql\s+"\$DB_URL"/,
    'psql must not be given the URL that carries the password',
  );
  assert.match(
    runner,
    /pg-url-parts\.mjs/,
    'the runner must split the URL so the password can be kept out of it',
  );
});

test('DB-6 the URL splitter keeps the password out of the connection string', async () => {
  const { execFileSync } = await import('node:child_process');
  const output = execFileSync(
    'node',
    ['scripts/pg-url-parts.mjs', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'],
    { cwd: root, encoding: 'utf8' },
  );
  const [connection, password] = output.trim().split('\n');

  assert.equal(
    connection,
    'host=127.0.0.1 port=54322 dbname=postgres user=postgres',
  );
  assert.equal(password, 'postgres');
  assert.doesNotMatch(
    connection,
    /password\s*=/,
    'the connection string must not carry the password',
  );

  // A URL with no password is an error, not a silent empty password.
  assert.throws(() =>
    execFileSync('node', ['scripts/pg-url-parts.mjs', 'postgresql://postgres@127.0.0.1/postgres'], {
      cwd: root,
      encoding: 'utf8',
    }),
  );
});
