    /* PWA: service worker + install prompt */
    let _swReloading = false;
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').then(reg => {
          const offer = () => showUpdateBanner();
          if (reg.waiting && navigator.serviceWorker.controller) offer();
          reg.addEventListener('updatefound', () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener('statechange', () => {
              if ((nw.state === 'installed' || nw.state === 'activated') && navigator.serviceWorker.controller) offer();
            });
          });
          /* look for a new release when the app comes back to the foreground
             (installed PWAs are rarely reloaded by hand) */
          let lastCheck = Date.now();
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            if (Date.now() - lastCheck < 60 * 60 * 1000) return;
            lastCheck = Date.now();
            reg.update().catch(() => {});
          });
        }).catch(() => {});
        /* the new worker took over → load the fresh shell exactly once */
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (_swReloading) return;
          _swReloading = true;
          location.reload();
        });
      });
    }
    function showUpdateBanner() {
      if (document.getElementById('updBanner')) return;
      const fa = (document.documentElement.lang || 'fa') === 'fa';
      const b = document.createElement('div');
      b.id = 'updBanner';
      b.style.cssText = 'position:fixed;bottom:14px;inset-inline:14px;z-index:500;background:#2563eb;color:#fff;padding:12px 16px;border-radius:14px;display:flex;align-items:center;gap:10px;box-shadow:0 8px 30px rgba(0,0,0,.35);font-size:13.5px;font-weight:600';
      const span = document.createElement('span');
      span.style.flex = '1';
      span.textContent = fa ? '🔄 نسخه جدید Z Lift آماده است' : '🔄 A new version of Z Lift is ready';
      b.appendChild(span);
      const btn = document.createElement('button');
      btn.textContent = fa ? 'بروزرسانی' : 'Update';
      btn.style.cssText = 'background:#fff;color:#2563eb;border:0;border-radius:9px;padding:8px 14px;font-weight:700;font-family:inherit;cursor:pointer';
      btn.onclick = () => {
        btn.disabled = true;
        navigator.serviceWorker.getRegistration().then(reg => {
          if (reg && reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
        }).catch(() => {}).finally(() => {
          // controllerchange normally reloads; this is the safety net
          setTimeout(() => { if (!_swReloading) { _swReloading = true; location.reload(); } }, 1500);
        });
      };
      b.appendChild(btn);
      const later = document.createElement('button');
      later.textContent = '✕';
      later.setAttribute('aria-label', fa ? 'بستن' : 'Dismiss');
      later.style.cssText = 'background:transparent;color:#fff;border:0;font-size:15px;cursor:pointer;padding:4px 6px';
      later.onclick = () => b.remove();
      b.appendChild(later);
      document.body.appendChild(b);
    }
    let _deferredInstall = null;
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      _deferredInstall = e;
      const btn = document.getElementById('installBtn');
      if (btn) btn.classList.remove('hidden');
    });
    /* iOS Safari has no beforeinstallprompt: the install button stayed hidden
       forever on iPhones. Show it and give the Share-sheet instructions. */
    const _isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const _isStandalone = window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    function showIOSInstallHint() {
      if (document.getElementById('iosHint')) return;
      const fa = (document.documentElement.lang || 'fa') === 'fa';
      const b = document.createElement('div');
      b.id = 'iosHint';
      b.style.cssText = 'position:fixed;bottom:14px;inset-inline:14px;z-index:500;background:#1f2937;color:#fff;padding:14px 16px;border-radius:14px;display:flex;align-items:flex-start;gap:10px;box-shadow:0 8px 30px rgba(0,0,0,.35);font-size:13.5px;line-height:1.9';
      const span = document.createElement('span');
      span.style.flex = '1';
      span.textContent = fa
        ? '📲 برای نصب Z Lift روی آیفون: دکمهٔ اشتراک‌گذاری (Share ⬆️) در سافاری را بزنید، بعد «Add to Home Screen» را انتخاب کنید.'
        : '📲 To install Z Lift on iPhone: tap the Share button ⬆️ in Safari, then choose “Add to Home Screen”.';
      b.appendChild(span);
      const x = document.createElement('button');
      x.textContent = '✕';
      x.setAttribute('aria-label', fa ? 'بستن' : 'Dismiss');
      x.style.cssText = 'background:transparent;color:#fff;border:0;font-size:15px;cursor:pointer;padding:4px 6px';
      x.onclick = () => b.remove();
      b.appendChild(x);
      document.body.appendChild(b);
      setTimeout(() => { if (b.parentNode) b.remove(); }, 15000);
    }
    if (_isIOS && !_isStandalone) {
      window.addEventListener('load', () => {
        const btn = document.getElementById('installBtn');
        if (btn) btn.classList.remove('hidden');
      });
    }
    function promptInstall() {
      if (!_deferredInstall) { if (_isIOS) showIOSInstallHint(); return; }
      _deferredInstall.prompt();
      _deferredInstall.userChoice.finally(() => {
        _deferredInstall = null;
        const btn = document.getElementById('installBtn');
        if (btn) btn.classList.add('hidden');
      });
    }
    window.addEventListener('appinstalled', () => {
      const btn = document.getElementById('installBtn');
      if (btn) btn.classList.add('hidden');
    });