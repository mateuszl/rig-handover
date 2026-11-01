import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

function runsDir(night: string, content: string) {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  writeFileSync(join(dir, `${night}.jsonl`), content);
  return dir;
}

describe('readNight', () => {
  const night = readNight('runs', '2026-10-28')!;
  const row = (job: string) => night.rows.find((r) => r.job === job)!;

  it('reads 2026-10-28: 5 jobs, 1 bad line, sorted by job', () => {
    expect(night.badLines).toBe(1);
    expect(night.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts runs and retries and keeps the last error', () => {
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(row('notes/backup').lastStatus).toBe('fail');
    expect(row('notes/backup').lastError).toBe('quota exceeded');
  });

  it('keeps a row whose owner is null', () => {
    expect(row('digest/render').owner).toBeNull();
  });

  it('returns null for a night with no file or a night that is not a date', () => {
    expect(readNight('runs', '2026-01-01')).toBeNull();
    expect(readNight('runs', '../package')).toBeNull();
  });

  it('reads an empty file as no rows', () => {
    expect(readNight(runsDir('2026-01-02', ''), '2026-01-02')).toEqual({ night: '2026-01-02', rows: [], badLines: 0 });
  });

  it('counts valid JSON that is not a log line', () => {
    const dir = runsDir('2026-01-03', '{"job":"a"}\n42\n{"at":"2026-01-03T01:00:00+01:00","job":"a","status":"nope","owner":null}\n');
    expect(readNight(dir, '2026-01-03')).toEqual({ night: '2026-01-03', rows: [], badLines: 3 });
  });

  it('takes the last status by time, not by file order', () => {
    const dir = runsDir(
      '2026-01-04',
      [
        '{"at":"2026-01-04T02:00:00+01:00","job":"a","status":"ok","owner":"x"}',
        '{"at":"2026-01-04T01:00:00+01:00","job":"a","status":"fail","owner":"x","error":"boom"}',
      ].join('\n'),
    );
    const [only] = readNight(dir, '2026-01-04')!.rows;
    expect(only.lastStatus).toBe('ok');
    expect(only.firstAt).toBe('2026-01-04T01:00:00+01:00');
  });
});
