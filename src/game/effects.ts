/** Particles and floating score text — the juice that makes it feel fun. */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color?: string;
  emoji?: string;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

export class Effects {
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  /** Screen shake intensity in px; decays every frame. */
  shake = 0;

  burst(x: number, y: number, opts: { emoji?: string; color?: string; count: number; speed: number }): void {
    for (let i = 0; i < opts.count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = opts.speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - speed * 0.4,
        life: 0.9,
        maxLife: 0.9,
        size: 10 + Math.random() * 16,
        color: opts.color,
        emoji: opts.emoji,
      });
    }
  }

  floatText(x: number, y: number, text: string, color: string): void {
    this.texts.push({ x, y, text, color, life: 1 });
  }

  update(dt: number, gravity: number): void {
    this.shake = Math.max(0, this.shake - dt * 40);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += gravity * 0.4 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) {
      t.y -= 60 * dt;
      t.life -= dt * 0.9;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      if (p.emoji) {
        ctx.font = `${p.size}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.emoji, p.x, p.y);
      } else {
        ctx.fillStyle = p.color ?? '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.3 * alpha, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    for (const t of this.texts) {
      ctx.globalAlpha = Math.max(0, t.life);
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}
