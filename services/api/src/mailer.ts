import nodemailer from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** SMTP delivery. In development this points at Mailpit (http://127.0.0.1:8025 shows the inbox). */
export function createSmtpMailer(smtpUrl: string, from: string): Mailer {
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    async send(mail) {
      await transport.sendMail({ from, ...mail });
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
