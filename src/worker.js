// Cloudflare Worker entry point.
// Handles POST /contact (relays to Resend) and falls through to the
// ASSETS binding (the public/ folder) for every other request — this
// replaces the old Cloudflare Pages Functions setup, since this Cloudflare
// account's dashboard now deploys everything through Workers.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/contact' && request.method === 'POST') {
      return handleContact(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

async function handleContact(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const name = (body.name || '').toString().trim();
  const email = (body.email || '').toString().trim();
  const message = (body.message || '').toString().trim();
  const honeypot = (body.website || '').toString().trim();

  // Honeypot: real users never see or fill this field. Any bot that fills
  // every input blindly gets silently accepted (so it doesn't learn the
  // check exists) but nothing is actually sent.
  if (honeypot) {
    return json({ ok: true }, 200);
  }

  if (!name || !email || !message) {
    return json({ error: 'Missing required fields' }, 400);
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return json({ error: 'Invalid email address' }, 400);
  }

  const escapeHtml = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'HeronScribe <hello@heronscribe.app>',
      to: ['heronscribeapp@gmail.com'],
      reply_to: email,
      subject: `New enquiry from ${name} — heronscribe.app`,
      html: `
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Message:</strong></p>
        <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
      `,
    }),
  });

  if (!resendResponse.ok) {
    const errText = await resendResponse.text();
    console.error('Resend error:', errText);
    return json({ error: 'Failed to send message' }, 502);
  }

  return json({ ok: true }, 200);
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
