// Header: light/dark switch and mobile menu (same behaviour as the template's newer header).
// The theme choice is remembered in localStorage ("theme") only after a click; until then the page follows the system.
// The saved choice is applied in <head> (src/_partials/head.html) so the page never flashes.
(() => {
  const root = document.documentElement;
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => (root.dataset.theme || (systemDark.matches ? 'dark' : 'light')) === 'dark';
  const themeButtons = document.querySelectorAll('.theme-toggle');
  const syncTheme = () => themeButtons.forEach((b) => {
    b.setAttribute('aria-pressed', String(isDark()));
  });
  themeButtons.forEach((b) => b.addEventListener('click', () => {
    root.dataset.theme = isDark() ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch { /* private mode: still switches */ }
    syncTheme();
  }));
  systemDark.addEventListener('change', syncTheme);
  syncTheme();

  const header = document.querySelector('.site-header');
  const menuButton = header && header.querySelector('.menu-toggle');
  if (!header || !menuButton) return;
  const setMenu = (open) => {
    header.classList.toggle('menu-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Zamknij menu' : 'Menu');
  };
  menuButton.addEventListener('click', () => setMenu(!header.classList.contains('menu-open')));
  header.querySelectorAll('nav a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && header.classList.contains('menu-open')) { setMenu(false); menuButton.focus(); }
  });
  document.addEventListener('click', (e) => { if (!header.contains(e.target)) setMenu(false); });
})();
