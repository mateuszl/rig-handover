import type { DigestRow, Night } from '../digest/types.js';

// Missing data is a dash, never an empty cell. Empty strings count as missing too.
const orDash = (value: string | null) => (value ? value : '—');

function DigestLine({ row }: { row: DigestRow }) {
  const warn = row.retries >= 3 || row.lastStatus === 'fail';
  return (
    <tr class={warn ? 'warn' : undefined}>
      <td>{row.job}</td>
      <td>{orDash(row.owner)}</td>
      <td>{row.runs}</td>
      <td>{row.retries}</td>
      <td>{row.lastStatus}</td>
      <td>{orDash(row.lastError)}</td>
      <td>{row.firstAt}</td>
      <td>{row.lastAt}</td>
    </tr>
  );
}

export function DigestView({ digest }: { digest: Night }) {
  const skipped = digest.badLines === 1 ? '1 bad line skipped' : `${digest.badLines} bad lines skipped`;
  return (
    <>
      <h1>digest {digest.night}</h1>
      {digest.badLines > 0 ? <p class="mute">{skipped}</p> : null}
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => (
              <DigestLine key={row.job} row={row} />
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
