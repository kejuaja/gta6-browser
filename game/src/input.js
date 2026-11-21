// Keyboard and mouse: keys held, keys pressed since they were last handled, mouse movement (with
// pointer lock while playing) and buttons.

export function createInput(canvas) {
  const held = new Set();
  const pressed = new Set();
  const mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, wheel: 0 };
  let locked = false;

  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (!held.has(e.code)) pressed.add(e.code);
    held.add(e.code);
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => {
    held.clear();
    mouse.left = mouse.right = false;
  });
  // Camera modes: 'hold' turns the camera only while the right (or middle) button is held and never
  // captures the mouse; 'capture' locks the pointer so every movement turns it (and, if the browser
  // refuses the lock, dragging with any button does).
  let mode = 'hold';
  window.addEventListener('mousemove', (e) => {
    const looking = mode === 'hold' ? (e.buttons & 6) !== 0 : locked || e.buttons !== 0;
    if (!looking) return;
    let dx = e.movementX || 0;
    let dy = e.movementY || 0;
    // Chrome on Windows sometimes reports one huge jump (a fast flick, the cursor at a screen
    // edge): that is what spun the camera round. Drop it, and cap the rest.
    if (Math.abs(dx) > 250 || Math.abs(dy) > 250) return;
    dx = Math.max(-80, Math.min(80, dx));
    dy = Math.max(-80, Math.min(80, dy));
    mouse.dx += dx;
    mouse.dy += dy;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouse.left = true;
      mouse.leftPressed = true;
    }
    if (e.button === 2) mouse.right = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.left = false;
    if (e.button === 2) mouse.right = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('wheel', (e) => {
    mouse.wheel += Math.sign(e.deltaY);
  }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });

  return {
    mouse,
    down: (code) => held.has(code),
    pressed: (code) => pressed.has(code),
    get locked() {
      return locked;
    },
    get mode() {
      return mode;
    },
    /** 'hold' or 'capture'; leaving 'capture' releases the mouse. */
    setMode(m) {
      mode = m === 'capture' ? 'capture' : 'hold';
      if (mode === 'hold' && locked) document.exitPointerLock();
    },
    lock() {
      if (mode !== 'capture') return;
      if (!locked && canvas.requestPointerLock) {
        try {
          const p = canvas.requestPointerLock();
          if (p && p.catch) p.catch(() => {});
        } catch {
          // Pointer lock can be refused (an embedded page); the mouse then only clicks.
        }
      }
    },
    unlock() {
      if (locked) document.exitPointerLock();
    },
    /** Movement axes from WASD or the arrows: x right, y forward, each -1..1. */
    axes() {
      const x = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      const y = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
      return { x, y };
    },
    /** After the first fixed step that saw them: presses are acted on once, never dropped by a frame with no step. */
    clearPresses() {
      pressed.clear();
      mouse.leftPressed = false;
      mouse.wheel = 0;
    },
    /** After the camera has turned by this frame's mouse movement. */
    clearMotion() {
      mouse.dx = 0;
      mouse.dy = 0;
    },
  };
}
