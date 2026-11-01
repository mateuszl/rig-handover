import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const runsDir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };

const FULL = '2026-01-05';
const BAD = '2026-01-06';
const EMPTY = '2026-01-07';
const MISSING = '2026-01-08';

function line(at: string, job: string, status: string, owner: string | null, error?: string) {
  return JSON.stringify(error === undefined ? { at, job, status, owner } : { at, job, status, owner, error });
}

writeFileSync(
  join(runsDir, `${FULL}.jsonl`),
  [
    line('2026-01-05T01:00:00+01:00', 'lane/sync', 'ok', 'rook'),
    line('2026-01-05T01:10:00+01:00', 'fixtures/refresh', 'retry', 'rook', 'upstream 503'),
    line('2026-01-05T01:20:00+01:00', 'fixtures/refresh', 'retry', 'rook', 'upstream 503'),
    line('2026-01-05T01:30:00+01:00', 'fixtures/refresh', 'retry', 'rook', 'upstream 503'),
    line('2026-01-05T01:40:00+01:00', 'fixtures/refresh', 'ok', 'rook'),
    line('2026-01-05T02:00:00+01:00', 'notes/backup', 'fail', 'rook', 'quota exceeded'),
    line('2026-01-05T02:05:00+01:00', 'digest/render', 'ok', null),
  ].join('\n'),
);
writeFileSync(
  join(runsDir, `${BAD}.jsonl`),
  [line('2026-01-06T01:00:00+01:00', 'lane/sync', 'ok', 'rook'), 'this is not json'].join('\n'),
);
writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

const FULL_NIGHT: Night = {
  night: FULL,
  badLines: 0,
  rows: [
    {
      job: 'digest/render',
      owner: null,
      runs: 1,
      retries: 0,
      fails: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-01-05T02:05:00+01:00',
      lastAt: '2026-01-05T02:05:00+01:00',
    },
    {
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      fails: 0,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-01-05T01:10:00+01:00',
      lastAt: '2026-01-05T01:40:00+01:00',
    },
    {
      job: 'lane/sync',
      owner: 'rook',
      runs: 1,
      retries: 0,
      fails: 0,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-01-05T01:00:00+01:00',
      lastAt: '2026-01-05T01:00:00+01:00',
    },
    {
      job: 'notes/backup',
      owner: 'rook',
      runs: 1,
      retries: 0,
      fails: 1,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
      firstAt: '2026-01-05T02:00:00+01:00',
      lastAt: '2026-01-05T02:00:00+01:00',
    },
  ],
};

const get = (path: string) => createApp(config).request(path);

// Fetch a page or API answer and assert it is 200 before the body is used.
async function pageOf(night: string): Promise<string> {
  const res = await get(`/digest/${night}`);
  expect(res.status).toBe(200);
  return res.text();
}

async function apiOf(night: string): Promise<Night> {
  const res = await get(`/api/digest/${night}`);
  expect(res.status).toBe(200);
  return (await res.json()) as Night;
}

// The table row (<tr>) that mentions this job, or undefined when there is none.
function rowOf(html: string, job: string): string | undefined {
  return html.split('<tr').find((chunk) => chunk.includes(job));
}

describe('GET /digest/:night (page)', () => {
  it('answers 200 with one HTML table, jobs in order', async () => {
    const res = await get(`/digest/${FULL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(html.split('<table').length - 1).toBe(1);
    for (const row of FULL_NIGHT.rows) expect(html).toContain(row.job);
  });

  it('marks a row warn when retries are 3 or more, or the last status is fail', async () => {
    const html = await pageOf(FULL);
    expect(rowOf(html, 'fixtures/refresh')).toContain('class="warn"');
    expect(rowOf(html, 'notes/backup')).toContain('class="warn"');
    expect(rowOf(html, 'lane/sync')).not.toContain('class="warn"');
    expect(rowOf(html, 'digest/render')).not.toContain('class="warn"');
  });

  it('renders a null owner as an em dash', async () => {
    const html = await pageOf(FULL);
    expect(rowOf(html, 'digest/render')).toContain('—');
  });

  it('shows a line containing "bad line" for a night with a bad line', async () => {
    const res = await get(`/digest/${BAD}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('bad line');
  });

  it('says "nothing ran" for an empty night', async () => {
    const res = await get(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await get(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('answers 200 with the Night object', async () => {
    expect(await apiOf(FULL)).toEqual(FULL_NIGHT);
  });

  it('counts a bad line in badLines and leaves it out of rows', async () => {
    const night = await apiOf(BAD);
    expect(night.badLines).toBe(1);
    expect(night.rows.map((r) => r.job)).toEqual(['lane/sync']);
  });

  it('answers 200 with no rows for an empty night', async () => {
    expect(await apiOf(EMPTY)).toEqual({ night: EMPTY, rows: [], badLines: 0 });
  });

  it('answers 404 with an error for a night with no file', async () => {
    const res = await get(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });
});

describe('page and JSON agree', () => {
  it('lists the jobs in the page in the same order as the JSON rows', async () => {
    const html = await pageOf(FULL);
    const night = await apiOf(FULL);
    const jobs = night.rows.map((r) => r.job);
    const positions = jobs.map((job) => html.indexOf(job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
