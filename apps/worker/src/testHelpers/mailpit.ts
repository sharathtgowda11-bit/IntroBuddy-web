/**
 * Talks to local Supabase's Mailpit capture server so integration tests
 * can retrieve the real emailed invitation links. Duplicated from
 * apps/api's own copy rather than shared -- small, test-only, and each
 * app already accepts this kind of deliberate duplication for
 * infrastructure with no app of its own to depend on (see
 * packages/invitations' identity.ts/email.ts).
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
