import nodemailer from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

// Mailbox providers whose DMARC policy makes a relay (Brevo) unable to send as them: the mail is
// accepted by the relay, then dropped or junked by the recipient, so codes vanish without an error.
const FREEMAIL = new Set([
  'me.com',
  'icloud.com',
  'mac.com',
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'gmx.de',
  'gmx.net',
  'web.de',
]);

/** Why MAIL_FROM can't be delivered from a relay, or null when its domain is fine. */
export function senderProblem(from: string): string | null {
  const domain = from
    .match(/@([^\s>]+)/)?.[1]
    ?.toLowerCase()
    .replace(/\.$/, '');
  if (!domain) return `MAIL_FROM "${from}" has no email address`;
  if (FREEMAIL.has(domain))
    return `MAIL_FROM uses ${domain}, which the relay can't authenticate (DMARC): codes won't arrive. Use an address at a domain verified in Brevo.`;
  return null;
}

/** SMTP delivery. In development this points at Mailpit (http://127.0.0.1:8025 shows the inbox). */
export function createSmtpMailer(
  smtpUrl: string,
  from: string,
): Mailer & { verify(): Promise<void> } {
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    async send(mail) {
      await transport.sendMail({ from, ...mail });
    },
    /** Connects and logs in once, so a refused SMTP login shows at startup, not on a sign-in. */
    async verify() {
      await transport.verify();
    },
  };
}

/** Keeps mail in memory; used by tests to read sign-in codes. */
export function createMemoryMailer(): Mailer & {
  sent: Mail[];
  lastCodeFor(email: string): string;
} {
  const sent: Mail[] = [];
  return {
    sent,
    async send(mail) {
      sent.push(mail);
    },
    lastCodeFor(email) {
      const mail = [...sent].reverse().find((m) => m.to === email);
      const code = mail?.text.match(/\b(\d{6})\b/)?.[1];
      if (!code) throw new Error(`no code sent to ${email}`);
      return code;
    },
  };
}
