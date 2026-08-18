// @ts-nocheck
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Engine } from './game/Engine';
import { ELEMENT_META } from './game/settings';

type Stats = { fps: number; particles: number; instances: number; draws: number };
type HudState = {
  armed: boolean;
  slot: number;
  cooldowns: number[];
  paused: boolean;
  help: boolean;
  editor: boolean;
  soundMuted: boolean;

  gameState: 'playing' | 'wave_clear' | 'game_over' | 'paused';
  score: number;
  highScore: number;
  combo: number;
  comboTimer: number;
  comboMultiplier: number;
  currentWave: number;
  aliveCount: number;
  totalWaveCount: number;
  totalKills: number;
  elementalKills: { ice: number; thunder: number; meteor: number; beam: number; snare: number };
  killFeed: Array<{ id: string; name: string; glyph: string; element: string; score: number; combo: number }>;
  waveOptions: Array<{ id: string; title: string; desc: string; icon: string }>;
  radarBlips: Array<{ x: number; z: number; type: string }>;

  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
  dashCooldown: number;
  playerPos: { x: number; z: number };
};

const SLOTS = ['ice', 'thunder', 'meteor', 'beam', 'snare'] as const;

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const radarCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<any>(null);

  // Virtual Joystick Touch Ref
  const joystickRef = useRef<{ touchId: number | null; startX: number; startY: number }>({
    touchId: null,
    startX: 0,
    startY: 0
  });
  const [joystickKnob, setJoystickKnob] = useState({ x: 0, y: 0, active: false });

  const [stats, setStats] = useState<Stats>({ fps: 0, particles: 0, instances: 0, draws: 0 });
  const [hud, setHud] = useState<HudState>({
    armed: false,
    slot: -1,
    cooldowns: [0, 0, 0, 0, 0],
    paused: false,
    help: false,
    editor: false,
    soundMuted: false,

    gameState: 'playing',
    score: 0,
    highScore: 0,
    combo: 0,
    comboTimer: 0,
    comboMultiplier: 1,
    currentWave: 1,
    aliveCount: 0,
    totalWaveCount: 1,
    totalKills: 0,
    elementalKills: { ice: 0, thunder: 0, meteor: 0, beam: 0, snare: 0 },
    killFeed: [],
    waveOptions: [],
    radarBlips: [],

    health: 100,
    maxHealth: 100,
    shield: 60,
    maxShield: 60,
    dashCooldown: 0,
    playerPos: { x: 0, z: 0 }
  });
  const [loaded, setLoaded] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  useEffect(() => {
    if (!mountRef.current) return;
    const engine = new Engine(mountRef.current) as any;
    engineRef.current = engine;
    engine.onStats = (s: Stats) => setStats(s);
    engine.onState = (h: HudState) => setHud(h);
    engine.start();
    const t = setTimeout(() => setLoaded(true), 500);
    return () => {
      clearTimeout(t);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Tactical Minimap Radar Canvas
  useEffect(() => {
    const canvas = radarCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const arenaRadius = 24.5;
    const scale = (w * 0.44) / arenaRadius;

    ctx.clearRect(0, 0, w, h);

    // Radar Dark Stage Circle
    ctx.fillStyle = 'rgba(6, 9, 18, 0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, arenaRadius * scale, 0, Math.PI * 2);
    ctx.fill();

    // Concentric Range Grid Rings
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, arenaRadius * scale * 0.5, 0, Math.PI * 2);
    ctx.arc(cx, cy, arenaRadius * scale, 0, Math.PI * 2);
    ctx.moveTo(cx, cy - arenaRadius * scale);
    ctx.lineTo(cx, cy + arenaRadius * scale);
    ctx.moveTo(cx - arenaRadius * scale, cy);
    ctx.lineTo(cx + arenaRadius * scale, cy);
    ctx.stroke();

    // Draw Enemy Blips
    if (hud.radarBlips) {
      for (const blip of hud.radarBlips) {
        const bx = cx + blip.x * scale;
        const by = cy + blip.z * scale;

        let color = '#f87171';
        let dotR = 2.4;

        if (blip.type === 'golem') {
          color = '#fb923c';
          dotR = 3.6;
        } else if (blip.type === 'phantom') {
          color = '#38bdf8';
          dotR = 2.8;
        } else if (blip.type === 'pyrefiend') {
          color = '#f43f5e';
          dotR = 3.0;
        } else if (blip.type === 'behemoth') {
          color = '#e11d48';
          dotR = 5.0;
        }

        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 5;
        ctx.beginPath();
        ctx.arc(bx, by, dotR, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // Draw Player Dot
    if (hud.playerPos) {
      const px = cx + hud.playerPos.x * scale;
      const py = cy + hud.playerPos.z * scale;
      ctx.fillStyle = '#22d3ee';
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 7;
      ctx.beginPath();
      ctx.arc(px, py, 3.0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }, [hud.radarBlips, hud.playerPos]);

  const e = () => engineRef.current;

  // Virtual Joystick Handlers for Touch Screens
  const handleJoystickStart = useCallback((evt: React.TouchEvent<HTMLDivElement>) => {
    if (evt.touches.length === 0) return;
    const touch = evt.touches[0];
    const rect = evt.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    joystickRef.current = {
      touchId: touch.identifier,
      startX: centerX,
      startY: centerY
    };

    setJoystickKnob({ x: 0, y: 0, active: true });
  }, []);

  const handleJoystickMove = useCallback((evt: React.TouchEvent<HTMLDivElement>) => {
    if (joystickRef.current.touchId === null) return;
    for (let i = 0; i < evt.touches.length; i++) {
      const touch = evt.touches[i];
      if (touch.identifier === joystickRef.current.touchId) {
        const dx = touch.clientX - joystickRef.current.startX;
        const dy = touch.clientY - joystickRef.current.startY;
        const maxRadius = 45; // max pixel distance
        const dist = Math.sqrt(dx * dx + dy * dy);
        const clampedDist = Math.min(dist, maxRadius);
        const angle = Math.atan2(dy, dx);

        const knobX = Math.cos(angle) * clampedDist;
        const knobY = Math.sin(angle) * clampedDist;

        setJoystickKnob({ x: knobX, y: knobY, active: true });

        // Normalize to -1..1 and feed to Engine (y inverted for forward/back)
        const normX = knobX / maxRadius;
        const normY = -(knobY / maxRadius);
        e()?.setVirtualMove(normX, normY);
        break;
      }
    }
  }, []);

  const handleJoystickEnd = useCallback((_evt: React.TouchEvent<HTMLDivElement>) => {
    joystickRef.current = { touchId: null, startX: 0, startY: 0 };
    setJoystickKnob({ x: 0, y: 0, active: false });
    e()?.setVirtualMove(0, 0);
  }, []);

  const healthFrac = Math.max(0, Math.min(1, hud.health / hud.maxHealth));
  const shieldFrac = Math.max(0, Math.min(1, hud.shield / Math.max(1, hud.maxShield)));

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#05070d] font-sans text-white select-none touch-none">
      <div ref={mountRef} className="absolute inset-0" />

      {/* Loading splash */}
      <div
        className={`pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#05070d] transition-opacity duration-700 ${
          loaded ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="mb-4 h-10 w-10 animate-spin rounded-full border border-white/20 border-t-cyan-400" />
        <div className="text-[11px] font-medium tracking-[0.3em] text-cyan-200/80 uppercase">
          Synthesizing Elemental Matrix…
        </div>
      </div>

      {/* Pause veil */}
      {hud.paused && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="rounded-2xl border border-white/10 bg-[#080c16]/90 px-8 py-5 text-center shadow-2xl">
            <div className="text-2xl font-light tracking-[0.35em] text-cyan-300">PAUSED</div>
            <div className="mt-2 text-xs text-white/50">
              {isTouchDevice ? 'Tap Pause icon to resume' : 'Press P to resume · WASD to move · Click to cast'}
            </div>
          </div>
        </div>
      )}

      {/* Top-Center: Wave Info, Progress & Score Header */}
      <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 max-w-[95vw]">
        <div className="flex items-center gap-2.5 sm:gap-4 rounded-xl border border-white/10 bg-[#080c16]/80 px-3.5 sm:px-5 py-1.5 sm:py-2 backdrop-blur-xl shadow-lg shadow-black/40">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-xs sm:text-sm text-cyan-400">⚔️</span>
            <div className="font-mono text-[11px] sm:text-xs font-bold tracking-widest text-cyan-200 uppercase">
              WAVE {hud.currentWave}
            </div>
          </div>

          <div className="h-3 w-px bg-white/10" />

          <div className="flex items-center gap-1 font-mono text-[10px] sm:text-[11px] text-white/70">
            <span className="text-white/40">MOBS:</span>
            <span className={`font-bold ${hud.aliveCount <= 3 ? 'text-amber-400 animate-pulse' : 'text-white/90'}`}>
              {hud.aliveCount}
            </span>
          </div>

          <div className="h-3 w-px bg-white/10" />

          <div className="flex items-center gap-1 font-mono text-[10px] sm:text-[11px]">
            <span className="text-white/40">SCORE:</span>
            <span className="font-bold text-amber-300 tracking-wide text-xs">{hud.score.toLocaleString()}</span>
          </div>

          {hud.highScore > 0 && (
            <>
              <div className="h-3 w-px bg-white/10 hidden sm:block" />
              <div className="hidden sm:flex items-center gap-1 font-mono text-[10px] text-white/40">
                <span>HI:</span>
                <span className="text-white/70">{hud.highScore.toLocaleString()}</span>
              </div>
            </>
          )}
        </div>

        {/* Combo Multiplier Bar */}
        {hud.combo > 1 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-950/70 px-3 py-0.5 backdrop-blur-xl shadow-md">
            <span className="text-xs">🔥</span>
            <span className="font-mono text-[11px] font-bold tracking-wider text-amber-300">
              {hud.comboMultiplier.toFixed(2)}x COMBO
            </span>
            <div className="h-1 w-12 overflow-hidden rounded-full bg-black/50">
              <div
                className="h-full bg-amber-400 transition-all duration-100"
                style={{ width: `${Math.max(0, (hud.comboTimer / 3.8) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Top-Left: Game Title & Kill Breakdown */}
      <div className="pointer-events-none absolute left-3.5 sm:left-5 top-3 sm:top-4 z-20">
        <div className="flex items-center gap-1.5">
          <span className="text-base sm:text-lg text-cyan-400">❄⚡</span>
          <h1 className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.2em] text-white/90">Elemental Onslaught</h1>
        </div>

        {/* Elemental Kill Counter Pills */}
        <div className="mt-1.5 flex items-center gap-1">
          <KillPill icon="❄" count={hud.elementalKills.ice} color="#9fe8ff" title="Frost Shatters" />
          <KillPill icon="⚡" count={hud.elementalKills.thunder} color="#7fb8ff" title="Storm Zaps" />
          <KillPill icon="☄" count={hud.elementalKills.meteor} color="#ff8a3a" title="Meteor Blasts" />
          <KillPill icon="✦" count={hud.elementalKills.beam} color="#aee6ff" title="Beam Melts" />
          <KillPill icon="⬡" count={hud.elementalKills.snare} color="#c08bff" title="Vortex Crushes" />
        </div>
      </div>

      {/* Top-Right: Holographic Minimap Radar */}
      <div className="pointer-events-none absolute right-3 sm:right-4 top-3 sm:top-4 z-20 flex flex-col items-end gap-1">
        <div className="relative rounded-2xl border border-white/10 bg-[#080c16]/80 p-1.5 backdrop-blur-xl shadow-lg">
          <div className="absolute top-1.5 left-2.5 font-mono text-[8px] uppercase tracking-widest text-cyan-400/60">
            RADAR
          </div>
          <canvas ref={radarCanvasRef} width={88} height={88} className="rounded-xl block sm:w-[110px] sm:h-[110px]" />
        </div>
      </div>

      {/* Bottom-Left / Top-Left Vitals (HP & Shield) */}
      <div className="pointer-events-none absolute bottom-24 sm:bottom-22 left-3 sm:left-5 z-20 flex flex-col gap-1 rounded-xl border border-white/10 bg-[#080c16]/80 p-2.5 backdrop-blur-xl shadow-lg w-[160px] sm:w-[200px]">
        <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-wider">
          <span className="text-white/40">VITALS</span>
          <span className="text-cyan-300 font-bold">{Math.round(hud.health)} HP</span>
        </div>

        {/* Health Bar */}
        <div className="relative h-2.5 sm:h-3 w-full overflow-hidden rounded-full bg-slate-950 border border-white/10">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-150"
            style={{ width: `${healthFrac * 100}%` }}
          />
        </div>

        {/* Shield Bar */}
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-950 border border-cyan-500/20">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-150"
            style={{ width: `${shieldFrac * 100}%` }}
          />
        </div>
      </div>

      {/* 🕹️ VIRTUAL JOYSTICK FOR TOUCH SCREENS (Bottom-Left) */}
      <div
        onTouchStart={handleJoystickStart}
        onTouchMove={handleJoystickMove}
        onTouchEnd={handleJoystickEnd}
        onTouchCancel={handleJoystickEnd}
        className="absolute bottom-22 left-4 z-30 flex items-center justify-center h-28 w-28 rounded-full border border-cyan-500/25 bg-cyan-950/20 backdrop-blur-sm touch-none select-none active:border-cyan-400/50"
        style={{ touchAction: 'none' }}
      >
        <div
          className={`h-11 w-11 rounded-full border border-cyan-300/60 bg-gradient-to-br from-cyan-400/40 to-blue-600/40 shadow-lg shadow-cyan-500/30 transition-transform duration-75 flex items-center justify-center`}
          style={{
            transform: `translate(${joystickKnob.x}px, ${joystickKnob.y}px)`
          }}
        >
          <div className="h-3 w-3 rounded-full bg-cyan-300 shadow-[0_0_6px_#22d3ee]" />
        </div>
        <div className="pointer-events-none absolute bottom-1.5 font-mono text-[8px] font-bold text-cyan-300/50 tracking-wider">
          MOVE
        </div>
      </div>

      {/* 📱 MOBILE TOUCH ACTION BUTTONS (Bottom-Right) */}
      <div className="absolute bottom-22 right-4 z-30 flex flex-col items-end gap-2.5">
        {/* CAST BUTTON (Visible when ability is armed) */}
        {hud.armed && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => e()?.doCancel()}
              className="h-11 w-11 rounded-full border border-white/20 bg-slate-950/80 text-white/70 font-mono text-xs font-bold active:scale-95 shadow-lg backdrop-blur-md"
            >
              ✕
            </button>
            <button
              onClick={() => e()?.doConfirm()}
              className="h-14 w-14 rounded-full border border-cyan-400 bg-gradient-to-br from-cyan-500 to-blue-600 text-white font-mono text-xs font-black active:scale-95 shadow-xl shadow-cyan-500/40 backdrop-blur-md animate-pulse"
            >
              CAST
            </button>
          </div>
        )}

        {/* DASH BUTTON */}
        <button
          onClick={() => e()?.doDash()}
          disabled={hud.dashCooldown > 0.01}
          className={`relative h-13 w-13 rounded-full border font-mono text-[10px] font-bold transition-all active:scale-95 shadow-lg backdrop-blur-md flex flex-col items-center justify-center ${
            hud.dashCooldown <= 0.01
              ? 'border-cyan-400/80 bg-cyan-950/60 text-cyan-200 shadow-cyan-500/30'
              : 'border-white/10 bg-black/40 text-white/30'
          }`}
        >
          <span className="text-base leading-none">💨</span>
          <span className="text-[8px] mt-0.5">{hud.dashCooldown <= 0.01 ? 'DASH' : `${(hud.dashCooldown * 1.1).toFixed(1)}s`}</span>
        </button>
      </div>

      {/* Compact Dismissible Controls & Synergies Modal (Opened ONLY on 'H' tap) */}
      {hud.help && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
          <div className="relative w-full max-w-sm sm:max-w-md rounded-2xl border border-white/15 bg-[#080c16]/95 p-5 text-white/80 shadow-2xl">
            <button
              onClick={() => e()?.toggleHelp()}
              className="absolute top-3.5 right-3.5 h-7 w-7 rounded-full border border-white/15 bg-white/5 text-white/70 hover:text-white flex items-center justify-center font-bold text-xs"
            >
              ✕
            </button>
            <div className="mb-3 font-bold uppercase tracking-widest text-cyan-300 text-xs flex items-center gap-2">
              <span>📖</span> Battle Controls & Synergies
            </div>

            <div className="space-y-1.5 text-[11px] leading-relaxed">
              <Ctrl k="🕹️ JOYSTICK / WASD" v="Move character battle-mage" />
              <Ctrl k="💨 DASH / SPACE" v="Rapid dodge lunge with invulnerability" />
              <Ctrl k="❄ Q · Frost Lance" v="Freezes & shatters into tumbling ice shards" />
              <Ctrl k="⚡ E · Storm Lance" v="Electrocutes & chains lightning across mobs" />
              <Ctrl k="☄ R · Cinder Fall" v="Fiery meteor blast & burning debris" />
              <Ctrl k="✦ F · Nova Beam" v="Piercing laser that vaporizes monsters" />
              <Ctrl k="⬡ V · Voltaic Snare" v="Gravity vortex that roots & implodes" />
              <Ctrl k="👆 TOUCH / CLICK" v="Aim indicator & cast ability along target" />
            </div>

            <button
              onClick={() => e()?.toggleHelp()}
              className="mt-4 w-full rounded-xl bg-cyan-500/20 border border-cyan-400/40 py-2 text-center font-mono text-xs font-bold text-cyan-200 hover:bg-cyan-500/30 transition-all"
            >
              GOT IT (CLOSE)
            </button>
          </div>
        </div>
      )}

      {/* Bottom Ability Hotbar */}
      <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 sm:gap-2 max-w-[98vw] overflow-x-auto px-2 py-1">
        {SLOTS.map((el, i) => (
          <SlotButton
            key={el}
            element={el}
            armed={hud.armed && hud.slot === i}
            cooldown={hud.cooldowns[i] ?? 0}
            onClick={() => e()?.armSlot(i)}
          />
        ))}
        <div className="mx-0.5 sm:mx-1 h-8 sm:h-10 w-px bg-white/15" />
        <ToolButton active={hud.paused} onClick={() => e()?.togglePause()} label="P" title="Pause Game (P)" />
        <ToolButton active={hud.soundMuted} onClick={() => e()?.toggleSound()} label={hud.soundMuted ? '🔇' : '🔊'} title="Toggle Audio" />
        <ToolButton onClick={() => e()?.clearAll()} label="C" title="Clear Visual Effects (C)" />
        <ToolButton active={hud.editor} onClick={() => e()?.toggleEditor()} label="G" title="VFX Shaders Editor (G)" />
        <ToolButton active={hud.help} onClick={() => e()?.toggleHelp()} label="H" title="Controls Guide (H)" />
      </div>

      {/* Game Over Defeat Modal */}
      {hud.gameState === 'game_over' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="flex flex-col items-center rounded-3xl border border-red-500/30 bg-[#080c16]/95 p-6 sm:p-8 max-w-md w-full shadow-2xl text-center">
            <div className="text-2xl sm:text-3xl font-black tracking-[0.3em] text-red-500 uppercase">
              💀 DEFEAT
            </div>
            <p className="mt-1 text-xs text-white/50">You fell in battle against the void beasts.</p>

            {/* Run Summary */}
            <div className="my-5 w-full rounded-2xl border border-white/10 bg-black/40 p-3.5 font-mono text-xs space-y-1">
              <div className="flex justify-between py-1 border-b border-white/10">
                <span className="text-white/40">WAVES SURVIVED:</span>
                <span className="font-bold text-cyan-300">{hud.currentWave - 1}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/10">
                <span className="text-white/40">FINAL SCORE:</span>
                <span className="font-bold text-amber-300">{hud.score.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/10">
                <span className="text-white/40">MONSTERS SLAIN:</span>
                <span className="font-bold text-white">{hud.totalKills}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-white/40">HIGH SCORE:</span>
                <span className="font-bold text-emerald-400">{hud.highScore.toLocaleString()}</span>
              </div>
            </div>

            <button
              onClick={() => e()?.restartGame()}
              className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 sm:py-3 font-mono text-xs font-bold tracking-widest text-white uppercase shadow-lg shadow-cyan-500/30 transition-all hover:scale-105"
            >
              🔄 PLAY AGAIN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function KillPill({ icon, count, color, title }: { icon: string; count: number; color: string; title: string }) {
  return (
    <div
      title={title}
      className="flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-1.5 sm:px-2 py-0.5 font-mono text-[8px] sm:text-[9px]"
    >
      <span style={{ color }}>{icon}</span>
      <span className="text-white/70">{count}</span>
    </div>
  );
}

function Ctrl({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5 border-b border-white/5">
      <span className="font-mono text-[10px] text-cyan-300/90 font-bold whitespace-nowrap">{k}</span>
      <span className="text-white/70 text-right">{v}</span>
    </div>
  );
}

function SlotButton({ element, armed, cooldown, onClick }: { element: string; armed: boolean; cooldown: number; onClick: () => void }) {
  const meta = (ELEMENT_META as any)[element];
  const onCd = cooldown > 0.001;
  return (
    <button
      onClick={onClick}
      title={`${meta.label} (${meta.key}) — ${meta.description}`}
      className={`relative h-12 w-14 sm:h-14 sm:w-16 overflow-hidden rounded-xl border text-center transition-all flex-shrink-0 ${
        armed
          ? 'scale-105 border-white/90 bg-white/15'
          : 'border-white/15 bg-[#080c16]/80 hover:border-white/40 hover:bg-white/10'
      }`}
      style={{ boxShadow: armed ? `0 0 16px -2px ${meta.color}` : undefined }}
    >
      <div className="mt-0.5 sm:mt-1 text-lg sm:text-xl leading-none" style={{ color: meta.color, textShadow: `0 0 10px ${meta.color}` }}>
        {meta.glyph}
      </div>
      <div className="font-mono text-[9px] sm:text-[10px] uppercase font-bold text-white/70">{meta.key}</div>
      <div className="text-[7px] sm:text-[8px] text-white/40 truncate px-0.5">{meta.label.split(' ')[0]}</div>
      {onCd && <div className="absolute inset-x-0 bottom-0 bg-black/75" style={{ height: `${cooldown * 100}%` }} />}
      {onCd && (
        <div className="absolute inset-0 flex items-center justify-center font-mono text-[10px] sm:text-xs font-bold text-white/90">
          {cooldown.toFixed(1)}
        </div>
      )}
    </button>
  );
}

function ToolButton({ active, onClick, label, title }: { active?: boolean; onClick: () => void; label: string; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`h-8 w-8 sm:h-9 sm:w-9 rounded-xl border font-mono text-[10px] sm:text-xs font-bold transition-all flex-shrink-0 ${
        active
          ? 'border-cyan-400 bg-cyan-400/20 text-cyan-200 shadow-md shadow-cyan-500/20'
          : 'border-white/10 bg-[#080c16]/80 text-white/60 hover:border-white/30 hover:text-white/90'
      }`}
    >
      {label}
    </button>
  );
}
