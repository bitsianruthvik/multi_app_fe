/**
 * Pull the human-readable message out of an axios-shaped error.
 *
 * fab_erp's backend returns `{ message }` (sometimes `{ error }`) on 4xx, and
 * that string is the only useful thing to show a user — "Item code ITM-0042
 * already exists" instead of "Request failed with status code 400". Roughly 50
 * hand-rolled dialogs used to surface the axios string; this is the one rule
 * they now share.
 *
 * Lives in its own module (not alongside FormDialog) so a file can import it
 * without tripping react-refresh's "only export components" rule.
 */
export function backendMessage(e: unknown, fallback = 'Something went wrong.'): string {
  const res = (e as { response?: { data?: { message?: string; error?: string } } })?.response;
  const fromBody = res?.data?.message ?? res?.data?.error;
  if (fromBody) return fromBody;

  const msg = (e as Error)?.message;
  // Axios' own string is noise to a user — treat it as no message at all.
  if (msg && !/^Request failed with status code/.test(msg)) return msg;

  return fallback;
}
