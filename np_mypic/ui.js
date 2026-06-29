(() => {
  const rootId = 'appModalRoot';
  let activeClose = null;

  function startPage() {
    document.documentElement.classList.add('page-ready');
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
