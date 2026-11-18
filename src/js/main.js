(() => {
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Conversion events for whichever analytics tool is on the page (none of them is required).
  // GA4 queues the event and sends it only after consent (js/consent.js).
  const track = (name) => {
    try {
      if (typeof window.gtag === 'function') window.gtag('event', name);
      if (typeof window.plausible === 'function') window.plausible(name);
      if (window.goatcounter && typeof window.goatcounter.count === 'function') window.goatcounter.count({ path: name, event: true });
    } catch { /* analytics must never break the page */ }
  };

  const form = document.getElementById('lead-form');
  const status = document.getElementById('form-status');
  if (!form || !status) return;

  // Messages live in data-msg-* attributes on the form so they can be translated in HTML.
  const msg = (key) => form.dataset['msg' + key[0].toUpperCase() + key.slice(1)] || '';
  const button = form.querySelector('button[type="submit"]');

  // Cloudflare Turnstile (anti-bot check needed for the autoreply), loaded only when someone starts
  // using the form, so it costs nothing on page load. Without it the enquiry still arrives.
  const turnstileBox = form.querySelector('[data-turnstile]');
  let turnstileId;
  if (turnstileBox) {
    const start = () => {
      if (window.__turnstileStarted) return;
      window.__turnstileStarted = true;
      window.onTurnstileLoad = () => {
        turnstileId = window.turnstile.render(turnstileBox, { sitekey: turnstileBox.dataset.turnstile, appearance: 'interaction-only' });
      };
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';
      s.async = true;
      document.head.append(s);
    };
    form.addEventListener('focusin', start, { once: true });
    form.addEventListener('pointerenter', start, { once: true });
  }

  // Without JS the form still posts normally to the form service.
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.textContent = msg('sending');
    if (button) button.disabled = true;
    try {
      const res = await fetch(form.action, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form),
      });
      if (!res.ok) throw new Error(String(res.status));
      form.reset();
      if (turnstileId !== undefined && window.turnstile) window.turnstile.reset(turnstileId); // a token works once
      status.textContent = msg('success');
      track('generate_lead');
    } catch {
      status.textContent = msg('error');
    } finally {
      if (button) button.disabled = false;
    }
  });
})();
