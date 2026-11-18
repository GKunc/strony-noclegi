// Google Analytics 4 behind a consent banner (Google Consent Mode v2, "basic" mode):
// gtag.js is not even downloaded until the visitor clicks "Accept". The choice is remembered in
// localStorage; "Cookie settings" in the footer reopens the banner, and rejecting later deletes the _ga cookies.
(() => {
  const banner = document.getElementById('consent');
  const id = banner && banner.dataset.ga;
  if (!banner || !id) return;

  const KEY = 'consent-analytics';
  const get = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const set = (v) => { try { localStorage.setItem(KEY, v); } catch { /* private mode: ask again next time */ } };

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', {
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied',
  });

  let loaded = false;
  function load() {
    if (loaded) return;
    loaded = true;
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
    window.gtag('js', new Date());
    window.gtag('config', id);
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
    document.head.append(s);
  }
  function forget() {
    const host = location.hostname;
    const domains = ['', host, '.' + host, '.' + host.split('.').slice(-2).join('.')];
    for (const c of document.cookie.split(';')) {
      const name = c.split('=')[0].trim();
      if (!/^_ga/.test(name)) continue;
      for (const d of domains) document.cookie = `${name}=; Max-Age=0; path=/${d ? '; domain=' + d : ''}`;
    }
  }

  const choice = get();
  if (choice === 'granted') load();
  else if (choice === 'denied') forget(); // leftovers from an earlier "Accept"
  else banner.hidden = false;

  banner.addEventListener('click', (e) => {
    const button = e.target.closest('[data-consent]');
    if (!button) return;
    const value = button.dataset.consent;
    set(value);
    banner.hidden = true;
    if (value === 'granted') return load();
    window.gtag('consent', 'update', { analytics_storage: 'denied' }); // stop gtag writing cookies
    forget();
    if (loaded) location.reload(); // unload gtag.js
  });
  for (const open of document.querySelectorAll('[data-consent-open]')) {
    open.addEventListener('click', () => {
      banner.hidden = false;
      banner.querySelector('button')?.focus();
    });
  }
})();
