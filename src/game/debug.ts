/**
 * Debug menu — a ⚙️ button in the corner opens a panel of live tuning
 * sliders, difficulty presets, and cheat buttons. Changes apply
 * immediately (TUNING is read live every frame) and are saved to
 * localStorage so they survive reloads. "Reset" returns to the values
 * shipped in config.ts.
 */

import { TUNING } from './config';

const STORAGE_KEY = 'silly-squirrel-tuning';

interface Field {
  path: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

const FIELDS: Field[] = [
  { path: 'squirrelBaseSpeed', label: 'Squirrel speed', min: 0.08, max: 0.5, step: 0.01 },
  { path: 'squirrelSpeedPerLevel', label: 'Speed gain per level', min: 0, max: 0.15, step: 0.005 },
  { path: 'gravity', label: 'Item fall gravity', min: 0.6, max: 3.5, step: 0.1 },
  { path: 'pointsPerLevel', label: 'Points per level', min: 20, max: 150, step: 10 },
  { path: 'maxLives', label: 'Lives (next game)', min: 1, max: 9, step: 1 },
  { path: 'rebuild.time', label: 'Troll: seconds to rebuild', min: 5, max: 30, step: 1 },
  { path: 'rebuild.perPress', label: 'Troll: % per press', min: 0.5, max: 8, step: 0.1 },
  { path: 'rebuild.perToolBonus', label: 'Troll: % per press per tool', min: 0, max: 5, step: 0.1 },
  { path: 'rebuild.drainBase', label: 'Troll: drain %/sec', min: 0, max: 8, step: 0.25 },
  { path: 'rebuild.drainPerLevel', label: 'Troll: extra drain per level', min: 0, max: 3, step: 0.1 },
  { path: 'rebuild.stompEvery', label: 'Troll: seconds between SMASH', min: 1, max: 10, step: 0.5 },
  { path: 'rebuild.stompAmount', label: 'Troll: SMASH damage %', min: 0, max: 25, step: 1 },
];

const DEFAULTS: Record<string, number> = {};

const PRESETS: Record<string, Record<string, number>> = {
  Easy: {
    squirrelBaseSpeed: 0.16,
    gravity: 1.3,
    'rebuild.time': 16,
    'rebuild.perPress': 3.5,
    'rebuild.drainBase': 1.5,
    'rebuild.stompEvery': 5,
    'rebuild.stompAmount': 4,
  },
  Normal: {}, // filled from DEFAULTS below
  Hard: {
    squirrelBaseSpeed: 0.28,
    gravity: 2.1,
    'rebuild.time': 9,
    'rebuild.perPress': 1.8,
    'rebuild.drainBase': 3.5,
    'rebuild.stompEvery': 2.5,
    'rebuild.stompAmount': 10,
  },
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function getVal(path: string): number {
  return path.split('.').reduce((o: any, k) => o[k], TUNING as any) as number;
}

function setVal(path: string, value: number): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  const obj = keys.reduce((o: any, k) => o[k], TUNING as any);
  obj[last] = value;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function save(): void {
  const data: Record<string, number> = {};
  for (const f of FIELDS) data[f.path] = getVal(f.path);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadSaved(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as Record<string, number>;
    for (const f of FIELDS) {
      if (typeof data[f.path] === 'number') setVal(f.path, data[f.path]);
    }
  } catch {
    /* corrupt saved tuning — ignore and use defaults */
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style: Partial<CSSStyleDeclaration>,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  if (text !== undefined) node.textContent = text;
  return node;
}

const buttonStyle: Partial<CSSStyleDeclaration> = {
  flex: '1',
  padding: '6px 4px',
  border: 'none',
  borderRadius: '8px',
  background: '#334',
  color: '#fff',
  font: '12px system-ui, sans-serif',
  cursor: 'pointer',
};

export function initDebugMenu(): void {
  for (const f of FIELDS) DEFAULTS[f.path] = getVal(f.path);
  PRESETS.Normal = { ...DEFAULTS };
  loadSaved();

  const refreshers: Array<() => void> = [];
  const refreshAll = (): void => refreshers.forEach((r) => r());

  const panel = el('div', {
    position: 'fixed',
    right: '10px',
    bottom: '58px',
    width: '290px',
    maxHeight: '75vh',
    overflowY: 'auto',
    background: 'rgba(15, 20, 35, 0.94)',
    color: '#fff',
    borderRadius: '12px',
    padding: '12px',
    font: '12px system-ui, sans-serif',
    zIndex: '10',
    display: 'none',
    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
  });

  panel.appendChild(el('div', { fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }, '🛠️ Debug menu'));

  // Difficulty presets
  const presetRow = el('div', { display: 'flex', gap: '6px', marginBottom: '10px' });
  for (const [name, preset] of Object.entries(PRESETS)) {
    const btn = el('button', { ...buttonStyle }, name);
    btn.addEventListener('click', () => {
      for (const [path, value] of Object.entries(preset)) setVal(path, value);
      refreshAll();
      save();
    });
    presetRow.appendChild(btn);
  }
  panel.appendChild(presetRow);

  // Tuning sliders
  for (const f of FIELDS) {
    const row = el('div', { marginBottom: '8px' });
    const top = el('div', { display: 'flex', justifyContent: 'space-between', marginBottom: '2px' });
    const valueSpan = el('span', { color: '#ffd34d' });
    top.appendChild(el('span', {}, f.label));
    top.appendChild(valueSpan);

    const slider = el('input', { width: '100%' });
    slider.type = 'range';
    slider.min = String(f.min);
    slider.max = String(f.max);
    slider.step = String(f.step);

    const refresh = (): void => {
      slider.value = String(getVal(f.path));
      const decimals = f.step < 1 ? String(f.step).split('.')[1]?.length ?? 1 : 0;
      valueSpan.textContent = getVal(f.path).toFixed(decimals);
    };
    refresh();
    refreshers.push(refresh);

    slider.addEventListener('input', () => {
      setVal(f.path, Number(slider.value));
      refresh();
      save();
    });

    row.appendChild(top);
    row.appendChild(slider);
    panel.appendChild(row);
  }

  // Cheats for quick testing
  panel.appendChild(el('div', { fontWeight: 'bold', margin: '6px 0 6px' }, 'Cheats'));
  const cheatRow = el('div', { display: 'flex', gap: '6px', marginBottom: '10px' });
  const cheats: Array<[string, () => void]> = [
    /* eslint-disable @typescript-eslint/no-explicit-any */
    ['🧰 +5 tools', () => ((window as any).__game.tools += 5)],
    ['❤️ +1 life', () => ((window as any).__game.lives += 1)],
    ['🧌 troll!', () => (window as any).__game.startRebuild()],
    /* eslint-enable @typescript-eslint/no-explicit-any */
  ];
  for (const [label, action] of cheats) {
    const btn = el('button', { ...buttonStyle }, label);
    btn.addEventListener('click', action);
    cheatRow.appendChild(btn);
  }
  panel.appendChild(cheatRow);

  // Reset
  const reset = el('button', { ...buttonStyle, width: '100%', background: '#553' }, 'Reset to defaults');
  reset.addEventListener('click', () => {
    for (const [path, value] of Object.entries(DEFAULTS)) setVal(path, value);
    localStorage.removeItem(STORAGE_KEY);
    refreshAll();
  });
  panel.appendChild(reset);

  // Toggle button
  const gear = el(
    'button',
    {
      position: 'fixed',
      right: '10px',
      bottom: '10px',
      width: '40px',
      height: '40px',
      borderRadius: '50%',
      border: 'none',
      background: 'rgba(15, 20, 35, 0.6)',
      fontSize: '20px',
      cursor: 'pointer',
      zIndex: '10',
    },
    '⚙️',
  );
  gear.title = 'Debug menu (or press `)';
  const toggle = (): void => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  };
  gear.addEventListener('click', toggle);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote') toggle();
  });

  document.body.appendChild(panel);
  document.body.appendChild(gear);
}
