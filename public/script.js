document.getElementById('contact-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const form = e.target;
  const statusEl = document.getElementById('contact-status');
  const submitBtn = document.getElementById('contact-submit');

  const payload = {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    message: form.message.value.trim(),
    website: form.website.value.trim(),
  };

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';
  statusEl.textContent = '';
  statusEl.className = 'contact-status';

  try {
    const res = await fetch('/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error('Request failed');

    statusEl.textContent = "Thanks — we'll be in touch soon.";
    statusEl.className = 'contact-status ok';
    form.reset();
  } catch (err) {
    statusEl.textContent = 'Something went wrong sending that. Please try again or email hello@heronscribe.app directly.';
    statusEl.className = 'contact-status error';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send message';
  }
});
