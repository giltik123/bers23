export type AuthEmailSender = Readonly<{
  sendVerification: (input: Readonly<{ to: string; code: string; idempotencyKey: string }>) => Promise<void>;
  sendPasswordReset: (input: Readonly<{ to: string; resetUrl: string; idempotencyKey: string }>) => Promise<void>;
}>;

export class ResendEmailSender implements AuthEmailSender {
  constructor(private readonly input: Readonly<{ apiKey: string; from: string; fetcher: typeof fetch }>) {}

  async sendVerification(input: Readonly<{ to: string; code: string; idempotencyKey: string }>) {
    await this.send({
      to: input.to,
      subject: 'Verify your Bers account',
      text: `Your Bers verification code is ${input.code}. It expires shortly.`,
      idempotencyKey: input.idempotencyKey,
    });
  }

  async sendPasswordReset(input: Readonly<{ to: string; resetUrl: string; idempotencyKey: string }>) {
    await this.send({
      to: input.to,
      subject: 'Reset your Bers password',
      text: `Reset your Bers password using this one-time link: ${input.resetUrl}`,
      idempotencyKey: input.idempotencyKey,
    });
  }

  private async send(input: Readonly<{ to: string; subject: string; text: string; idempotencyKey: string }>) {
    const response = await this.input.fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.input.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({ from: this.input.from, to: [input.to], subject: input.subject, text: input.text }),
    });
    if (!response.ok) {
      throw Object.assign(new Error('Transactional email could not be delivered'), {
        status: 502,
        code: 'email_delivery_failed',
        retryable: true,
      });
    }
  }
}
