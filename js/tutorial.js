/**
 * tutorial.js — 使い方を見るチュートリアル（手動進行型）
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

  const STORAGE_KEY_SEEN       = 'qsoil_tutorial_seen';
  const HELP_LABEL_SEEN_KEY    = 'qsoil_help_label_seen';
  const HELP_LABEL_COLLAPSE_MS = 5000;
  const DESKTOP_BP = 768;

  function isDesktop() {
    return window.innerWidth >= DESKTOP_BP;
  }

  // 鉢エリアの仮想矩形
  // canvas は body 直下で position:fixed・全画面サイズのため、
  // 親要素をハイライトしても実際の鉢の位置にスポットライトが合わない。
  // simulation.js の getCupDimensions() を借りて、実際に描画される
  // 鉢の寸法からビューポート座標の矩形を算出する。
  function potAreaRect() {
    try {
      if (typeof getCupDimensions === 'function') {
        const d = getCupDimensions();
        const pad = 14;
        return {
          top:    d.topY - pad,
          left:   d.cx - d.topInnerW / 2 - pad,
          width:  d.topInnerW + pad * 2,
          height: d.cupHeight + pad * 2,
        };
      }
    } catch (_) { /* noop */ }
    // フォールバック（getCupDimensions が無い／例外時）
    if (isDesktop()) {
      return {
        top:    window.innerHeight * 0.15,
        left:   window.innerWidth  * 0.30,
        width:  window.innerWidth  * 0.40,
        height: window.innerHeight * 0.60,
      };
    }
    const W = window.innerWidth;
    return {
      top:    64,
      left:   W * 0.08,
      width:  W * 0.84,
      height: window.innerHeight * 0.42,
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
      // モバイルは鉢(canvas:fixed) がパネルに隠れないよう文書トップへ戻す
      scrollToTop: true,
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
      scrollToTop: true,
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
    },
    {
      id: 'share',
      getTarget: () => {
        if (isDesktop()) return document.getElementById('pc-share-btn');
        return document.getElementById('mms-share-btn');
      },
      tooltip: { text: '作った配合はSNSでシェアできます', position: 'top' },
      onNext: (target) => { if (target) target.click(); },
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

      // チュートリアル起動タイミングで「一度は触れた」判定にする
      markHelpSeen();

      document.body.classList.add('tutorial-active');
      this._createTutorialUI();
      this._attachGlobalHandlers();
      this._showStep(0);
    }

    // ── ステップ表示 ──
    async _showStep(index) {
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

      // スクロール中は古い位置にハイライトを残さない
      this._clearSpotlight();
      this._clearTooltip();

      const target = step.getTarget ? step.getTarget() : null;

      await this._scrollToTargetIfNeeded(target, step);

      // スクロール中にステップが変わった場合は何もしない（古い描画を残さない）
      if (this.currentStep !== index || !this.isRunning) return;

      if (target) {
        this._positionSpotlight(target);
        this._showTooltip(target, step);
      }
    }

    // 対象が画面内に完全に収まっていなければ画面中央にスクロールする
    async _scrollToTargetIfNeeded(target, step) {
      // 共有モーダル表示中はスクロール抑止
      if (step && step.id === 'shareModal') return;

      const reduce = this._prefersReducedMotion();

      // モバイル専用: 鉢 canvas を見せるため文書トップへ戻す
      if (step && step.scrollToTop && !isDesktop()) {
        if ((window.scrollY || 0) > 20) {
          try {
            window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
          } catch (_) {
            window.scrollTo(0, 0);
          }
          if (!reduce) await this._sleep(400);
        }
        return;
      }

      // 仮想矩形（鉢エリア）は DOM 要素ではないので、
      // step.getScrollAnchor() が返す DOM 要素を代わりに使う
      let el = null;
      if (target && target.nodeType === 1 && target.scrollIntoView) {
        el = target;
      } else if (step && typeof step.getScrollAnchor === 'function') {
        const anchor = step.getScrollAnchor();
        if (anchor && anchor.nodeType === 1 && anchor.scrollIntoView) el = anchor;
      }
      if (!el) return;

      const rect = el.getBoundingClientRect();
      // 要素が非表示（display:none 等）の場合はスクロールしない
      if (rect.width === 0 && rect.height === 0) return;

      const vh = window.innerHeight;
      const topPad    = 80;   // ヘッダー分の余裕
      const bottomPad = 180;  // ツールチップ + 下部固定バー分の余裕
      const fullyVisible =
        rect.top >= topPad &&
        rect.bottom <= vh - bottomPad;
      if (fullyVisible) return;

      try {
        el.scrollIntoView({
          behavior: reduce ? 'auto' : 'smooth',
          block:   'center',
          inline:  'nearest',
        });
      } catch (_) { /* noop */ }

      // smooth スクロールの完了イベントが無いため、固定時間だけ待つ
      if (!reduce) await this._sleep(400);
    }

    _sleep(ms) {
      return new Promise(r => setTimeout(r, ms));
    }

    _prefersReducedMotion() {
      try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
      catch (_) { return false; }
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

  // 「一度は触れた」状態のUIを適用する（localStorage は触らない）
  function applySeenStateUI() {
    const helpBtn = document.getElementById('tutorial-help-float');
    if (helpBtn) helpBtn.classList.add('compact');
    const centerBtn = document.getElementById('show-tutorial-btn');
    if (centerBtn) centerBtn.classList.add('tutorial-btn-seen');
  }

  // localStorage にフラグ保存 + UI 反映（5 秒経過時・チュートリアル起動時）
  function markHelpSeen() {
    try { localStorage.setItem(HELP_LABEL_SEEN_KEY, '1'); } catch (_) {}
    applySeenStateUI();
  }

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

      // 初回訪問のみ 5 秒間ラベル付き → その後丸アイコンに縮小
      // 中央の「▶ 使い方を見る」ボタンも連動して輪郭線スタイルに切替
      let seen = false;
      try { seen = !!localStorage.getItem(HELP_LABEL_SEEN_KEY); } catch (_) { seen = true; }
      if (seen) {
        applySeenStateUI();
      } else {
        setTimeout(markHelpSeen, HELP_LABEL_COLLAPSE_MS);
      }

      // モバイル: 下スクロール中は隠し、上スクロール or 停止後に再表示
      let lastScrollY = window.scrollY || 0;
      let scrollTimer = null;
      window.addEventListener('scroll', () => {
        const y = window.scrollY || 0;
        if (y > lastScrollY && y > 100) {
          helpBtn.classList.add('scroll-hidden');
        } else {
          helpBtn.classList.remove('scroll-hidden');
        }
        lastScrollY = y;
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          helpBtn.classList.remove('scroll-hidden');
        }, 1500);
      }, { passive: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindTriggers);
  } else {
    bindTriggers();
  }
})();
