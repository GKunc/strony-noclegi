// Cloudflare Turnstile for the contact form: loaded only when someone starts using the form, so it costs
// nothing on page load. Its hidden token (cf-turnstile-response) goes with the form; the form worker sends
// the visitor the autoreply only with a valid one. Without it the enquiry still arrives.
(() => {
  const box = document.querySelector('form [data-turnstile]');
  if (!box) return;
  const form = box.closest('form');
  let id;
  const start = () => {
    if (window.__turnstileStarted) return;
    window.__turnstileStarted = true;
    window.onTurnstileLoad = () => {
      id = window.turnstile.render(box, { sitekey: box.dataset.turnstile, appearance: 'interaction-only' });
    };
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad';
    s.async = true;
    document.head.append(s);
  };
  form.addEventListener('focusin', start, { once: true });
  form.addEventListener('pointerenter', start, { once: true });
  // a token works once: a fresh one after each sent enquiry (the form is reset when it is sent)
  form.addEventListener('reset', () => { if (id !== undefined && window.turnstile) window.turnstile.reset(id); });
})();
