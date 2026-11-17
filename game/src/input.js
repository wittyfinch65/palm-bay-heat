// Keyboard and mouse, read as state: which keys are held, which were pressed this frame, and
// where the mouse points in canvas pixels. The game loop polls it; nothing here knows the rules.

/** Action bits returned by takeActions() for the one-shot menu keys. */
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

/** Keys that must not scroll the page or trigger browser shortcuts while playing. */
const SWALLOWED = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/**
 * Attach listeners to the canvas and return the live input state. `held` is a Set of
 * KeyboardEvent codes currently down; pressed codes collect until takePressed() drains them;
 * mouse carries canvas-space position and the button edges.
 */
export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  window.addEventListener('keydown', (event) => {
    if (SWALLOWED.has(event.code)) event.preventDefault();
    if (!event.repeat) pressed.add(event.code);
    held.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  window.addEventListener('blur', () => {
    held.clear();
    mouse.down = false;
  });
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    held,
    mouse,
    /** True while the key with this KeyboardEvent code is down. */
    down(code) {
      return held.has(code);
    },
    /** Drain the pressed-this-frame set; the caller sees each key once. */
    takePressed() {
      const out = new Set(pressed);
      pressed.clear();
      return out;
    },
    /** Drain the mouse click edge. */
    takeClick() {
      const was = mouse.clicked;
      mouse.clicked = false;
      return was;
    },
    /** The one-shot menu actions among the pressed keys, as ACTION_* bits. */
    takeActions() {
      let actions = 0;
      if (pressed.has('Space') || pressed.has('Enter')) actions |= ACTION_CONFIRM;
      if (pressed.has('Escape') || pressed.has('KeyP')) actions |= ACTION_PAUSE;
      pressed.delete('Space');
      pressed.delete('Enter');
      pressed.delete('Escape');
      pressed.delete('KeyP');
      return actions;
    },
    /** Horizontal axis from keys: -1 left, +1 right. */
    axisX() {
      return (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
    },
    /** Vertical axis from keys: -1 up (north), +1 down (south). */
    axisY() {
      return (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0) - (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0);
    },
  };
}
