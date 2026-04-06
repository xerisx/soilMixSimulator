// ── お気に入り ──
const FAVORITES_KEY = 'qsoil_favorites';

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveFavorites() {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch {}
}

function isFavorite(type, id) {
  return favorites.some(f => f.type === type && f.id === id);
}

function toggleFavorite(type, id) {
  if (isFavorite(type, id)) {
    favorites = favorites.filter(f => !(f.type === type && f.id === id));
  } else {
    favorites.push({ type, id });
  }
  saveFavorites();
}

// お気に入りを先頭に安定ソート
function sortedByFavorite(items, type) {
  const favs = items.filter(item => isFavorite(type, item.id));
  const rest = items.filter(item => !isFavorite(type, item.id));
  return [...favs, ...rest];
}

// state.js で [] に初期化された favorites を上書き
favorites = loadFavorites();
