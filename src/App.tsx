// @ts-nocheck
import React, { useEffect, useRef, useState } from 'react';
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

  useEffect(() => {
    if (!mountRef.current) return;
    const engine = new Engine(mountRef.current) as any;
    engineRef.current = engine;
    engine.onStats = (s: Stats) => setStats(s);
    engine.onState = (h: HudState) => setHud(h);
    engine.start();
    const t = setTimeout(() => setLoaded(true), 600);
    return () => {
      clearTimeout(t);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Tactical Minimap Radar Canvas Rendering
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

        let color = '#f87171'; // Red for crawler
        let dotR = 2.6;

        if (blip.type === 'golem') {
          color = '#fb923c';
          dotR = 3.8;
        } else if (blip.type === 'phantom') {
          color = '#38bdf8';
          dotR = 3.0;
        } else if (blip.type === 'pyrefiend') {
          color = '#f43f5e';
          dotR = 3.2;
        } else if (blip.type === 'behemoth') {
          color = '#e11d48';
          dotR = 5.5;
        }

        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 6;
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
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(px, py, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }, [hud.radarBlips, hud.playerPos]);

  const e = () => engineRef.current;

  const healthFrac = Math.max(0, Math.min(1, hud.health / hud.maxHealth));
  const shieldFrac = Math.max(0, Math.min(1, hud.shield / Math.max(1, hud.maxShield)));

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#05070d] font-sans text-white select-none">
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
          <div className="rounded-2xl border border-white/10 bg-[#080c16]/90 px-10 py-6 text-center shadow-2xl">
            <div className="text-2xl font-light tracking-[0.35em] text-cyan-300">PAUSED</div>
            <div className="mt-2 text-xs text-white/50">
              Press <span className="font-mono text-cyan-400 font-bold">P</span> to resume · WASD to move · Click to cast
            </div>
          </div>
        </div>
      )}

      {/* Top-Center: Wave Info, Progress & Score Header */}
      <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-[#080c16]/80 px-5 py-2 backdrop-blur-xl shadow-lg shadow-black/40">
          <div className="flex items-center gap-2">
            <span className="text-sm text-cyan-400">⚔️</span>
            <div className="font-mono text-xs font-bold tracking-widest text-cyan-200 uppercase">
              WAVE {hud.currentWave}
            </div>
          </div>

          <div className="h-3.5 w-px bg-white/10" />

          <div className="flex items-center gap-1.5 font-mono text-[11px] text-white/70">
            <span className="text-white/40">HOSTILES:</span>
            <span className={`font-bold ${hud.aliveCount <= 3 ? 'text-amber-400 animate-pulse' : 'text-white/90'}`}>
              {hud.aliveCount}
            </span>
          </div>

          <div className="h-3.5 w-px bg-white/10" />

          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            <span className="text-white/40">SCORE:</span>
            <span className="font-bold text-amber-300 tracking-wide text-xs">{hud.score.toLocaleString()}</span>
          </div>

          {hud.highScore > 0 && (
            <>
              <div className="h-3.5 w-px bg-white/10" />
              <div className="flex items-center gap-1 font-mono text-[10px] text-white/40">
                <span>HI:</span>
                <span className="text-white/70">{hud.highScore.toLocaleString()}</span>
              </div>
            </>
          )}
        </div>

        {/* Combo Multiplier Bar */}
        {hud.combo > 1 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-950/70 px-3.5 py-1 backdrop-blur-xl shadow-md">
            <span className="text-xs">🔥</span>
            <span className="font-mono text-xs font-bold tracking-wider text-amber-300">
              {hud.comboMultiplier.toFixed(2)}x COMBO
            </span>
            <div className="h-1.5 w-14 overflow-hidden rounded-full bg-black/50">
              <div
                className="h-full bg-amber-400 transition-all duration-100"
                style={{ width: `${Math.max(0, (hud.comboTimer / 3.8) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Top-Left: Game Title & Kill Breakdown */}
      <div className="pointer-events-none absolute left-5 top-4 z-20">
        <div className="flex items-center gap-2">
          <span className="text-lg text-cyan-400">❄⚡</span>
          <h1 className="text-xs font-bold uppercase tracking-[0.25em] text-white/90">Elemental Onslaught</h1>
        </div>
        <p className="mt-0.5 text-[10px] tracking-wider text-white/40">
          WASD Move · Space Dash · 5 Elemental Skillshots
        </p>

        {/* Elemental Kill Counter Pills */}
        <div className="mt-2 flex items-center gap-1">
          <span className="font-mono text-[9px] text-white/40 uppercase tracking-wider">KILLS:</span>
          <KillPill icon="❄" count={hud.elementalKills.ice} color="#9fe8ff" title="Frost Shatters" />
          <KillPill icon="⚡" count={hud.elementalKills.thunder} color="#7fb8ff" title="Storm Zaps" />
          <KillPill icon="☄" count={hud.elementalKills.meteor} color="#ff8a3a" title="Meteor Blasts" />
          <KillPill icon="✦" count={hud.elementalKills.beam} color="#aee6ff" title="Beam Melts" />
          <KillPill icon="⬡" count={hud.elementalKills.snare} color="#c08bff" title="Vortex Crushes" />
        </div>
      </div>

      {/* Top-Right: Holographic Minimap & Performance Stats */}
      <div className="pointer-events-none absolute right-4 top-4 z-20 flex flex-col items-end gap-1.5">
        <div className="relative rounded-2xl border border-white/10 bg-[#080c16]/80 p-2 backdrop-blur-xl shadow-lg">
          <div className="absolute top-2 left-3 font-mono text-[9px] uppercase tracking-widest text-cyan-400/60">
            RADAR · ARENA
          </div>
          <canvas ref={radarCanvasRef} width={120} height={120} className="rounded-xl block" />
        </div>

        <div className="rounded-lg border border-white/10 bg-[#080c16]/60 px-2.5 py-1 text-right font-mono text-[9px] text-white/50 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2.5">
            <span>FPS</span>
            <span className={stats.fps >= 50 ? 'text-emerald-300 font-bold' : 'text-amber-300 font-bold'}>{stats.fps}</span>
            <span className="text-white/20">|</span>
            <span>VFX</span>
            <span className="text-white/70">{stats.particles}</span>
          </div>
        </div>
      </div>

      {/* Right: Floating Kill Feed Popups */}
      <div className="pointer-events-none absolute right-5 top-44 z-20 flex flex-col items-end gap-1.5">
        {hud.killFeed.map((kf) => {
          const meta = (ELEMENT_META as any)[kf.element] || { color: '#ffffff', label: kf.element };
          return (
            <div
              key={kf.id}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#080c16]/80 px-3 py-1 text-[10px] font-mono backdrop-blur-md"
              style={{ borderColor: `${meta.color}40`, boxShadow: `0 0 12px -4px ${meta.color}` }}
            >
              <span className="text-xs" style={{ color: meta.color }}>{kf.glyph}</span>
              <span className="text-white/80">{kf.name}</span>
              <span className="font-bold" style={{ color: meta.color }}>+{kf.score}</span>
            </div>
          );
        })}
      </div>

      {/* Bottom-Left: Player Vitals (HP, Shield, Dash) */}
      <div className="pointer-events-none absolute bottom-5 left-5 z-20 flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-[#080c16]/80 p-3.5 backdrop-blur-xl shadow-lg min-w-[220px]">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider">
          <span className="text-white/40">CASTER VITALS</span>
          <span className="text-cyan-300 font-bold">{Math.round(hud.health)} HP</span>
        </div>

        {/* Health Bar */}
        <div className="relative h-3.5 w-full overflow-hidden rounded-full bg-slate-950 border border-white/10">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-150"
            style={{ width: `${healthFrac * 100}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-[8px] font-mono font-bold text-white/90 drop-shadow">
            {Math.round(hud.health)} / {hud.maxHealth}
          </div>
        </div>

        {/* Shield Bar */}
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-950 border border-cyan-500/20">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-150 shadow-[0_0_8px_#38bdf8]"
            style={{ width: `${shieldFrac * 100}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-[7px] font-mono font-bold text-cyan-100 drop-shadow">
            SHIELD {Math.round(hud.shield)} / {hud.maxShield}
          </div>
        </div>

        {/* Dash Status */}
        <div className="flex items-center justify-between pt-0.5 font-mono text-[9px]">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-cyan-950 border border-cyan-500/30 px-1 py-0.2 text-cyan-300 font-bold text-[8px]">SPACE</span>
            <span className="text-white/50">DASH</span>
          </div>
          <span className={hud.dashCooldown <= 0.01 ? 'text-cyan-300 font-bold' : 'text-white/30'}>
            {hud.dashCooldown <= 0.01 ? 'READY' : `${(hud.dashCooldown * 1.1).toFixed(1)}s`}
          </span>
        </div>
      </div>

      {/* Help / Controls Guide */}
      {hud.help && (
        <div className="pointer-events-none absolute bottom-28 left-5 z-20 max-w-sm rounded-xl border border-white/10 bg-[#080c16]/90 p-4 text-[11px] leading-relaxed text-white/70 backdrop-blur-xl shadow-2xl">
          <div className="mb-2 font-bold uppercase tracking-widest text-cyan-300 text-xs">Battle Controls & Synergies</div>
          <Ctrl k="W A S D" v="Move character battle-mage across the arena" />
          <Ctrl k="SPACE" v="Dash / Dodge lunge with invulnerability frames" />
          <Ctrl k="Q · 1" v="Frost Lance: Freezes & shatters into tumbling ice shards" />
          <Ctrl k="E · 2" v="Storm Lance: Electrocutes & chains lightning across mobs" />
          <Ctrl k="R · 3" v="Cinder Fall: Fiery meteor blast & burning debris" />
          <Ctrl k="F · 4" v="Nova Beam: Piercing laser that vaporizes monsters" />
          <Ctrl k="V · 5" v="Voltaic Snare: Gravity vortex that roots & implodes" />
          <Ctrl k="Mouse / L-Click" v="Aim indicator / Cast ability along arrow or zone" />
          <Ctrl k="R-Drag / Scroll" v="Orbit camera / Zoom in & out" />
        </div>
      )}

      {/* Bottom Toolbar & Ability Hotbar */}
      <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2">
        {SLOTS.map((el, i) => (
          <SlotButton
            key={el}
            element={el}
            armed={hud.armed && hud.slot === i}
            cooldown={hud.cooldowns[i] ?? 0}
            onClick={() => e()?.armSlot(i)}
          />
        ))}
        <div className="mx-1 h-10 w-px bg-white/15" />
        <ToolButton active={hud.paused} onClick={() => e()?.togglePause()} label="P" title="Pause Game (P)" />
        <ToolButton active={hud.soundMuted} onClick={() => e()?.toggleSound()} label={hud.soundMuted ? '🔇' : '🔊'} title="Toggle Audio" />
        <ToolButton onClick={() => e()?.clearAll()} label="C" title="Clear Visual Effects (C)" />
        <ToolButton active={hud.editor} onClick={() => e()?.toggleEditor()} label="G" title="VFX Shaders Editor (G)" />
        <ToolButton active={hud.help} onClick={() => e()?.toggleHelp()} label="H" title="Controls Guide (H)" />
      </div>

      {/* Wave Clear / Power-Up Selection Modal */}
      {hud.gameState === 'wave_clear' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 backdrop-blur-md">
          <div className="flex flex-col items-center rounded-3xl border border-cyan-500/30 bg-[#080c16]/95 p-8 max-w-xl shadow-2xl text-center">
            <div className="text-2xl font-bold tracking-[0.25em] text-cyan-300 uppercase">
              ✨ WAVE {hud.currentWave} CLEARED!
            </div>
            <p className="mt-1 text-xs text-white/50">
              Select an elemental perk to empower your spells:
            </p>

            <div className="mt-6 grid grid-cols-3 gap-3.5 w-full">
              {hud.waveOptions.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => e()?.selectPowerup(opt.id)}
                  className="group flex flex-col items-center rounded-2xl border border-white/10 bg-slate-900/50 p-4 text-center transition-all hover:scale-105 hover:border-cyan-400 hover:bg-cyan-950/20 shadow-md"
                >
                  <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">{opt.icon}</div>
                  <div className="font-bold text-xs text-cyan-200 group-hover:text-cyan-300">{opt.title}</div>
                  <div className="mt-1.5 text-[10px] text-white/50 leading-tight">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Game Over Defeat Modal */}
      {hud.gameState === 'game_over' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="flex flex-col items-center rounded-3xl border border-red-500/30 bg-[#080c16]/95 p-8 max-w-md shadow-2xl text-center">
            <div className="text-3xl font-black tracking-[0.3em] text-red-500 uppercase">
              💀 DEFEAT
            </div>
            <p className="mt-1 text-xs text-white/50">You fell in battle against the void beasts.</p>

            {/* Run Summary */}
            <div className="my-6 w-full rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-xs">
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
              className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-3 font-mono text-xs font-bold tracking-widest text-white uppercase shadow-lg shadow-cyan-500/30 transition-all hover:scale-105"
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
      className="flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-2 py-0.5 font-mono text-[9px]"
    >
      <span style={{ color }}>{icon}</span>
      <span className="text-white/70">{count}</span>
    </div>
  );
}

function Ctrl({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="min-w-[80px] font-mono text-[10px] text-cyan-300/90 font-bold">{k}</span>
      <span className="text-white/70">{v}</span>
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
      className={`relative h-15 w-18 overflow-hidden rounded-xl border text-center transition-all ${
        armed
          ? 'scale-105 border-white/90 bg-white/15'
          : 'border-white/15 bg-[#080c16]/80 hover:border-white/40 hover:bg-white/10'
      }`}
      style={{ boxShadow: armed ? `0 0 20px -2px ${meta.color}` : undefined }}
    >
      <div className="mt-1 text-xl leading-none" style={{ color: meta.color, textShadow: `0 0 12px ${meta.color}` }}>
        {meta.glyph}
      </div>
      <div className="mt-0.5 font-mono text-[10px] uppercase font-bold text-white/70">{meta.key}</div>
      <div className="text-[8px] text-white/40 truncate px-1">{meta.label.split(' ')[0]}</div>
      {onCd && <div className="absolute inset-x-0 bottom-0 bg-black/75" style={{ height: `${cooldown * 100}%` }} />}
      {onCd && (
        <div className="absolute inset-0 flex items-center justify-center font-mono text-xs font-bold text-white/90">
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
      className={`h-10 w-10 rounded-xl border font-mono text-xs font-bold transition-all ${
        active
          ? 'border-cyan-400 bg-cyan-400/20 text-cyan-200 shadow-md shadow-cyan-500/20'
          : 'border-white/10 bg-[#080c16]/80 text-white/60 hover:border-white/30 hover:text-white/90'
      }`}
    >
      {label}
    </button>
  );
}
