/* PARKEST 7.0 UI shell. Does not replace v6.7 spot/search/auth logic. */
(() => {
  'use strict';
  const nav = document.getElementById('parkest-bottom-nav');
  const views = [...document.querySelectorAll('.view')];
  if (!nav || views.length === 0) return;
  const updateNav = () => {
    const current = views.find(v => v.classList.contains('active'))?.id;
    nav.classList.toggle('hidden', !current || current === 'view-auth');
    nav.querySelectorAll('[data-v7-nav]').forEach(btn => {
      const active = btn.dataset.v7Nav === current;
      btn.classList.toggle('is-current', active);
      if (active) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
  };
  nav.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-v7-nav]');
    if (!btn) return;
    const target = btn.dataset.v7Nav;
    if (target === 'settings') {
      document.getElementById('btn-settings')?.click();
      return;
    }
    if (target === 'view-lascio') {
      if (!document.getElementById(target)?.classList.contains('active'))
        document.getElementById('btn-mode-lascio')?.click();
    } else if (target === 'view-cerco') {
      if (!document.getElementById(target)?.classList.contains('active'))
        document.getElementById('btn-mode-cerco')?.click();
    } else if (target === 'view-home') {
      if (!document.getElementById(target)?.classList.contains('active')) {
        const back = document.querySelector('.view.active [data-back]');
        if (back) back.click();
        else if (typeof showView === 'function') {
          if (typeof stopCercoChannel === 'function') stopCercoChannel();
          showView(target);
          if (typeof refreshHomeSummary === 'function') refreshHomeSummary();
        }
      }
    }
    updateNav();
  });
  const observer = new MutationObserver(updateNav);
  views.forEach(view => observer.observe(view, { attributes: true, attributeFilter: ['class'] }));
  updateNav();
})();
