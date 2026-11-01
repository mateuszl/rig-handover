import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus } from './types.js';

type Line = { at: string; job: string; status: RunStatus; owner: string | null; error: string | null };

const STATUSES: readonly string[] = ['ok', 'retry', 'fail'];
const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

// Parse at the edge: anything that is not a full log line comes back as null.
function parseLine(text: string): Line | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { at, job, status, owner, error } = value as Record<string, unknown>;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  if (typeof job !== 'string' || job === '') return null;
  if (typeof status !== 'string' || !STATUSES.includes(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  return { at, job, status: status as RunStatus, owner, error: error ?? null };
}

function addLine(row: DigestRow | undefined, line: Line): DigestRow {
  if (!row) {
    return {
      job: line.job,
      owner: line.owner,
      runs: 1,
      retries: line.status === 'retry' ? 1 : 0,
      lastStatus: line.status,
      lastError: line.error,
      firstAt: line.at,
      lastAt: line.at,
    };
  }
  row.runs += 1;
  if (line.status === 'retry') row.retries += 1;
  if (Date.parse(line.at) < Date.parse(row.firstAt)) row.firstAt = line.at;
  if (Date.parse(line.at) >= Date.parse(row.lastAt)) {
    row.lastAt = line.at;
    row.lastStatus = line.status;
    row.owner = line.owner;
    if (line.error) row.lastError = line.error;
  }
  return row;
}

export const readNight: ReadNight = (runsDir, night) => {
  // The night comes from the URL, so it never reaches a path unchecked.
  if (!NIGHT.test(night)) return null;
  const path = join(runsDir, `${night}.jsonl`);
  if (!existsSync(path)) return null;

  const rows = new Map<string, DigestRow>();
  let badLines = 0;
  for (const text of readFileSync(path, 'utf8').split('\n')) {
    if (text.trim() === '') continue;
    const line = parseLine(text);
    if (!line) {
      badLines += 1;
      continue;
    }
    rows.set(line.job, addLine(rows.get(line.job), line));
  }

  const sorted = [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows: sorted, badLines };
};
