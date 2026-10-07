// Per-device play counter, kept in localStorage (no server).
// Staff see it on the win screen, so a player who keeps replaying for more gifts stands out.
// It resets if the browser's site data is cleared or a private tab is used.

const KEY = 'bog-plays-v1';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function bump(game, field) {
  const all = read();
  const entry = all[game] || { plays: 0, wins: 0 };
  entry[field] += 1;
  all[game] = entry;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // storage full or blocked - the game still works without the counter
  }
  return entry;
}

// Call when a round starts.
export const countPlay = (game) => bump(game, 'plays');

// Call when a gift is won. Returns { plays, wins } for this game on this device.
export const countWin = (game) => bump(game, 'wins');
