(function() {
  'use strict';

  if (window.SnaficPopup) return;

  let overlay, card, iconDiv, titleEl, msgEl, featuresContainer, confirmBtn, cancelBtn, progressFill, progressContainer;
  let autoCloseTimer = null;

  function init() {
    if (document.getElementById('snaficPopupStyles')) return;

    const css = document.createElement('style');
    css.id = 'snaficPopupStyles';
    css.textContent = `
      .snafic-popup-overlay {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.6); backdrop-filter: blur(12px);
        z-index: 10000; display: none; align-items: center; justify-content: center;
        opacity: 0; transition: opacity 0.25s ease;
        place-items: center;
      }
      .snafic-popup-overlay.active { display: flex; animation: snaficFadeOverlay 0.25s forwards; }
      @keyframes snaficFadeOverlay { from { opacity: 0; } to { opacity: 1; } }
      .snafic-popup-card {
        background: rgba(15,23,42,0.9); backdrop-filter: blur(24px);
        border-radius: 56px; border: 1px solid rgba(255,255,255,0.25);
        box-shadow: 0 40px 70px -20px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.1);
        width: 90%; max-width: 520px; text-align: center; padding: 2.2rem 2rem;
        margin: auto;
        animation: snaficPopupEnter 0.4s cubic-bezier(0.2,0.9,0.4,1.2); transform-origin: center;
        max-height: 90vh; overflow-y: auto;
      }
      @keyframes snaficPopupEnter {
        0% { opacity: 0; transform: scale(0.92) translateY(20px); }
        100% { opacity: 1; transform: scale(1) translateY(0); }
      }
      .snafic-check-ring {
        margin: 0 auto 1.3rem; width: 95px; height: 95px;
        background: linear-gradient(145deg,#10b981,#047857); border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        animation: snaficPopScale 0.4s cubic-bezier(0.34,1.4,0.64,1);
        box-shadow: 0 15px 30px -8px rgba(16,185,129,0.4);
      }
      .snafic-error-ring { background: linear-gradient(145deg,#ef4444,#b91c1c); box-shadow: 0 15px 30px -8px rgba(239,68,68,0.4); }
      .snafic-warning-ring { background: linear-gradient(145deg,#f59e0b,#d97706); box-shadow: 0 15px 30px -8px rgba(245,158,11,0.4); }
      .snafic-info-ring { background: linear-gradient(145deg,#3b82f6,#1e3a8a); box-shadow: 0 15px 30px -8px rgba(59,130,246,0.4); }
      @keyframes snaficPopScale {
        0% { transform: scale(0); opacity: 0; }
        70% { transform: scale(1.05); }
        100% { transform: scale(1); opacity: 1; }
      }
      .snafic-check-svg { width: 48px; height: 48px; stroke: white; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; fill: none; }
      .snafic-check-svg polyline { stroke-dasharray: 70; stroke-dashoffset: 70; animation: snaficDrawLine 0.4s ease 0.2s forwards; }
      @keyframes snaficDrawLine { to { stroke-dashoffset: 0; } }
      .snafic-popup-title {
        font-size: 1.9rem; font-weight: 700;
        background: linear-gradient(135deg,#ffffff,#cbd5e1); -webkit-background-clip: text; background-clip: text;
        color: transparent; margin-bottom: 0.5rem; letter-spacing: -0.3px;
      }
      .snafic-popup-message { color: #e2e8f0; font-size: 1rem; line-height: 1.5; margin: 1rem 0 1.2rem; white-space: pre-line; }
      .snafic-popup-features { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin: 1.4rem 0; }
      .snafic-feature-chip {
        background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2);
        border-radius: 60px; padding: 6px 16px; font-size: 0.85rem; font-weight: 500; color: #e0f2fe;
      }
      .snafic-popup-actions { display: flex; gap: 15px; justify-content: center; margin-top: 1.5rem; }
      .snafic-popup-btn {
        background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2);
        border-radius: 60px; padding: 10px 24px; font-weight: 600; color: white;
        cursor: pointer; font-size: 0.9rem; transition: all 0.2s ease;
      }
      .snafic-popup-btn-primary {
        background: linear-gradient(105deg,#3b82f6,#8b5cf6); border: none;
        box-shadow: 0 4px 12px rgba(59,130,246,0.3);
      }
      .snafic-popup-btn-primary:hover { transform: translateY(-2px); background: linear-gradient(105deg,#2563eb,#7c3aed); }
      .snafic-popup-btn-secondary:hover { background: rgba(255,255,255,0.2); transform: translateY(-2px); }
      .snafic-popup-progress { margin-top: 1.4rem; height: 3px; background: rgba(255,255,255,0.15); border-radius: 3px; overflow: hidden; }
      .snafic-popup-progress-fill { width: 0%; height: 100%; background: linear-gradient(90deg,#60a5fa,#c084fc); border-radius: 3px; }
      @media (max-width: 550px) {
        .snafic-popup-card { padding: 1.5rem; border-radius: 40px; max-width: 90%; }
        .snafic-popup-title { font-size: 1.5rem; }
        .snafic-check-ring { width: 75px; height: 75px; }
        .snafic-check-svg { width: 38px; height: 38px; }
      }
    `;
    document.head.appendChild(css);

    const html = `
      <div id="snaficPopupOverlay" class="snafic-popup-overlay">
        <div class="snafic-popup-card" id="snaficPopupCard">
          <div id="snaficPopupIcon" class="snafic-check-ring">
            <svg class="snafic-check-svg" viewBox="0 0 52 52"><polyline points="14,28 24,38 40,18" /></svg>
          </div>
          <div id="snaficPopupTitle" class="snafic-popup-title">Welcome to Snafic</div>
          <div id="snaficPopupMessage" class="snafic-popup-message">Popup message</div>
          <div id="snaficPopupFeatures" class="snafic-popup-features" style="display:none"></div>
          <div class="snafic-popup-actions">
            <button id="snaficPopupConfirm" class="snafic-popup-btn snafic-popup-btn-primary">Continue</button>
            <button id="snaficPopupCancel" class="snafic-popup-btn snafic-popup-btn-secondary" style="display:none">Cancel</button>
          </div>
          <div class="snafic-popup-progress">
            <div id="snaficPopupProgressFill" class="snafic-popup-progress-fill"></div>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);

    overlay = document.getElementById('snaficPopupOverlay');
    card = document.getElementById('snaficPopupCard');
    iconDiv = document.getElementById('snaficPopupIcon');
    titleEl = document.getElementById('snaficPopupTitle');
    msgEl = document.getElementById('snaficPopupMessage');
    featuresContainer = document.getElementById('snaficPopupFeatures');
    confirmBtn = document.getElementById('snaficPopupConfirm');
    cancelBtn = document.getElementById('snaficPopupCancel');
    progressFill = document.getElementById('snaficPopupProgressFill');
    progressContainer = document.querySelector('.snafic-popup-progress');

    confirmBtn.onclick = function() {
      if (autoCloseTimer) clearTimeout(autoCloseTimer);
      if (window.__snaficOnConfirm) window.__snaficOnConfirm();
      close();
    };
    cancelBtn.onclick = function() {
      if (autoCloseTimer) clearTimeout(autoCloseTimer);
      if (window.__snaficOnCancel) window.__snaficOnCancel();
      close();
    };
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) { if (autoCloseTimer) clearTimeout(autoCloseTimer); close(); }
    });
  }

  function reset() {
    if (autoCloseTimer) clearTimeout(autoCloseTimer);
    iconDiv.className = 'snafic-check-ring';
    iconDiv.innerHTML = '<svg class="snafic-check-svg" viewBox="0 0 52 52"><polyline points="14,28 24,38 40,18" /></svg>';
    featuresContainer.style.display = 'none';
    featuresContainer.innerHTML = '';
    cancelBtn.style.display = 'none';
    confirmBtn.textContent = 'Continue';
    progressFill.style.width = '0%';
    progressContainer.style.display = 'block';
    window.__snaficOnConfirm = null;
    window.__snaficOnCancel = null;
    window.__snaficAutoClose = null;
  }

  function close() {
    if (autoCloseTimer) clearTimeout(autoCloseTimer);
    overlay.classList.remove('active');
  }

  window.SnaficPopup = {
    show: function(opts) {
      if (!overlay) init();
      reset();

      const type = opts.type || 'success';
      const title = opts.title || 'Notification';
      const message = opts.message || '';
      const features = opts.features || [];
      const confirmText = opts.confirmText || 'Continue';
      const showCancel = opts.showCancel || false;
      const cancelText = opts.cancelText || 'Cancel';
      const autoClose = opts.autoClose || 0;
      const onConfirm = opts.onConfirm || null;
      const onCancel = opts.onCancel || null;

      const checkedSvg = '<svg class="snafic-check-svg" viewBox="0 0 52 52"><polyline points="14,28 24,38 40,18" /></svg>';
      iconDiv.className = 'snafic-check-ring';
      if (type === 'success') {
        iconDiv.className = 'snafic-check-ring';
        iconDiv.innerHTML = checkedSvg;
      } else if (type === 'error') {
        iconDiv.classList.add('snafic-error-ring');
        iconDiv.innerHTML = '<svg class="snafic-check-svg" viewBox="0 0 52 52"><line x1="16" y1="16" x2="36" y2="36" stroke="white" stroke-width="3"/><line x1="36" y1="16" x2="16" y2="36" stroke="white" stroke-width="3"/></svg>';
      } else if (type === 'warning') {
        iconDiv.classList.add('snafic-warning-ring');
        iconDiv.innerHTML = '<svg class="snafic-check-svg" viewBox="0 0 52 52"><path d="M26 8L4 44h44L26 8z" stroke="white" stroke-width="3" fill="none"/><circle cx="26" cy="32" r="2" fill="white"/><line x1="26" y1="24" x2="26" y2="30" stroke="white" stroke-width="3"/></svg>';
      } else if (type === 'info') {
        iconDiv.classList.add('snafic-info-ring');
        iconDiv.innerHTML = '<svg class="snafic-check-svg" viewBox="0 0 52 52"><circle cx="26" cy="26" r="20" stroke="white" stroke-width="3" fill="none"/><line x1="26" y1="24" x2="26" y2="36" stroke="white" stroke-width="3"/><circle cx="26" cy="18" r="2" fill="white"/></svg>';
      }

      titleEl.textContent = title;
      msgEl.textContent = message;

      if (features.length > 0) {
        featuresContainer.style.display = 'flex';
        featuresContainer.innerHTML = features.map(function(f) { return '<div class="snafic-feature-chip">' + f + '</div>'; }).join('');
      } else {
        featuresContainer.style.display = 'none';
      }

      confirmBtn.textContent = confirmText;
      cancelBtn.style.display = showCancel ? 'block' : 'none';
      cancelBtn.textContent = cancelText;

      window.__snaficOnConfirm = onConfirm;
      window.__snaficOnCancel = onCancel;

      if (autoClose > 0) {
        progressContainer.style.display = 'block';
        card.classList.remove('no-progress');
        progressFill.style.transition = 'none';
        progressFill.style.width = '0%';
        setTimeout(function() {
          progressFill.style.transition = 'width ' + (autoClose / 1000) + 's linear';
          progressFill.style.width = '100%';
        }, 20);
        autoCloseTimer = setTimeout(function() {
          if (window.__snaficOnConfirm && typeof window.__snaficOnConfirm === 'function') window.__snaficOnConfirm();
          close();
        }, autoClose);
      } else {
        progressContainer.style.display = 'none';
      }

      overlay.classList.add('active');
    },
    close: close
  };
})();
