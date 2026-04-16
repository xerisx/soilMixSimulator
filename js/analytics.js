// ── Google Tag Manager イベント計測 ──
// dataLayer.push() で GTM にカスタムイベントを送信する。
// GA4 側では「カスタムイベント」タグ + 対応トリガーを設定すること。

function trackEvent(eventName, params) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: eventName, ...params });
}

// ── 初期化（DOM 構築後に実行） ──
document.addEventListener('DOMContentLoaded', () => {

  // 1. 充填開始（投入して開始ボタン）
  document.getElementById('startBtn')?.addEventListener('click', () => {
    const active = objectTypes?.filter(t => t.weight > 0).map(t => t.id) ?? [];
    trackEvent('fill_executed', {
      pot_size: currentSize,
      material_count: active.length,
      materials: active.join(','),
    });
  });

  // 2. 配合リセット
  ['clearBtn', 'pc-clear-btn'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      trackEvent('mix_reset', { pot_size: currentSize });
    });
  });

  // 3. 鉢サイズ変更
  document.querySelectorAll('.size-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      trackEvent('pot_size_changed', { pot_size: btn.dataset.size });
    });
  });

  // 4. プリセット選択（applyPreset のラップ）
  if (typeof applyPreset === 'function') {
    const _applyPreset = applyPreset;
    window.applyPreset = function(key) {
      _applyPreset(key);
      trackEvent('preset_applied', { preset: key });
    };
  }

  // 5. 資材スライダー操作（変更確定時）
  document.addEventListener('change', e => {
    const slider = e.target.closest('.ratio-slider');
    if (!slider) return;
    const idx = Number(slider.dataset.idx);
    const type = objectTypes?.[idx];
    if (!type) return;
    trackEvent('material_weight_changed', {
      material_id: type.id,
      weight: Number(slider.value),
    });
  });

  // 6. 資材サイズ切り替え（S/M/L）
  document.addEventListener('click', e => {
    const btn = e.target.closest('.obj-size-btn');
    if (!btn) return;
    const idx = Number(btn.dataset.idx);
    const type = objectTypes?.[idx];
    if (!type) return;
    trackEvent('material_size_changed', {
      material_id: type.id,
      size: btn.dataset.size,
    });
  });

  // 7. 空気層ビュー切り替え
  document.getElementById('airBtn')?.addEventListener('click', () => {
    trackEvent('air_view_toggled', { enabled: !isAirView });
  });

  // 8. 共有モーダルを開く（showShareModal のラップ）
  if (typeof showShareModal === 'function') {
    const _showShareModal = showShareModal;
    window.showShareModal = function() {
      _showShareModal();
      trackEvent('share_modal_opened', {});
    };
  }

  // 9. 共有URL コピー（copyShareURL のラップ）
  if (typeof copyShareURL === 'function') {
    const _copyShareURL = copyShareURL;
    window.copyShareURL = function() {
      _copyShareURL();
      trackEvent('share_url_copied', {});
    };
  }

  // 10. お気に入り操作（toggleFavorite のラップ）
  if (typeof toggleFavorite === 'function') {
    const _toggleFavorite = toggleFavorite;
    window.toggleFavorite = function(type, id) {
      const wasActive = isFavorite?.(type, id) ?? false;
      _toggleFavorite(type, id);
      trackEvent('favorite_toggled', {
        fav_type: type,
        fav_id: id,
        action: wasActive ? 'remove' : 'add',
      });
    };
  }

  // 11. 詳細パラメータ アコーディオン 開閉
  document.getElementById('detail-toggle')?.addEventListener('click', () => {
    const expanded = document.getElementById('detail-toggle').getAttribute('aria-expanded') === 'true';
    trackEvent('detail_panel_toggled', { expanded: !expanded });
  });

});
