// The save: cash, story progress and records in localStorage, so Palm Bay remembers you
// between visits. Storage can be unavailable (private windows); then the defaults play on
// for the session and nothing breaks.
import { SAVE_KEY } from './config.js';

/** A fresh save: a little walking-around money and the whole story ahead of you. */
export function defaultSave() {
  return { cash: 250, storyIndex: 0, storyDone: false, bestRace: 0, totalEarned: 0, missionsDone: 0 };
}

/** Read the save, filling any missing field from the defaults. */
export function loadSave() {
  const save = defaultSave();
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (raw) Object.assign(save, JSON.parse(raw));
  } catch {
    // No storage: play unsaved.
  }
  return save;
}

/** Write the save back. */
export function storeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // No storage: the session keeps the numbers in memory.
  }
}
