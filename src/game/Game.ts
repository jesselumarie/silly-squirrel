import { ITEMS, SIDES, TUNING, type ItemDef } from './config';
import { drawSprite, preloadSprite } from './sprites';
import { Effects } from './effects';
import { sfx } from './audio';

type GameState = 'menu' | 'playing' | 'gameover';

interface FallingItem {
  def: ItemDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  spin: number;
}

const BEST_SCORE_KEY = 'silly-squirrel-best';

export class Game {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private lastTime = 0;
  private elapsed = 0;

  private state: GameState = 'menu';
  private score = 0;
  private best = 0;
  private lives = TUNING.maxLives;
  private level = 1;

  // Squirrel
  private squirrelX = 0.5; // fraction of width
  private squirrelDir = 1;
  private carried: ItemDef | null = null;
  private respawnTimer = 0;

  private falling: FallingItem[] = [];
  private effects = new Effects();

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.best = Number(localStorage.getItem(BEST_SCORE_KEY) ?? 0);

    for (const item of ITEMS) preloadSprite(item.id);
    for (const id of ['squirrel', 'heart', 'dumpster']) preloadSprite(id);

    window.addEventListener('resize', () => this.resize());
    this.resize();

    window.addEventListener('keydown', (e) => this.onKey(e));
    canvas.addEventListener('pointerdown', () => this.onTap());
  }

  start(): void {
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- input

  private onKey(e: KeyboardEvent): void {
    if (e.repeat) return;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.squirrelDir = -1;
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.squirrelDir = 1;
    else if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      this.onTap();
    }
  }

  private onTap(): void {
    if (this.state === 'menu') this.beginRun();
    else if (this.state === 'playing') this.dropItem();
    else if (this.state === 'gameover') this.state = 'menu';
  }

  // ------------------------------------------------------------- gameplay

  private beginRun(): void {
    this.state = 'playing';
    this.score = 0;
    this.lives = TUNING.maxLives;
    this.level = 1;
    this.squirrelX = 0.5;
    this.squirrelDir = 1;
    this.falling = [];
    this.carried = this.randomItem();
    this.respawnTimer = 0;
    sfx.levelUp();
  }

  private randomItem(): ItemDef {
    return ITEMS[Math.floor(Math.random() * ITEMS.length)];
  }

  private dropItem(): void {
    if (!this.carried) return;
    const speed = this.squirrelSpeed() * this.w;
    this.falling.push({
      def: this.carried,
      x: this.squirrelX * this.w,
      y: this.wireYAt(this.squirrelX) + this.itemSize() * 0.9,
      vx: this.squirrelDir * speed * 0.35,
      vy: 40,
      rotation: 0,
      spin: (Math.random() - 0.5) * 6,
    });
    this.carried = null;
    this.respawnTimer = TUNING.respawnDelay;
    sfx.drop();
  }

  private squirrelSpeed(): number {
    return TUNING.squirrelBaseSpeed + (this.level - 1) * TUNING.squirrelSpeedPerLevel;
  }

  private resolveLanding(item: FallingItem): void {
    const droppedGoodSide = item.x < this.w / 2;
    const correct = (item.def.kind === 'good') === droppedGoodSide;
    const binX = droppedGoodSide ? this.w * 0.25 : this.w * 0.75;
    const binY = this.h * TUNING.binY;

    if (correct) {
      this.score += TUNING.pointsPerCatch;
      this.effects.floatText(item.x, item.y - 40, `+${TUNING.pointsPerCatch}`, '#ffe14d');
      this.effects.burst(binX, binY, {
        emoji: droppedGoodSide ? '💖' : '⭐',
        count: 10,
        speed: 240,
      });
      sfx.correct();

      const newLevel = 1 + Math.floor(this.score / TUNING.pointsPerLevel);
      if (newLevel > this.level) {
        this.level = newLevel;
        this.effects.floatText(this.w / 2, this.h * 0.4, `LEVEL ${this.level}!`, '#7dffb3');
        sfx.levelUp();
      }
    } else {
      this.lives -= 1;
      this.effects.shake = 14;
      this.effects.burst(item.x, item.y, { emoji: '💥', count: 14, speed: 320 });
      this.effects.burst(item.x, item.y, { color: '#ff9c3f', count: 20, speed: 380 });
      this.effects.floatText(item.x, item.y - 40, 'OOPS!', '#ff6b6b');
      sfx.wrong();

      if (this.lives <= 0) {
        this.state = 'gameover';
        this.best = Math.max(this.best, this.score);
        localStorage.setItem(BEST_SCORE_KEY, String(this.best));
        sfx.gameOver();
      }
    }
  }

  // ----------------------------------------------------------- main loop

  private frame(time: number): void {
    const dt = Math.min(0.05, (time - this.lastTime) / 1000 || 0.016);
    this.lastTime = time;
    this.elapsed += dt;

    if (this.state === 'playing') this.update(dt);
    this.effects.update(dt, TUNING.gravity * this.h);
    this.draw();

    requestAnimationFrame((t) => this.frame(t));
  }

  private update(dt: number): void {
    // Squirrel runs along the wire and bounces at the edges.
    this.squirrelX += this.squirrelDir * this.squirrelSpeed() * dt;
    const margin = 0.06;
    if (this.squirrelX > 1 - margin) {
      this.squirrelX = 1 - margin;
      this.squirrelDir = -1;
    } else if (this.squirrelX < margin) {
      this.squirrelX = margin;
      this.squirrelDir = 1;
    }

    // Pick up the next item after a short delay.
    if (!this.carried && this.state === 'playing') {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.carried = this.randomItem();
    }

    // Falling items.
    const gravity = TUNING.gravity * this.h;
    const landY = this.h * TUNING.binY;
    for (const item of this.falling) {
      item.vy += gravity * dt;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.rotation += item.spin * dt;
    }
    const landed = this.falling.filter((i) => i.y >= landY);
    this.falling = this.falling.filter((i) => i.y < landY);
    for (const item of landed) this.resolveLanding(item);
  }

  // ------------------------------------------------------------- drawing

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = this.w * this.dpr;
    this.canvas.height = this.h * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private itemSize(): number {
    return Math.min(this.w, this.h) * 0.055;
  }

  private squirrelSize(): number {
    return Math.min(this.w, this.h) * 0.085;
  }

  /** The wire sags in the middle like a real power line. */
  private wireYAt(xFrac: number): number {
    const sag = 4 * xFrac * (1 - xFrac);
    return this.h * TUNING.wireY + this.h * TUNING.wireSag * sag;
  }

  private draw(): void {
    const { ctx, w, h } = this;
    ctx.save();
    if (this.effects.shake > 0) {
      ctx.translate(
        (Math.random() - 0.5) * this.effects.shake,
        (Math.random() - 0.5) * this.effects.shake,
      );
    }

    this.drawBackground();
    this.drawZones();
    this.drawWire();
    this.drawSquirrel();
    this.drawFalling();
    this.effects.draw(ctx);
    this.drawHud();

    if (this.state === 'menu') this.drawMenu();
    else if (this.state === 'gameover') this.drawGameOver();

    ctx.restore();
    void w;
    void h;
  }

  private drawBackground(): void {
    const { ctx, w, h } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#8ecdf5');
    sky.addColorStop(0.7, '#cbe9fb');
    sky.addColorStop(1, '#a8e08e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Drifting clouds
    ctx.font = `${Math.min(w, h) * 0.07}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.8;
    for (let i = 0; i < 3; i++) {
      const cx = ((this.elapsed * 12 + i * (w / 3) + i * 137) % (w + 200)) - 100;
      const cy = h * (0.3 + 0.13 * i);
      ctx.fillText('☁️', cx, cy);
    }
    ctx.globalAlpha = 1;

    // Grass at the bottom
    ctx.fillStyle = '#7cc96b';
    ctx.fillRect(0, h * 0.92, w, h * 0.08);
  }

  private drawZones(): void {
    const { ctx, w, h } = this;
    const wireBottom = this.wireYAt(0.5) + 30;

    // Side tints
    ctx.fillStyle = SIDES.good.tint;
    ctx.fillRect(0, wireBottom, w / 2, h - wireBottom);
    ctx.fillStyle = SIDES.bad.tint;
    ctx.fillRect(w / 2, wireBottom, w / 2, h - wireBottom);

    // Dashed center divider, like the drawing
    ctx.strokeStyle = 'rgba(210, 60, 80, 0.55)';
    ctx.lineWidth = 4;
    ctx.setLineDash([18, 14]);
    ctx.beginPath();
    ctx.moveTo(w / 2, wireBottom);
    ctx.lineTo(w / 2, h * 0.92);
    ctx.stroke();
    ctx.setLineDash([]);

    // Bins
    const binY = h * TUNING.binY;
    const binSize = Math.min(w, h) * 0.14;
    const bounce = Math.sin(this.elapsed * 3) * 4;
    drawSprite(ctx, 'heart', SIDES.good.emoji, w * 0.25, binY + bounce, binSize);
    drawSprite(ctx, 'dumpster', SIDES.bad.emoji, w * 0.75, binY - bounce, binSize);

    ctx.font = `bold ${Math.min(w, h) * 0.028}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(60, 40, 50, 0.65)';
    ctx.fillText(SIDES.good.label, w * 0.25, binY + binSize * 0.75);
    ctx.fillText(SIDES.bad.label, w * 0.75, binY + binSize * 0.75);
  }

  private drawWire(): void {
    const { ctx, w } = this;

    // Poles
    ctx.strokeStyle = '#6b4a2f';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(6, this.wireYAt(0) - 20);
    ctx.lineTo(6, this.h * 0.92);
    ctx.moveTo(w - 6, this.wireYAt(1) - 20);
    ctx.lineTo(w - 6, this.h * 0.92);
    ctx.stroke();

    // The electrowire itself
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, this.wireYAt(0));
    ctx.quadraticCurveTo(w / 2, this.wireYAt(0.5) + this.h * TUNING.wireSag, w, this.wireYAt(1));
    ctx.stroke();

    // Electric sparks zipping along the wire
    for (let i = 0; i < 3; i++) {
      const t = ((this.elapsed * 0.35 + i / 3) % 1);
      const x = t * w;
      const y = this.wireYAt(t);
      const flicker = 0.5 + 0.5 * Math.sin(this.elapsed * 30 + i * 9);
      ctx.fillStyle = `rgba(255, 235, 80, ${0.35 + 0.5 * flicker})`;
      ctx.beginPath();
      ctx.arc(x, y, 4 + 3 * flicker, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawSquirrel(): void {
    const { ctx } = this;
    const x = this.squirrelX * this.w;
    const size = this.squirrelSize();
    const bob = Math.sin(this.elapsed * 14) * (this.state === 'playing' ? 3 : 1.5);
    const y = this.wireYAt(this.squirrelX) - size * 0.45 + bob;

    // The emoji squirrel faces left by default; flip when running right.
    drawSprite(ctx, 'squirrel', '🐿️', x, y, size, 0, this.squirrelDir === 1);

    // Carried item dangles below the wire with a little sway.
    if (this.carried && this.state === 'playing') {
      const sway = Math.sin(this.elapsed * 6) * 0.15;
      const itemY = this.wireYAt(this.squirrelX) + this.itemSize() * 0.9;
      ctx.strokeStyle = 'rgba(90, 60, 40, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y + size * 0.3);
      ctx.lineTo(x + sway * 20, itemY - this.itemSize() * 0.4);
      ctx.stroke();
      drawSprite(ctx, this.carried.id, this.carried.emoji, x + sway * 20, itemY, this.itemSize(), sway);
    }
  }

  private drawFalling(): void {
    for (const item of this.falling) {
      drawSprite(this.ctx, item.def.id, item.def.emoji, item.x, item.y, this.itemSize(), item.rotation);
    }
  }

  private drawHud(): void {
    const { ctx, w } = this;
    if (this.state === 'menu') return;

    ctx.font = `bold ${Math.min(w, this.h) * 0.045}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.strokeText(`⭐ ${this.score}`, 16, 12);
    ctx.fillStyle = '#fff';
    ctx.fillText(`⭐ ${this.score}`, 16, 12);

    ctx.textAlign = 'right';
    const hearts = '❤️'.repeat(this.lives) + '🖤'.repeat(TUNING.maxLives - this.lives);
    ctx.strokeText(hearts, w - 16, 12);
    ctx.fillText(hearts, w - 16, 12);

    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.min(w, this.h) * 0.03}px system-ui, sans-serif`;
    ctx.strokeText(`Level ${this.level}`, w / 2, 16);
    ctx.fillText(`Level ${this.level}`, w / 2, 16);
  }

  private overlay(alpha: number): void {
    this.ctx.fillStyle = `rgba(20, 30, 50, ${alpha})`;
    this.ctx.fillRect(0, 0, this.w, this.h);
  }

  private drawMenu(): void {
    const { ctx, w, h } = this;
    this.overlay(0.45);

    const cx = w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const bounce = Math.abs(Math.sin(this.elapsed * 2.5)) * 14;
    ctx.font = `${Math.min(w, h) * 0.16}px sans-serif`;
    ctx.fillText('🐿️', cx, h * 0.28 - bounce);

    ctx.font = `bold ${Math.min(w, h) * 0.075}px system-ui, sans-serif`;
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.strokeText('SILLY SQUIRREL', cx, h * 0.42);
    ctx.fillStyle = '#ffe14d';
    ctx.fillText('SILLY SQUIRREL', cx, h * 0.42);

    ctx.font = `${Math.min(w, h) * 0.032}px system-ui, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText('🍓 Yummy things go in the ❤️', cx, h * 0.54);
    ctx.fillText('💣 Bad things go in the 🗑️', cx, h * 0.60);
    ctx.fillText('⬅️ ➡️ steer  •  tap / SPACE to drop', cx, h * 0.66);

    if (this.best > 0) {
      ctx.fillStyle = '#7dffb3';
      ctx.fillText(`Best score: ${this.best}`, cx, h * 0.73);
    }

    const pulse = 0.6 + 0.4 * Math.sin(this.elapsed * 4);
    ctx.globalAlpha = pulse;
    ctx.font = `bold ${Math.min(w, h) * 0.04}px system-ui, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText('TAP TO PLAY', cx, h * 0.83);
    ctx.globalAlpha = 1;
  }

  private drawGameOver(): void {
    const { ctx, w, h } = this;
    this.overlay(0.55);

    const cx = w / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `${Math.min(w, h) * 0.13}px sans-serif`;
    ctx.fillText('💥', cx, h * 0.3);

    ctx.font = `bold ${Math.min(w, h) * 0.07}px system-ui, sans-serif`;
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.strokeText('GAME OVER', cx, h * 0.44);
    ctx.fillStyle = '#ff6b6b';
    ctx.fillText('GAME OVER', cx, h * 0.44);

    ctx.font = `bold ${Math.min(w, h) * 0.045}px system-ui, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText(`Score: ${this.score}`, cx, h * 0.55);
    ctx.fillStyle = '#ffe14d';
    ctx.fillText(`Best: ${this.best}`, cx, h * 0.62);

    const pulse = 0.6 + 0.4 * Math.sin(this.elapsed * 4);
    ctx.globalAlpha = pulse;
    ctx.font = `bold ${Math.min(w, h) * 0.038}px system-ui, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.fillText('TAP TO PLAY AGAIN', cx, h * 0.75);
    ctx.globalAlpha = 1;
  }
}
