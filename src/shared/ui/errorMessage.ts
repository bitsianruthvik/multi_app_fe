/**
 * Pull the human-readable message (and any itemised problems) out of a failed
 * request, whatever shape the app's client throws.
 *
 * The kit cannot know an app's error class, and it must not guess: the backend's
 * own `message` is the only useful thing to show a user — "Item code ITM-0042
 * already exists" instead of "Request failed with status code 400". That one
 * detail is the difference between a dialog that helps and a dialog that
 * shrugs. Handles the axios shape (`e.response.data.message`), a fetch client
 * that throws an Error with the message already unwrapped, and a client that
 * carries a `problems` array (a list of everything the backend objected to).
 *
 * Lives in its own module so a component file can import it without tripping
 * react-refresh's "only export components" rule.
 */

interface ErrorBody {
  message?: string;
  error?: string;
  problems?: unknown;
}

function body(e: unknown): ErrorBody | undefined {
  const res = (e as { response?: { data?: ErrorBody } })?.response;
  return res?.data;
}

export function errorMessage(e: unknown, fallback = 'Something went wrong.'): string {
  const fromBody = body(e)?.message ?? body(e)?.error;
  if (fromBody) return fromBody;

  const msg = (e as Error)?.message;
  // Axios' own string is noise to a user — treat it as no message at all.
  if (msg && !/^Request failed with status code/.test(msg)) return msg;

  return fallback;
}

/** The itemised problems a validating backend returned, if it returned any. */
export function errorProblems(e: unknown): string[] {
  const raw = (e as { problems?: unknown })?.problems ?? body(e)?.problems;
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => (typeof p === 'string' ? p : String((p as { message?: string })?.message ?? p)));
}
