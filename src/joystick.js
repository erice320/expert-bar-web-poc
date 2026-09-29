/** Virtual joystick + keyboard + D-pad — touch/pointer safe for iOS Safari + Android Chrome */
export class Joystick {
  /**
   * @param {HTMLElement} zoneEl  hit target (zone or base)
   * @param {HTMLElement} baseEl
   * @param {HTMLElement} knobEl
   */
  constructor(zoneEl, baseEl, knobEl) {
    this.zone = zoneEl;
    this.base = baseEl;
    this.knob = knobEl;
    this.active = false;
    this.vector = { x: 0, y: 0 };
    this.pointerId = null;
    this.max = 52;
    this._lastTouchAt = 0;

    const isOurPointer = (e) =>
      this.pointerId != null && e.pointerId === this.pointerId;

    const onPointerDown = (e) => {
      if (e.pointerType === 'mouse' && Date.now() - this._lastTouchAt < 700) return;
      if (this.active) return;
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        this._lastTouchAt = Date.now();
      }
      e.preventDefault();
      e.stopPropagation();
      this.active = true;
      this.pointerId = e.pointerId;
      try {
        this.zone.setPointerCapture(e.pointerId);
      } catch (_) {}
      this._move(e.clientX, e.clientY);
    };

    const onPointerMove = (e) => {
      if (!this.active || !isOurPointer(e)) return;
      e.preventDefault();
      this._move(e.clientX, e.clientY);
    };

    const onPointerUp = (e) => {
      if (!this.active || !isOurPointer(e)) return;
      e.preventDefault();
      this._reset();
      try {
        this.zone.releasePointerCapture(e.pointerId);
      } catch (_) {}
    };

    // Pointer Events (preferred — setPointerCapture keeps moves on iOS/Android)
    const pOpts = { passive: false };
    this.zone.addEventListener('pointerdown', onPointerDown, pOpts);
    this.zone.addEventListener('pointermove', onPointerMove, pOpts);
    this.zone.addEventListener('pointerup', onPointerUp, pOpts);
    this.zone.addEventListener('pointercancel', onPointerUp, pOpts);
    this.zone.addEventListener('lostpointercapture', () => {
      if (this.active) this._reset();
    });

    // Fallback Touch Events for older WebViews that mishandle pointer*
    const touchId = { current: null };
    const onTouchStart = (e) => {
      if (this.active && this.pointerId != null) return; // pointer path already handling
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      this._lastTouchAt = Date.now();
      e.preventDefault();
      e.stopPropagation();
      touchId.current = t.identifier;
      this.active = true;
      this.pointerId = null; // mark as touch-fallback mode
      this._touchMode = true;
      this._move(t.clientX, t.clientY);
    };
    const onTouchMove = (e) => {
      if (!this.active || !this._touchMode) return;
      const touches = e.changedTouches;
      if (!touches) return;
      for (let i = 0; i < touches.length; i++) {
        const t = touches[i];
        if (t.identifier === touchId.current) {
          e.preventDefault();
          this._move(t.clientX, t.clientY);
          break;
        }
      }
    };
    const onTouchEnd = (e) => {
      if (!this.active || !this._touchMode) return;
      const touches = e.changedTouches;
      if (!touches) return;
      for (let i = 0; i < touches.length; i++) {
        if (touches[i].identifier === touchId.current) {
          this._touchMode = false;
          touchId.current = null;
          this._reset();
          break;
        }
      }
    };

    this.zone.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: false });
    window.addEventListener('touchcancel', onTouchEnd, { passive: false });

    // Block context menu / gesture on the stick
    this.zone.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _reset() {
    this.active = false;
    this.pointerId = null;
    this._touchMode = false;
    this.vector.x = 0;
    this.vector.y = 0;
    this.knob.style.transform = 'translate(-50%, -50%)';
  }

  _move(cx, cy) {
    const rect = this.base.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const cx0 = rect.left + rect.width / 2;
    const cy0 = rect.top + rect.height / 2;
    let dx = cx - cx0;
    let dy = cy - cy0;
    const len = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(len, this.max);
    dx = (dx / len) * clamped;
    dy = (dy / len) * clamped;
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    this.vector.x = dx / this.max;
    this.vector.y = dy / this.max;
  }

  /** External inject from D-pad (normalized -1..1). Cleared when pad released. */
  setExternal(x, y) {
    if (this.active) return; // stick wins while held
    this.vector.x = x;
    this.vector.y = y;
    const dx = x * this.max;
    const dy = y * this.max;
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
}

/** On-screen D-pad fallback (hold buttons) */
export class DPad {
  /**
   * @param {HTMLElement} root
   * @param {(x:number,y:number)=>void} onVector
   */
  constructor(root, onVector) {
    this.vector = { x: 0, y: 0 };
    this._held = new Set();
    this._onVector = onVector;

    const apply = () => {
      let x = 0, y = 0;
      if (this._held.has('left')) x -= 1;
      if (this._held.has('right')) x += 1;
      if (this._held.has('up')) y -= 1;
      if (this._held.has('down')) y += 1;
      const len = Math.hypot(x, y);
      if (len > 0) { x /= len; y /= len; }
      this.vector.x = x;
      this.vector.y = y;
      this._onVector(x, y);
    };

    const bind = (btn, dir) => {
      const down = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._held.add(dir);
        btn.classList.add('active');
        apply();
        try { btn.setPointerCapture(e.pointerId); } catch (_) {}
      };
      const up = (e) => {
        e.preventDefault();
        this._held.delete(dir);
        btn.classList.remove('active');
        apply();
      };
      btn.addEventListener('pointerdown', down, { passive: false });
      btn.addEventListener('pointerup', up, { passive: false });
      btn.addEventListener('pointercancel', up, { passive: false });
      btn.addEventListener('lostpointercapture', () => {
        this._held.delete(dir);
        btn.classList.remove('active');
        apply();
      });
      // touch fallback
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this._held.add(dir);
        btn.classList.add('active');
        apply();
      }, { passive: false });
      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        this._held.delete(dir);
        btn.classList.remove('active');
        apply();
      }, { passive: false });
      btn.addEventListener('touchcancel', (e) => {
        this._held.delete(dir);
        btn.classList.remove('active');
        apply();
      }, { passive: false });
    };

    bind(root.querySelector('[data-dir="up"]'), 'up');
    bind(root.querySelector('[data-dir="down"]'), 'down');
    bind(root.querySelector('[data-dir="left"]'), 'left');
    bind(root.querySelector('[data-dir="right"]'), 'right');
  }
}

export class Keyboard {
  constructor() {
    this.keys = {};
    const set = (e, v) => {
      this.keys[e.code] = v;
      this.keys[e.key?.toLowerCase?.()] = v;
    };
    window.addEventListener('keydown', (e) => set(e, true));
    window.addEventListener('keyup', (e) => set(e, false));
  }
  pressed(...names) {
    return names.some((n) => this.keys[n]);
  }
  get vector() {
    let x = 0, y = 0;
    if (this.pressed('KeyA', 'ArrowLeft', 'a')) x -= 1;
    if (this.pressed('KeyD', 'ArrowRight', 'd')) x += 1;
    if (this.pressed('KeyW', 'ArrowUp', 'w')) y -= 1;
    if (this.pressed('KeyS', 'ArrowDown', 's')) y += 1;
    const len = Math.hypot(x, y) || 1;
    if (x === 0 && y === 0) return { x: 0, y: 0 };
    return { x: x / len, y: y / len };
  }
}

/** Right-side look pad — drag changes yaw/pitch deltas (rad). Not movement. */
export class LookPad {
  /**
   * @param {HTMLElement} zoneEl
   * @param {{ sensitivity?: number }} [opts]
   */
  constructor(zoneEl, opts = {}) {
    this.zone = zoneEl;
    this.sensitivity = opts.sensitivity ?? 0.005;
    this.active = false;
    this.pointerId = null;
    this._touchMode = false;
    this._lastX = 0;
    this._lastY = 0;
    this._lastTouchAt = 0;
    /** Accumulated deltas since last consume() — rad */
    this.deltaYaw = 0;
    this.deltaPitch = 0;

    const isOurPointer = (e) =>
      this.pointerId != null && e.pointerId === this.pointerId;

    const onPointerDown = (e) => {
      if (e.pointerType === 'mouse' && Date.now() - this._lastTouchAt < 700) return;
      if (this.active) return;
      // Ignore clicks on Interact / other HUD buttons inside zone
      if (e.target && e.target.closest && e.target.closest('button')) return;
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        this._lastTouchAt = Date.now();
      }
      e.preventDefault();
      e.stopPropagation();
      this.active = true;
      this.pointerId = e.pointerId;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      try {
        this.zone.setPointerCapture(e.pointerId);
      } catch (_) {}
    };

    const onPointerMove = (e) => {
      if (!this.active || !isOurPointer(e)) return;
      e.preventDefault();
      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      this._lastX = e.clientX;
      this._lastY = e.clientY;
      this.deltaYaw -= dx * this.sensitivity;
      this.deltaPitch -= dy * this.sensitivity;
    };

    const onPointerUp = (e) => {
      if (!this.active || !isOurPointer(e)) return;
      e.preventDefault();
      this.active = false;
      this.pointerId = null;
      try {
        this.zone.releasePointerCapture(e.pointerId);
      } catch (_) {}
    };

    const pOpts = { passive: false };
    this.zone.addEventListener('pointerdown', onPointerDown, pOpts);
    this.zone.addEventListener('pointermove', onPointerMove, pOpts);
    this.zone.addEventListener('pointerup', onPointerUp, pOpts);
    this.zone.addEventListener('pointercancel', onPointerUp, pOpts);
    this.zone.addEventListener('lostpointercapture', () => {
      this.active = false;
      this.pointerId = null;
    });

    const touchId = { current: null };
    const onTouchStart = (e) => {
      if (this.active && this.pointerId != null) return;
      if (e.target && e.target.closest && e.target.closest('button')) return;
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      this._lastTouchAt = Date.now();
      e.preventDefault();
      e.stopPropagation();
      touchId.current = t.identifier;
      this.active = true;
      this.pointerId = null;
      this._touchMode = true;
      this._lastX = t.clientX;
      this._lastY = t.clientY;
    };
    const onTouchMove = (e) => {
      if (!this.active || !this._touchMode) return;
      const touches = e.changedTouches;
      if (!touches) return;
      for (let i = 0; i < touches.length; i++) {
        const t = touches[i];
        if (t.identifier === touchId.current) {
          e.preventDefault();
          const dx = t.clientX - this._lastX;
          const dy = t.clientY - this._lastY;
          this._lastX = t.clientX;
          this._lastY = t.clientY;
          this.deltaYaw -= dx * this.sensitivity;
          this.deltaPitch -= dy * this.sensitivity;
          break;
        }
      }
    };
    const onTouchEnd = (e) => {
      if (!this.active || !this._touchMode) return;
      const touches = e.changedTouches;
      if (!touches) return;
      for (let i = 0; i < touches.length; i++) {
        if (touches[i].identifier === touchId.current) {
          this._touchMode = false;
          touchId.current = null;
          this.active = false;
          break;
        }
      }
    };

    this.zone.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: false });
    window.addEventListener('touchcancel', onTouchEnd, { passive: false });
    this.zone.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Read and zero accumulated look deltas (rad). */
  consume() {
    const out = { yaw: this.deltaYaw, pitch: this.deltaPitch };
    this.deltaYaw = 0;
    this.deltaPitch = 0;
    return out;
  }
}
