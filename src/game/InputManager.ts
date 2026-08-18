// @ts-nocheck
import { Vector2, Vector3 } from 'three';
import { EventEmitter } from './util';

const _forward = new Vector3();
const _right = new Vector3();
const _move = new Vector3();

/**
 * Normalises pointer, touch, virtual joystick, and keyboard inputs
 * into events and continuous camera-relative movement vectors.
 */
export class InputManager extends EventEmitter {
  constructor(domElement) {
    super();
    this.dom = domElement;
    this.pointer = new Vector2();
    this.keys = new Set();
    this.enabled = true;

    // Virtual Touch Joystick input (-1..1)
    this.virtualJoystick = new Vector2(0, 0);

    this._bind();
  }

  _bind() {
    this.dom.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.dom.addEventListener('contextmenu', this._onContextMenu);

    // Touch events for mobile
    this.dom.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this.dom.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.dom.addEventListener('touchend', this._onTouchEnd, { passive: false });
  }

  _onContextMenu = (e) => e.preventDefault();

  _updatePointer(e) {
    const r = this.dom.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    );
  }

  _onPointerDown = (e) => {
    if (!this.enabled) return;
    if (e.target !== this.dom) return;
    this._updatePointer(e);
    if (e.button === 0) this.emit('pointer:confirm', this.pointer);
    else if (e.button === 2) this.emit('action', 'cancel');
  };

  _onPointerMove = (e) => {
    this._updatePointer(e);
    this.emit('pointer:move', this.pointer);
  };

  _onTouchStart = (e) => {
    if (!this.enabled || e.touches.length === 0) return;
    const touch = e.touches[0];
    // Check if touch target is the main canvas
    if (e.target === this.dom) {
      this._updatePointer(touch);
      this.emit('pointer:move', this.pointer);
    }
  };

  _onTouchMove = (e) => {
    if (!this.enabled || e.touches.length === 0) return;
    const touch = e.touches[0];
    if (e.target === this.dom) {
      this._updatePointer(touch);
      this.emit('pointer:move', this.pointer);
    }
  };

  _onTouchEnd = (_e) => {
    // handled by touch buttons or canvas taps
  };

  /** Sets virtual joystick input from mobile touch controller (x: -1..1, y: -1..1) */
  setVirtualMove(x, y) {
    this.virtualJoystick.set(x, y);
  }

  _onKeyDown = (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    this.keys.add(e.code);

    if (e.repeat) return;

    switch (e.code) {
      case 'KeyQ':
      case 'Digit1':
        this.emit('action', 'ability', 0);
        break;
      case 'KeyE':
      case 'Digit2':
        this.emit('action', 'ability', 1);
        break;
      case 'KeyR':
      case 'Digit3':
        this.emit('action', 'ability', 2);
        break;
      case 'KeyF':
      case 'Digit4':
        this.emit('action', 'ability', 3);
        break;
      case 'KeyV':
      case 'Digit5':
        this.emit('action', 'ability', 4);
        break;
      case 'Space':
        this.emit('action', 'dash');
        break;
      case 'Escape':
        this.emit('action', 'cancel');
        break;
      case 'KeyH':
        this.emit('action', 'toggleHelp');
        break;
      case 'KeyG':
        this.emit('action', 'toggleEditor');
        break;
      case 'KeyC':
        this.emit('action', 'clear');
        break;
      case 'KeyP':
        this.emit('action', 'togglePause');
        break;
      default:
        break;
    }
  };

  _onKeyUp = (e) => {
    this.keys.delete(e.code);
  };

  /** Calculate normalized move direction relative to camera orientation */
  getMoveVector(camera) {
    let inputX = 0;
    let inputZ = 0;

    // 1. Keyboard WASD
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) inputZ += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) inputZ -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) inputX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) inputX += 1;

    // 2. Virtual Joystick overrides or blends
    if (this.virtualJoystick.lengthSq() > 0.001) {
      inputX = this.virtualJoystick.x;
      inputZ = this.virtualJoystick.y;
    }

    if (Math.abs(inputX) < 0.01 && Math.abs(inputZ) < 0.01) {
      _move.set(0, 0, 0);
      return _move;
    }

    if (camera) {
      camera.getWorldDirection(_forward);
      _forward.y = 0;
      _forward.normalize();
      _right.crossVectors(_forward, camera.up).normalize();

      _move.set(0, 0, 0);
      _move.addScaledVector(_forward, inputZ);
      _move.addScaledVector(_right, inputX);
      const len = _move.length();
      if (len > 1) _move.normalize();
    } else {
      _move.set(inputX, 0, -inputZ);
      if (_move.length() > 1) _move.normalize();
    }

    return _move;
  }

  dispose() {
    this.dom.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.dom.removeEventListener('contextmenu', this._onContextMenu);
    this.dom.removeEventListener('touchstart', this._onTouchStart);
    this.dom.removeEventListener('touchmove', this._onTouchMove);
    this.dom.removeEventListener('touchend', this._onTouchEnd);
    this.clear();
  }
}
