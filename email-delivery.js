// An emergency pause remains available; monthly limits and duplicate guards live in email-policy.js.
export const EMAILS_PAUSED = process.env.EMAILS_PAUSED === 'true';
export const EMAIL_PAUSE_MESSAGE = 'Email delivery is temporarily paused.';

export async function sendEmail(to, subject, html, { idempotencyKey } = {}) {
  if (EMAILS_PAUSED) throw new Error(EMAIL_PAUSE_MESSAGE);
  const apiKey = process.env.RESEND_API_KEY || '';
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'The Bay Dashboard <onboarding@resend.dev>',
      to: [to], subject, html
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend API error (${res.status}): ${body}`);
  }
}
