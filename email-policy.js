import crypto from 'node:crypto';
import { sendEmail } from './email-delivery.js';

export const EMAIL_POLICY_VERSION = 'monthly-newsletter-v1';

export async function initEmailPolicy(pool) {
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS next_newsletter_at TIMESTAMPTZ');
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS last_newsletter_issue TEXT');
  await pool.query(`CREATE TABLE IF NOT EXISTS email_policy_migrations (
    id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS monthly_newsletter_deliveries (
    id TEXT PRIMARY KEY, username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    recipient TEXT NOT NULL, month TEXT NOT NULL, issue TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'reserved', reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ, UNIQUE(username, month), UNIQUE(recipient, month), UNIQUE(username, issue)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS manual_email_deliveries (
    delivery_key TEXT PRIMARY KEY, username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    claim_id TEXT NOT NULL, reserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'reserved'
  )`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const reset = await client.query(`INSERT INTO email_policy_migrations (id) VALUES ($1)
      ON CONFLICT (id) DO NOTHING RETURNING id`, [EMAIL_POLICY_VERSION]);
    if (reset.rows.length) {
      // Reset the delivery clock once, without deleting addresses, opt-outs, or send history.
      await client.query(`UPDATE users SET email_frequency = 'monthly',
        next_newsletter_at = now() + interval '1 month'
        WHERE email_frequency <> 'off'`);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  return (await pool.query('SELECT applied_at FROM email_policy_migrations WHERE id = $1', [EMAIL_POLICY_VERSION])).rows[0].applied_at;
}

export async function scheduleFirstNewsletter(pool, username) {
  // A new subscription or a changed address starts a fresh wait, never an immediate email.
  await pool.query(`UPDATE users SET next_newsletter_at =
    GREATEST(COALESCE(next_newsletter_at, now()), now() + interval '1 month')
    WHERE username = $1`, [username]);
}

export function newsletterMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit'
  }).formatToParts(now);
  return parts.find(p => p.type === 'year').value + '-' + parts.find(p => p.type === 'month').value;
}

export async function claimMonthlyNewsletter(pool, username, issue) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Reserve before contacting Resend. Concurrent jobs and a crash after delivery cannot
    // reuse the slot, even if the caller asks to force a run or the final status write fails.
    const claimed = await client.query(`UPDATE users SET next_newsletter_at = now() + interval '1 month'
      WHERE username = $1 AND kind = 'account' AND email_frequency = 'monthly'
      AND email IS NOT NULL AND next_newsletter_at <= now()
      AND (last_newsletter_issue IS NULL OR last_newsletter_issue <> $2)
      RETURNING username, email`, [username, issue]);
    let delivery = null;
    if (claimed.rows.length) {
      const account = claimed.rows[0];
      const id = crypto.randomUUID();
      const inserted = await client.query(`INSERT INTO monthly_newsletter_deliveries
        (id, username, recipient, month, issue) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT DO NOTHING RETURNING id`,
      [id, username, account.email.trim().toLowerCase(), newsletterMonth(), issue]);
      if (inserted.rows.length) delivery = { id, ...account };
    }
    await client.query('COMMIT');
    return delivery;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function sendManualEmail(pool, username, kind, resource, to, subject, html) {
  const deliveryKey = crypto.createHash('sha256')
    .update(JSON.stringify([username, kind, resource, to.trim().toLowerCase()])).digest('hex');
  const claimId = crypto.randomUUID();
  const claim = await pool.query(`INSERT INTO manual_email_deliveries
    (delivery_key, username, claim_id) VALUES ($1,$2,$3)
    ON CONFLICT (delivery_key) DO UPDATE SET claim_id = EXCLUDED.claim_id,
      reserved_at = now(), status = 'reserved'
    WHERE manual_email_deliveries.reserved_at <= now() - interval '10 minutes'
    RETURNING claim_id`, [deliveryKey, username, claimId]);
  if (!claim.rows.length) return { alreadyRequested: true };
  try {
    await sendEmail(to, subject, html, { idempotencyKey: 'manual/' + claimId });
    await pool.query(`UPDATE manual_email_deliveries SET status = 'sent'
      WHERE delivery_key = $1 AND claim_id = $2`, [deliveryKey, claimId]);
    return { alreadyRequested: false };
  } catch (error) {
    // Retain the reservation: a timeout or failed status write may follow an accepted email.
    await pool.query(`UPDATE manual_email_deliveries SET status = 'unknown'
      WHERE delivery_key = $1 AND claim_id = $2`, [deliveryKey, claimId]).catch(() => {});
    throw error;
  }
}
