import test from 'node:test';
import assert from 'node:assert/strict';

test('global pause blocks provider requests even with a configured email key', async () => {
  const originalPause = process.env.EMAILS_PAUSED;
  const originalKey = process.env.RESEND_API_KEY;
  const originalFetch = globalThis.fetch;
  let requests = 0;
  process.env.RESEND_API_KEY = 'test-only-key';
  globalThis.fetch = async () => { requests++; return { ok: true }; };
  try {
    for (const setting of [undefined, 'true', '', 'FALSE']) {
      if (setting === undefined) delete process.env.EMAILS_PAUSED;
      else process.env.EMAILS_PAUSED = setting;
      const mail = await import(`../email-delivery.js?paused=${encodeURIComponent(String(setting))}`);
      assert.equal(mail.EMAILS_PAUSED, true);
      await assert.rejects(mail.sendEmail('recipient@example.com', 'Test', '<p>Test</p>'),
        /Email delivery is temporarily paused/);
    }
    assert.equal(requests, 0);
    process.env.EMAILS_PAUSED = 'false';
    const resumed = await import('../email-delivery.js?resumed');
    assert.equal(resumed.EMAILS_PAUSED, false);
    await resumed.sendEmail('recipient@example.com', 'Test', '<p>Test</p>');
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalPause === undefined) delete process.env.EMAILS_PAUSED;
    else process.env.EMAILS_PAUSED = originalPause;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  }
});
