export type RunStatus = 'ok' | 'retry' | 'fail';

// One job's night. Times keep the offset from the log.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

// Rows are sorted by job. badLines counts the lines that did not parse.
export type Night = { night: string; rows: DigestRow[]; badLines: number };

// null when the night has no file. The implementation lives in src/digest/read.ts.
export type ReadNight = (runsDir: string, night: string) => Night | null;
