/**
 * theme.js — テーマ管理モジュール
 *
 * 初期テーマ決定の優先順位:
 *   1. localStorage に保存済みテーマ
 *   2. prefers-color-scheme
 *   3. fallback: light
 *
 * FOUC 防止のため <head> 内の最初の <script> として読み込むこと。
 */
(function () {
  'use strict';

  function getInitialTheme() {
    var saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') return saved;
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (e) {
      return 'light';
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  // FOUC 防止: <head> で即時適用
  applyTheme(getInitialTheme());

  /**
   * Light ↔ Dark を切り替える。
   * index.html のトグルボタン onclick から呼ぶ。
   */
  window.toggleTheme = function () {
    var current = document.documentElement.getAttribute('data-theme') || 'light';
    var next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('theme', next);
    // Matter.js キャンバス背景を更新
    if (typeof updateCanvasTheme === 'function') {
      updateCanvasTheme(next === 'dark');
    }
  };

  window.getCurrentTheme = function () {
    return document.documentElement.getAttribute('data-theme') || 'light';
  };
})();
