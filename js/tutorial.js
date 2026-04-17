/**
 * tutorial.js — 触り方を見るチュートリアル（手動進行型）
 *
 * トリガー:
 *   - #show-tutorial-btn（デスクトップのガイドパネル内）
 *   - #tutorial-help-float（常設「?」ボタン）
 *
 * 進行はユーザーが「次へ」「前へ」ボタンを押して制御する。
 * 既存 UI の要素・関数に直接触れず、.click() で操作を発火する
 * （例外として共有モーダルの closeShareModal() のみ関数直接呼び出し）。
 */
(function () {
  'use strict';

  const STORAGE_KEY_SEEN = 'qsoil_tutorial_seen';
  const DESKTOP_BP = 768;

  function isDesktop() {
    return window.innerWidth >= DESKTOP_BP;
  }

  // 鉢エリアの仮想矩形（#canvas 全面ではなく鉢領域を指す）
  function potAreaRect() {
    if (isDesktop()) {
      return {
        top:    window.innerHeight * 0.15,
        left:   window.innerWidth  * 0.30,
        width:  window.innerWidth  * 0.40,
        height: window.innerHeight * 0.60,
      };
    }
    const spacer = document.getElementById('canvas-spacer');
    if (spacer) {
      const r = spacer.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return r;
    }
    return {
      top:    window.innerHeight * 0.08,
      left:   16,
      width:  window.innerWidth - 32,
      height: window.innerHeight * 0.40,
    };
  }

  // ── ステップ定義 ──
  // 各ステップ: getTarget, tooltip, 任意で onNext(target) / scrollIntoView / isCompletion
  const STEPS = [
    {
      id: 'preset',
      getTarget: () => document.querySelector('button[data-preset="balance"]'),
      tooltip: { text: 'クイックスタートから始められます', position: 'bottom' },
      onNext: (target) => { if (target) target.click(); },
    },
    {
      id: 'materials',
      getTarget: () =>
        document.querySelector('#obj-list [data-accordion="active"]') ||
        document.getElementById('obj-list'),
      tooltip: { text: '資材の割合が自動で設定されます', position: 'right' },
    },
    {
      id: 'start',
      getTarget: () => document.getElementById('startBtn'),
      tooltip: { text: 'ここを押すと充填開始', position: 'top' },
      onNext: (target) => { if (target) target.click(); },
    },
    {
      id: 'filling',
      getTarget: potAreaRect,
      tooltip: { text: '配合の様子を視覚的に確認。落ち着いたら次へ', position: 'bottom' },
    },
    {
      id: 'air',
      getTarget: () => document.getElementById('airBtn'),
      tooltip: { text: '空気と土の分布も見られます', position: 'top' },
      onNext: (target) => { if (target) target.click(); },
    },
    {
      id: 'airView',
      getTarget: potAreaRect,
      tooltip: { text: '通気性の理解に役立ちます', position: 'bottom' },
    },
    {
      id: 'analysis',
      getTarget: () => {
        if (isDesktop()) {
          return document.getElementById('pc-metrics-card') || document.getElementById('right-panel');
        }
        return document.getElementById('mobile-metrics-sticky') || document.getElementById('right-panel');
      },
      tooltip: { text: '排水性・保水性・通気性が数値でわかります', position: 'left' },
      scrollIntoView: true,
    },
    {
      id: 'compare',
      getTarget: () => {
        const tabBtn = document.querySelector('.rp-tab-btn[data-rp-tab="compare"]');
        // デスクトップ: 比較タブボタン / モバイル: 比較タブが無いので「比較元にする」ボタンにフォールバック
        if (tabBtn && tabBtn.offsetParent !== null) return tabBtn;
        return document.getElementById('mms-compare-btn') ||
               document.getElementById('pc-compare-btn');
      },
      tooltip: { text: '複数の配合を比較できます', position: 'bottom' },
      scrollIntoView: true,
    },
    {
      id: 'share',
      getTarget: () => {
        if (isDesktop()) return document.getElementById('pc-share-btn');
        return document.getElementById('mms-share-btn');
      },
      tooltip: { text: '作った配合はSNSでシェアできます', position: 'top' },
      onNext: (target) => { if (target) target.click(); },
      scrollIntoView: true,
    },
    {
      id: 'shareModal',
      getTarget: () => document.querySelector('.share-modal-box'),
      tooltip: { text: '画像付きでXに投稿できます', position: 'top' },
    },
    {
      id: 'complete',
      isCompletion: true,
    },
  ];

  // ── チュートリアル本体 ──
  class QsoilTutorial {
    constructor() {
      this.isRunning = false;
      this.currentStep = 0;
      this.spotlight = null;
      this.tooltip = null;
      this.completion = null;
      this._resizeHandler = null;
      this._escHandler = null;
      this._clickHandler = null;
    }

    start() {
      if (this.isRunning) return;
      this.isRunning = true;
      this.currentStep = 0;

      // 資材タブが非アクティブなら切替
      const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
      if (activeTab && activeTab !== 'materials') {
        const matBtn = document.querySelector('.tab-btn[data-tab="materials"]');
        if (matBtn) matBtn.click();
      }

      document.body.classList.add('tutorial-active');
      this._createTutorialUI();
      this._attachGlobalHandlers();
      this._showStep(0);
    }

    // ── ステップ表示 ──
    _showStep(index) {
      if (index < 0 || index >= STEPS.length) return;
      this.currentStep = index;
      const step = STEPS[index];

      if (step.isCompletion) {
        this._clearSpotlight();
        this._clearTooltip();
        try {
          if (typeof closeShareModal === 'function') closeShareModal();
        } catch (_) { /* noop */ }
        this._showCompletion();
        return;
      }

      // 完了画面が残っていれば閉じる（前へで戻った場合など）
      if (this.completion) { this.completion.remove(); this.completion = null; }

      const target = step.getTarget ? step.getTarget() : null;

      if (step.scrollIntoView && target && !isDesktop() && target.scrollIntoView) {
        try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
      }

      if (target) {
        this._positionSpotlight(target);
        this._showTooltip(target, step);
      } else {
        this._clearSpotlight();
        this._clearTooltip();
      }
    }

    _goNext() {
      const step = STEPS[this.currentStep];
      if (!step) return;
      if (typeof step.onNext === 'function') {
        try {
          const target = step.getTarget ? step.getTarget() : null;
          step.onNext(target);
        } catch (e) {
          console.warn('[tutorial] onNext failed', e);
        }
      }
      if (this.currentStep < STEPS.length - 1) {
        this._showStep(this.currentStep + 1);
      }
    }

    _goPrev() {
      if (this.currentStep <= 0) return;
      const cur = STEPS[this.currentStep];
      // 共有モーダル表示ステップから戻る場合はモーダルを閉じる（対象ボタンを再度見せるため）
      if (cur && cur.id === 'shareModal') {
        try {
          if (typeof closeShareModal === 'function') closeShareModal();
        } catch (_) { /* noop */ }
      }
      this._showStep(this.currentStep - 1);
    }

    // ── DOM 生成 ──
    _createTutorialUI() {
      // 全画面オーバーレイは廃止（スポットライトの外側暗転 box-shadow で代替）
      this.spotlight = document.createElement('div');
      this.spotlight.className = 'tutorial-spotlight';
      this.spotlight.style.display = 'none';
      document.body.appendChild(this.spotlight);

      this.tooltip = document.createElement('div');
      this.tooltip.className = 'tutorial-tooltip';
      this.tooltip.setAttribute('role', 'tooltip');
      this.tooltip.style.display = 'none';
      document.body.appendChild(this.tooltip);
    }

    // ── ハイライト ──
    _getRect(target) {
      if (!target) return null;
      if (target.getBoundingClientRect) return target.getBoundingClientRect();
      return target; // { top, left, width, height }
    }

    _positionSpotlight(target) {
      if (!this.spotlight) return;
      const rect = this._getRect(target);
      if (!rect) { this._clearSpotlight(); return; }
      const pad = 6;
      this.spotlight.style.display = 'block';
      this.spotlight.style.top    = (rect.top    - pad) + 'px';
      this.spotlight.style.left   = (rect.left   - pad) + 'px';
      this.spotlight.style.width  = (rect.width  + pad * 2) + 'px';
      this.spotlight.style.height = (rect.height + pad * 2) + 'px';

      // 対象の border-radius に追従
      let br = '12px';
      if (target && target.nodeType === 1) {
        try {
          const cs = getComputedStyle(target);
          if (cs.borderRadius && cs.borderRadius !== '0px') br = cs.borderRadius;
        } catch (_) { /* noop */ }
      }
      this.spotlight.style.borderRadius = br;
    }

    _clearSpotlight() {
      if (this.spotlight) this.spotlight.style.display = 'none';
    }

    // ── ツールチップ（× / 前へ / 番号 / 次へ を統合）──
    _showTooltip(target, step) {
      if (!this.tooltip) return;
      const cfg = step.tooltip;
      if (!cfg) { this._clearTooltip(); return; }

      const isFirst = this.currentStep === 0;
      const nextLabel = '次へ →';
      const indicator = (this.currentStep + 1) + ' / ' + STEPS.length;

      this.tooltip.innerHTML =
        '<button class="tutorial-tip-close" type="button" aria-label="閉じる">×</button>' +
        '<div class="tutorial-tooltip-text"></div>' +
        '<div class="tutorial-tooltip-actions">' +
          '<button class="tutorial-tip-prev" type="button"' + (isFirst ? ' disabled aria-disabled="true"' : '') + '>← 前へ</button>' +
          '<span class="tutorial-tip-indicator">' + indicator + '</span>' +
          '<button class="tutorial-tip-next" type="button">' + nextLabel + '</button>' +
        '</div>';
      this.tooltip.querySelector('.tutorial-tooltip-text').textContent = cfg.text || '';
      this.tooltip.setAttribute('data-position', cfg.position || 'bottom');
      this.tooltip.style.display = '';
      this.tooltip.style.visibility = 'hidden';

      const prevBtn  = this.tooltip.querySelector('.tutorial-tip-prev');
      const nextBtn  = this.tooltip.querySelector('.tutorial-tip-next');
      const closeBtn = this.tooltip.querySelector('.tutorial-tip-close');
      if (prevBtn && !isFirst) prevBtn.addEventListener('click', () => this._goPrev());
      if (nextBtn)             nextBtn.addEventListener('click', () => this._goNext());
      if (closeBtn)            closeBtn.addEventListener('click', () => this.skip());

      // 位置計算（サイズ確定後）
      requestAnimationFrame(() => {
        if (!this.tooltip) return;
        const rect = this._getRect(target);
        const tipW = this.tooltip.offsetWidth;
        const tipH = this.tooltip.offsetHeight;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const gap = 14;

        const place = (p) => {
          switch (p) {
            case 'top':    return { top: rect.top - tipH - gap,    left: rect.left + rect.width / 2 - tipW / 2 };
            case 'bottom': return { top: rect.top + rect.height + gap, left: rect.left + rect.width / 2 - tipW / 2 };
            case 'left':   return { top: rect.top + rect.height / 2 - tipH / 2, left: rect.left - tipW - gap };
            case 'right':  return { top: rect.top + rect.height / 2 - tipH / 2, left: rect.left + rect.width + gap };
            default:       return { top: rect.top + rect.height + gap, left: rect.left + rect.width / 2 - tipW / 2 };
          }
        };

        const fits = (p) =>
          p.top >= 8 && p.left >= 8 &&
          p.top + tipH <= vh - 8 && p.left + tipW <= vw - 8;

        const primary = cfg.position || 'bottom';
        const orderMap = {
          top:    ['top', 'bottom', 'right', 'left'],
          bottom: ['bottom', 'top', 'right', 'left'],
          left:   ['left', 'right', 'top', 'bottom'],
          right:  ['right', 'left', 'top', 'bottom'],
        };
        const order = orderMap[primary] || orderMap.bottom;

        let chosenPos = primary;
        let pos = place(primary);
        let found = false;
        for (const p of order) {
          const candidate = place(p);
          if (fits(candidate)) { pos = candidate; chosenPos = p; found = true; break; }
        }
        if (!found) {
          pos.left = Math.max(8, Math.min(pos.left, vw - tipW - 8));
          pos.top  = Math.max(8, Math.min(pos.top,  vh - tipH - 8));
          chosenPos = primary;
        }

        this.tooltip.setAttribute('data-position', chosenPos);
        this.tooltip.style.top  = pos.top  + 'px';
        this.tooltip.style.left = pos.left + 'px';
        this.tooltip.style.visibility = 'visible';
      });
    }

    _clearTooltip() {
      if (this.tooltip) this.tooltip.style.display = 'none';
    }

    // ── 完了メッセージ ──
    _showCompletion() {
      if (this.completion) this.completion.remove();
      const indicator = STEPS.length + ' / ' + STEPS.length;
      this.completion = document.createElement('div');
      this.completion.className = 'tutorial-completion';
      this.completion.setAttribute('role', 'dialog');
      this.completion.setAttribute('aria-label', 'チュートリアル完了');
      this.completion.innerHTML =
        '<button class="tutorial-tip-close" type="button" aria-label="閉じる">×</button>' +
        '<h3>✨ 使い方をマスターしました</h3>' +
        '<p>配合ができたら、ぜひXでシェアしてください</p>' +
        '<p class="hashtag-hint">#Qsoil配合 で投稿すると見つけやすくなります</p>' +
        '<div class="tutorial-tooltip-actions">' +
          '<button class="tutorial-tip-prev" type="button">← 前へ</button>' +
          '<span class="tutorial-tip-indicator">' + indicator + '</span>' +
          '<button class="tutorial-tip-next close-btn" type="button">完了</button>' +
        '</div>';
      this.completion.querySelector('.tutorial-tip-prev')
        .addEventListener('click', () => this._goPrev());
      this.completion.querySelector('.close-btn')
        .addEventListener('click', () => this._finalize());
      this.completion.querySelector('.tutorial-tip-close')
        .addEventListener('click', () => this.skip());
      document.body.appendChild(this.completion);
      try { localStorage.setItem(STORAGE_KEY_SEEN, '1'); } catch (_) {}
    }

    // ── スキップ / 終了 ──
    skip() {
      if (!this.isRunning) return;
      try {
        if (typeof closeShareModal === 'function') closeShareModal();
      } catch (_) { /* noop */ }
      try { localStorage.setItem(STORAGE_KEY_SEEN, '1'); } catch (_) {}
      this._finalize();
    }

    _finalize() {
      this.isRunning = false;
      this._clearSpotlight();
      this._clearTooltip();
      if (this.spotlight)  { this.spotlight.remove();  this.spotlight = null; }
      if (this.tooltip)    { this.tooltip.remove();    this.tooltip = null; }
      if (this.completion) { this.completion.remove(); this.completion = null; }
      this._detachGlobalHandlers();
      document.body.classList.remove('tutorial-active');
    }

    // ── グローバルハンドラ ──
    _attachGlobalHandlers() {
      this._resizeHandler = () => {
        const step = STEPS[this.currentStep];
        if (!step || step.isCompletion) return;
        const target = step.getTarget ? step.getTarget() : null;
        if (target && this.spotlight && this.spotlight.style.display !== 'none') {
          this._positionSpotlight(target);
        }
        if (target && step.tooltip && this.tooltip && this.tooltip.style.display !== 'none') {
          this._showTooltip(target, step);
        }
      };
      window.addEventListener('resize', this._resizeHandler);
      window.addEventListener('scroll', this._resizeHandler, true);

      this._escHandler = (e) => {
        if (e.key === 'Escape') this.skip();
      };
      document.addEventListener('keydown', this._escHandler);

      // 対象要素以外への操作は即スキップ（capture phase で他ハンドラより先に止める）
      this._clickHandler = (e) => {
        if (!e.isTrusted) return; // 自動クリック（target.click()）は無視
        const t = e.target;
        // チュートリアル自身の UI 上の操作はスキップ判定しない
        if (t.closest && (
          t.closest('.tutorial-tooltip') ||
          t.closest('.tutorial-completion')
        )) return;
        // 現在の対象要素への操作は許可
        const step = STEPS[this.currentStep];
        const cur = step && !step.isCompletion && step.getTarget ? step.getTarget() : null;
        if (cur && cur.nodeType === 1 && cur.contains(t)) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        this.skip();
      };
      document.addEventListener('click', this._clickHandler, true);
    }

    _detachGlobalHandlers() {
      if (this._resizeHandler) {
        window.removeEventListener('resize', this._resizeHandler);
        window.removeEventListener('scroll', this._resizeHandler, true);
      }
      if (this._escHandler)    document.removeEventListener('keydown', this._escHandler);
      if (this._clickHandler)  document.removeEventListener('click', this._clickHandler, true);
      this._resizeHandler = null;
      this._escHandler = null;
      this._clickHandler = null;
    }
  }

  // ── 初期化 ──
  const tutorial = new QsoilTutorial();
  window.qsoilTutorial = tutorial;

  function bindTriggers() {
    const triggerBtn = document.getElementById('show-tutorial-btn');
    if (triggerBtn && !triggerBtn._tutorialBound) {
      triggerBtn._tutorialBound = true;
      triggerBtn.addEventListener('click', () => tutorial.start());
    }
    const helpBtn = document.getElementById('tutorial-help-float');
    if (helpBtn && !helpBtn._tutorialBound) {
      helpBtn._tutorialBound = true;
      helpBtn.addEventListener('click', () => tutorial.start());
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindTriggers);
  } else {
    bindTriggers();
  }
})();
