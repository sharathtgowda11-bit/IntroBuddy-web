/**
 * Talks to local Supabase's Mailpit capture server so integration tests
 * can retrieve the real emailed activation/reset links -- the API never
 * returns a token in a response body, on purpose, so this is the only
 * way to exercise the full flow end to end.
 */

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

interface MailpitMessageSummary {
  ID: string;
  To: Array<{ Address: string }>;
}

interface MailpitMessageDetail {
  Text: string;
}

export async function clearMailpit(): Promise<void> {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: "DELETE" });
}

/** Polls Mailpit for a message sent to `to`, returning its plain-text body once it arrives. */
export async function waitForEmailTo(to: string, timeoutMs = 5000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const listResponse = await fetch(`${MAILPIT_URL}/api/v1/messages`);
    const list = (await listResponse.json()) as { messages: MailpitMessageSummary[] };
    const match = list.messages.find((message) => message.To.some((recipient) => recipient.Address === to));
    if (match) {
      const detailResponse = await fetch(`${MAILPIT_URL}/api/v1/message/${match.ID}`);
      const detail = (await detailResponse.json()) as MailpitMessageDetail;
      return detail.Text;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`no email arrived for ${to} within ${timeoutMs}ms`);
}

/** Extracts the compound token from the first `token=` query parameter found in an email body. */
export function extractTokenFromEmail(text: string): string {
  const match = text.match(/[?&]token=([^&\s\r\n]+)/);
  if (!match) {
    throw new Error("no token found in email body");
  }
  return decodeURIComponent(match[1]);
}
