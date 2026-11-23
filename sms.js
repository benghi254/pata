// Sends SMS through Africa's Talking (https://africastalking.com).
// Settings: AT_USERNAME and AT_API_KEY (use username "sandbox" with a sandbox key to test without
// sending real messages), and optionally AT_SENDER_ID for a registered sender name.
// Without them, local development prints messages to the console instead, and production says
// SMS is not set up (the rating form then shows "coming soon" rather than failing).
const IS_PROD = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);

const configured = () => Boolean(process.env.AT_USERNAME && process.env.AT_API_KEY);

// Can we send codes at all? (Real SMS, or the local console stand-in.)
const available = () => configured() || !IS_PROD;

// True when codes are printed locally instead of texted, so pages can show them to the developer.
const devMode = () => !configured() && !IS_PROD;

// 0712345678 -> +254712345678
const international = (phone) => `+254${phone.slice(1)}`;

async function send(phone, message) {
  if (!configured()) {
    if (IS_PROD) throw new Error('SMS is not set up (AT_USERNAME / AT_API_KEY).');
    console.log(`[sms, dev only] to ${phone}: ${message}`);
    return { dev: true };
  }
  const username = process.env.AT_USERNAME;
  const host = username === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
  const body = new URLSearchParams({ username, to: international(phone), message });
  if (process.env.AT_SENDER_ID) body.set('from', process.env.AT_SENDER_ID);
  const res = await fetch(`https://${host}/version1/messaging`, {
    method: 'POST',
    headers: { apiKey: process.env.AT_API_KEY, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => null);
  const recipient = data && data.SMSMessageData && data.SMSMessageData.Recipients && data.SMSMessageData.Recipients[0];
  // 100 = processed, 101 = sent, 102 = queued.
  if (!res.ok || !recipient || ![100, 101, 102].includes(recipient.statusCode)) {
    const why = (recipient && recipient.status) || (data && data.SMSMessageData && data.SMSMessageData.Message) || res.status;
    throw new Error(`SMS not sent: ${why}`);
  }
  return { sent: true };
}

module.exports = { available, devMode, send };
