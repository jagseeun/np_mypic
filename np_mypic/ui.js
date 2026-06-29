(() => {
  const rootId = 'appModalRoot';
  const backGuardPages = [
    'gallery-page',
    'upload-page',
    'detail-page',
    'editor-page',
    'memo-page',
    'point-page'
  ];
  let activeClose = null;
  let backGuardReady = false;
  let backNoticeOpen = false;
  let logoNavigationBusy = false;

  function startPage() {
    document.documentElement.classList.add('page-ready');
    installGlobalNavigation();
    installBackGuard();
    requestAnimationFrame(() => {
      document.body.classList.add('page-entered');
    });
  }

  function navigate(url, options = {}) {
    const replace = Boolean(options.replace);
    document.body.classList.add('page-leaving');

    setTimeout(() => {
      if (replace) {
        window.location.replace(url);
      } else {
        window.location.href = url;
      }
    }, 170);
  }

  function currentPageName() {
    return window.location.pathname.split('/').pop() || 'index.html';
  }

  function navigateToPage(pageName) {
    if (currentPageName() === pageName) return;
    navigate(`./${pageName}`);
  }

  async function hasActiveSession() {
    try {
      const response = await fetch('/api/user/points', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store'
      });

      return response.ok;
    } catch (error) {
      console.error('Session check failed:', error);
      return false;
    }
  }

  function prepareInteractiveElement(element, label) {
    if (!element || element.dataset.globalNavReady === 'true') return false;

    element.dataset.globalNavReady = 'true';
    if (!element.hasAttribute('tabindex')) {
      element.tabIndex = 0;
    }
    if (!element.hasAttribute('role')) {
      element.setAttribute('role', 'button');
    }
    if (label && !element.hasAttribute('aria-label')) {
      element.setAttribute('aria-label', label);
    }

    return true;
  }

  function addKeyboardActivation(element, handler) {
    element.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;

      event.preventDefault();
      handler(event);
    });
  }

  function installGlobalNavigation() {
    const logoSelectors = [
      '.auth-brand',
      '.gallery-page .main-title',
      '.upload-page .header .title',
      '.detail-page .header .title',
      '.editor-page .header .title',
      '.memo-page .header .title',
      '.point-page .header .title'
    ];

    document.querySelectorAll(logoSelectors.join(',')).forEach((logo) => {
      if (!prepareInteractiveElement(logo, 'Go to My Pic home')) return;

      const handleLogoClick = async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (logoNavigationBusy) return;

        logoNavigationBusy = true;
        const isLoggedIn = await hasActiveSession();
        logoNavigationBusy = false;
        navigateToPage(isLoggedIn ? 'gallery.html' : 'index.html');
      };

      logo.addEventListener('click', handleLogoClick);
      addKeyboardActivation(logo, handleLogoClick);
    });

    document.querySelectorAll('.points-display, .point-display').forEach((pointsDisplay) => {
      if (!prepareInteractiveElement(pointsDisplay, 'Go to point earning page')) return;

      const handlePointsClick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        navigateToPage('points.html');
      };

      pointsDisplay.addEventListener('click', handlePointsClick);
      addKeyboardActivation(pointsDisplay, handlePointsClick);
    });
  }

  function shouldGuardBack() {
    return backGuardPages.some((pageClass) => document.body.classList.contains(pageClass));
  }

  function installBackGuard() {
    if (backGuardReady || !shouldGuardBack() || !window.history?.pushState) return;

    backGuardReady = true;
    const currentState = history.state && typeof history.state === 'object' ? history.state : {};
    history.replaceState({ ...currentState, mypicBackBase: true }, '', location.href);
    history.pushState({ mypicBackGuard: true }, '', location.href);

    window.addEventListener('popstate', () => {
      history.pushState({ mypicBackGuard: true }, '', location.href);

      if (backNoticeOpen) return;
      backNoticeOpen = true;
      openModal({
        title: '뒤로가기 안내',
        message: '브라우저 뒤로가기 대신 화면 안의 ← 버튼을 사용해주세요.',
        confirmText: '확인'
      }).finally(() => {
        backNoticeOpen = false;
      });
    });
  }

  function ensureRoot() {
    let root = document.getElementById(rootId);
    if (root) return root;

    root = document.createElement('div');
    root.id = rootId;
    root.className = 'app-modal-root';
    root.setAttribute('aria-live', 'polite');
    document.body.appendChild(root);
    return root;
  }

  function closeModal(root, resolve, value) {
    root.classList.remove('is-open');
    document.removeEventListener('keydown', activeClose);
    activeClose = null;

    setTimeout(() => {
      root.innerHTML = '';
      resolve(value);
    }, 140);
  }

  function openModal({
    title = '알림',
    message = '',
    variant = 'info',
    confirm = false,
    confirmText = '확인',
    cancelText = '취소'
  } = {}) {
    return new Promise((resolve) => {
      const root = ensureRoot();
      root.innerHTML = `
        <div class="app-modal-backdrop" data-modal-cancel></div>
        <section class="app-modal app-modal-${variant}" role="dialog" aria-modal="true" aria-labelledby="appModalTitle">
          <div class="app-modal-icon" aria-hidden="true"></div>
          <h2 class="app-modal-title" id="appModalTitle"></h2>
          <p class="app-modal-message"></p>
          <div class="app-modal-actions"></div>
        </section>
      `;

      const titleEl = root.querySelector('.app-modal-title');
      const messageEl = root.querySelector('.app-modal-message');
      const actions = root.querySelector('.app-modal-actions');

      titleEl.textContent = title;
      messageEl.textContent = String(message || '');

      if (confirm) {
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'app-modal-btn app-modal-btn-ghost';
        cancelBtn.textContent = cancelText;
        cancelBtn.addEventListener('click', () => closeModal(root, resolve, false));
        actions.appendChild(cancelBtn);
      }

      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'app-modal-btn app-modal-btn-primary';
      okBtn.textContent = confirmText;
      okBtn.addEventListener('click', () => closeModal(root, resolve, true));
      actions.appendChild(okBtn);

      activeClose = (event) => {
        if (event.key === 'Escape') {
          closeModal(root, resolve, confirm ? false : true);
        }
      };
      document.addEventListener('keydown', activeClose);

      root.querySelector('[data-modal-cancel]').addEventListener('click', () => {
        closeModal(root, resolve, confirm ? false : true);
      });

      requestAnimationFrame(() => {
        root.classList.add('is-open');
        okBtn.focus();
      });
    });
  }

  window.appAlert = (message, options = {}) => openModal({
    title: options.title || '알림',
    message,
    variant: options.variant || 'info',
    confirmText: options.confirmText || '확인'
  });

  window.appConfirm = (message, options = {}) => openModal({
    title: options.title || '확인',
    message,
    variant: options.variant || 'confirm',
    confirm: true,
    confirmText: options.confirmText || '확인',
    cancelText: options.cancelText || '취소'
  });

  window.appNavigate = navigate;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startPage, { once: true });
  } else {
    startPage();
  }
})();
