/**
 * tutorial.js — 触り方を見るチュートリアル
 *
 * トリガー:
 *   - #show-tutorial-btn（デスクトップのガイドパネル内）
 *   - #tutorial-help-float（常設「?」ボタン: デスクトップ/モバイル両対応）
 *
 * 既存 UI の要素・関数に直接触れず、.click() で操作をプログラマティックに発火する。
 * 例外として、共有モーダルを閉じる処理のみ closeShareModal() を直接呼ぶ。
 */
(function () {
  'use strict';

  const STORAGE_KEY_SEEN = 'qsoil_tutorial_seen';
  const DESKTOP_BP = 768;

  function isDesktop() {
    return window.innerWidth >= DESKTOP_BP;
  }

  // 鉢エリアの仮想矩形（#canvas 全面ではなく、おおよその鉢領域を指す）
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
  const STEPS = [
    {
      id: 'preset',
      getTarget: () => document.querySelector('button[data-preset="balance"]'),
      action: 'click',
      tooltip: { text: 'クイックスタートから始められます', position: 'bottom' },
      durationMs: 3000,
    },
    {
      id: 'materials',
      getTarget: () =>
        document.querySelector('#obj-list [data-accordion="active"]') ||
        document.getElementById('obj-list'),
      action: 'highlight',
      tooltip: { text: '資材の割合が自動で設定されます', position: 'right' },
      durationMs: 2000,
    },
    {
      id: 'start',
      getTarget: () => document.getElementById('startBtn'),
      action: 'click',
      tooltip: { text: 'ここを押すと充填開始', position: 'top' },
      durationMs: 1500,
    },
    {
      id: 'filling',
      getTarget: potAreaRect,
      action: 'wait',
      tooltip: { text: '配合の様子を視覚的に確認', position: 'bottom' },
      durationMs: 8000,
      waitFor: () =>
        (typeof isFilling === 'undefined' || !isFilling) &&
        (typeof spawnInterval === 'undefined' || !spawnInterval),
    },
    {
      id: 'air',
      getTarget: () => document.getElementById('airBtn'),
      action: 'click',
      tooltip: { text: '空気と土の分布も見られます', position: 'top' },
      durationMs: 3000,
    },
    {
      id: 'airView',
      getTarget: potAreaRect,
      action: 'wait',
      tooltip: { text: '通気性の理解に役立ちます', position: 'bottom' },
      durationMs: 3000,
    },
    {
      id: 'analysis',
      getTarget: () => {
        if (isDesktop()) {
          return document.getElementById('pc-metrics-card') || document.getElementById('right-panel');
        }
        return document.getElementById('mobile-metrics-sticky') || document.getElementById('right-panel');
      },
      action: 'highlight',
      tooltip: { text: '排水性・保水性・通気性が数値でわかります', position: 'left' },
      durationMs: 4000,
      scrollIntoView: true,
    },
    {
      id: 'compare',
      getTarget: () => {
        const tabBtn = document.querySelector('.rp-tab-btn[data-rp-tab="compare"]');
        // デスクトップ: 比較タブボタン / モバイル: 比較タブは無いので「比較元にする」ボタンにフォールバック
        if (tabBtn && tabBtn.offsetParent !== null) return tabBtn;
        return document.getElementById('mms-compare-btn') ||
               document.getElementById('pc-compare-btn');
      },
      action: 'highlight',
      tooltip: { text: '複数の配合を比較できます', position: 'bottom' },
      durationMs: 3000,
      scrollIntoView: true,
    },
    {
      id: 'share',
      getTarget: () => {
        if (isDesktop()) return document.getElementById('pc-share-btn');
        return document.getElementById('mms-share-btn');
      },
      action: 'click',
      tooltip: { text: '作った配合はSNSでシェアできます', position: 'top' },
      durationMs: 4000,
      scrollIntoView: true,
    },
    {
      id: 'shareModal',
      getTarget: () => document.querySelector('.share-modal-box'),
      action: 'wait',
      tooltip: { text: '画像付きでXに投稿できます', position: 'top' },
      durationMs: 5000, // 画像生成のタイムアウトとしても使う
      waitFor: () => {
        if (typeof shareImageState === 'undefined') return true;
        return !shareImageState.isGenerating && !!shareImageState.previewBlob;
      },
    },
    {
      id: 'complete',
      action: 'complete',
    },
  ];

  // ── チュートリアル本体 ──
  class QsoilTutorial {
    constructor() {
      this.isRunning = false;
      this.currentStep = 0;
      this.overlay = null;
      this.spotlight = null;
      this.tooltip = null;
      this.controls = null;
      this.completion = null;
      this._abort = null;
      this._resizeHandler = null;
      this._escHandler = null;
    }

    async start() {
      if (this.isRunning) return;
      this.isRunning = true;
      this.currentStep = 0;
      this._abort = { aborted: false };

      // 資材タブが非アクティブなら切替（市販の用土タブ→資材タブ）
      const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
      if (activeTab && activeTab !== 'materials') {
        const matBtn = document.querySelector('.tab-btn[data-tab="materials"]');
        if (matBtn) matBtn.click();
      }

      document.body.classList.add('tutorial-active');
      this._createOverlay();
      this._createControls();
      this._attachGlobalHandlers();

      try {
        for (let i = 0; i < STEPS.length; i++) {
          if (this._abort.aborted) return;
          this.currentStep = i;
          this._updateStepIndicator();
          await this._executeStep(STEPS[i]);
        }
      } catch (e) {
        if (!this._abort.aborted) console.warn('[tutorial] step failed', e);
      }
    }

    async _executeStep(step) {
      if (step.action === 'complete') {
        this._clearSpotlight();
        this._clearTooltip();
        this._removeControls();
        // 共有モーダルを閉じる（既存コードを変更しないため関数直接呼び出し）
        try {
          if (typeof closeShareModal === 'function') closeShareModal();
        } catch (_) { /* noop */ }
        this._showCompletion();
        try { localStorage.setItem(STORAGE_KEY_SEEN, '1'); } catch (_) {}
        return;
      }

      const target = step.getTarget ? step.getTarget() : null;

      if (step.scrollIntoView && target && !isDesktop() && target.scrollIntoView) {
        try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
        await this._sleep(300);
        if (this._abort.aborted) return;
      }

      if (target) {
        this._positionSpotlight(target);
        this._showTooltip(target, step.tooltip);
      } else {
        this._clearSpotlight();
        this._clearTooltip();
      }

      if (step.action === 'click' && target && target.click) {
        // ハイライトを少し見せてから自動クリック
        const preClickMs = Math.min(1200, Math.max(400, step.durationMs / 2));
        await this._sleep(preClickMs);
        if (this._abort.aborted) return;
        try { target.click(); } catch (_) {}
        const remaining = Math.max(0, step.durationMs - preClickMs);
        await this._sleep(remaining);
      } else if (step.action === 'wait' || step.action === 'highlight') {
        const start = Date.now();
        const hasWait = typeof step.waitFor === 'function';
        while (Date.now() - start < step.durationMs) {
          if (this._abort.aborted) return;
          if (hasWait && step.waitFor()) break;
          await this._sleep(120);
        }
        // waitFor 成立で早期 break した場合は次ステップへ即進む
      }
    }

    // ── DOM 生成 ──
    _createOverlay() {
      this.overlay = document.createElement('div');
      this.overlay.className = 'tutorial-overlay';
      this.overlay.setAttribute('aria-hidden', 'true');
      this.overlay.addEventListener('click', () => this.skip());
      document.body.appendChild(this.overlay);

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

    _createControls() {
      this.controls = document.createElement('div');
      this.controls.className = 'tutorial-controls';
      this.controls.innerHTML =
        '<span class="step-indicator">1 / ' + STEPS.length + '</span>' +
        '<button class="skip-btn" type="button">スキップ</button>';
      // バー上のクリックはオーバーレイに伝播させない
      this.controls.addEventListener('click', (e) => e.stopPropagation());
      this.controls.querySelector('.skip-btn').addEventListener('click', () => this.skip());
      document.body.appendChild(this.controls);
    }

    _removeControls() {
      if (this.controls) { this.controls.remove(); this.controls = null; }
    }

    _updateStepIndicator() {
      if (!this.controls) return;
      const ind = this.controls.querySelector('.step-indicator');
      if (ind) ind.textContent = (this.currentStep + 1) + ' / ' + STEPS.length;
    }

    // ── ハイライト ──
    _getRect(target) {
      if (!target) return null;
      if (target.getBoundingClientRect) return target.getBoundingClientRect();
      return target; // 既に { top, left, width, height } 形式
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
    }

    _clearSpotlight() {
      if (this.spotlight) this.spotlight.style.display = 'none';
    }

    // ── ツールチップ ──
    _showTooltip(target, cfg) {
      if (!cfg || !this.tooltip) { this._clearTooltip(); return; }
      this.tooltip.textContent = cfg.text || '';
      this.tooltip.setAttribute('data-position', cfg.position || 'bottom');
      this.tooltip.style.display = 'block';
      this.tooltip.style.visibility = 'hidden';

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
        // 優先順: 指定方向 → 反対方向 → 上下/左右の垂直代替
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
          // どこにも収まらない → 主方向でクランプ
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
      this.completion = document.createElement('div');
      this.completion.className = 'tutorial-completion';
      this.completion.setAttribute('role', 'dialog');
      this.completion.setAttribute('aria-label', 'チュートリアル完了');
      this.completion.innerHTML =
        '<h3>✨ 使い方をマスターしました</h3>' +
        '<p>配合ができたら、ぜひXでシェアしてください</p>' +
        '<p class="hashtag-hint">#Qsoil配合 で投稿すると見つけやすくなります</p>' +
        '<button class="close-btn" type="button">このまま続ける</button>';
      this.completion.addEventListener('click', (e) => e.stopPropagation());
      this.completion.querySelector('.close-btn').addEventListener('click', () => this._finalize());
      document.body.appendChild(this.completion);
    }

    // ── スキップ / 終了 ──
    skip() {
      if (!this.isRunning) return;
      if (this._abort) this._abort.aborted = true;
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
      this._removeControls();
      if (this.overlay)    { this.overlay.remove();    this.overlay = null; }
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
        if (!step) return;
        const target = step.getTarget ? step.getTarget() : null;
        if (target && this.spotlight && this.spotlight.style.display !== 'none') {
          this._positionSpotlight(target);
        }
        if (target && step.tooltip && this.tooltip && this.tooltip.style.display !== 'none') {
          this._showTooltip(target, step.tooltip);
        }
      };
      window.addEventListener('resize', this._resizeHandler);

      this._escHandler = (e) => {
        if (e.key === 'Escape') this.skip();
      };
      document.addEventListener('keydown', this._escHandler);
    }

    _detachGlobalHandlers() {
      if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
      if (this._escHandler)    document.removeEventListener('keydown', this._escHandler);
      this._resizeHandler = null;
      this._escHandler = null;
    }

    _sleep(ms) {
      return new Promise(r => setTimeout(r, ms));
    }
  }

  // ── 初期化 ──
  const tutorial = new QsoilTutorial();
  // デバッグ/他機能からの起動用に window に公開
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
