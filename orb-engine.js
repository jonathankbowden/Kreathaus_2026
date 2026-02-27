/* =============================================
   ORB ENGINE — Organic gradient orb with grain
   Inspired by @jazzberryblue, @twirlyb42, @myrapervez
   Dynamic colors driven by weather/time/season
   ============================================= */

class OrbEngine {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');

        // High DPI
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.size = 0;

        // Animation state
        this.time = 0;
        this.mouseX = 0.5;
        this.mouseY = 0.5;
        this.targetMouseX = 0.5;
        this.targetMouseY = 0.5;
        this.isHovering = false;

        // Color palette — will be overridden by weather engine
        this.palette = {
            c1: { r: 232, g: 85, b: 58 },    // warm red-orange
            c2: { r: 244, g: 162, b: 97 },    // amber
            c3: { r: 38, g: 70, b: 83 },      // deep teal
            c4: { r: 26, g: 26, b: 26 },      // near black
            bg: { r: 245, g: 240, b: 232 },   // warm cream
        };
        this.targetPalette = { ...this.palette };

        // Noise seed
        this.noiseSeed = Math.random() * 1000;

        // Grain buffer (pre-computed for performance)
        this.grainCanvas = document.createElement('canvas');
        this.grainCtx = this.grainCanvas.getContext('2d');

        this.init();
    }

    init() {
        this.resize();
        this.generateGrain();
        this.bindEvents();
        this.animate();
    }

    resize() {
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        this.size = Math.min(rect.width, rect.height);

        this.canvas.width = this.size * this.dpr;
        this.canvas.height = this.size * this.dpr;
        this.canvas.style.width = this.size + 'px';
        this.canvas.style.height = this.size + 'px';
        this.ctx.scale(this.dpr, this.dpr);

        // Regenerate grain at new size
        this.grainCanvas.width = this.size * this.dpr;
        this.grainCanvas.height = this.size * this.dpr;
        this.generateGrain();
    }

    generateGrain() {
        const w = this.grainCanvas.width;
        const h = this.grainCanvas.height;
        if (w === 0 || h === 0) return;
        const imageData = this.grainCtx.createImageData(w, h);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const v = Math.random() * 255;
            const pinkShift = Math.random();
            // Pink/magenta grit — risograph registration feel
            if (pinkShift > 0.92) {
                // ~8% of grain pixels get a pink tint
                data[i] = Math.min(255, v + 40);     // red boost
                data[i + 1] = Math.max(0, v - 30);   // green cut
                data[i + 2] = Math.min(255, v + 20);  // slight blue
                data[i + 3] = 35;
            } else {
                data[i] = v;
                data[i + 1] = v;
                data[i + 2] = v;
                data[i + 3] = 22;
            }
        }

        this.grainCtx.putImageData(imageData, 0, 0);
    }

    bindEvents() {
        window.addEventListener('resize', () => this.resize());

        const container = this.canvas.parentElement;
        container.addEventListener('mousemove', (e) => {
            const rect = container.getBoundingClientRect();
            this.targetMouseX = (e.clientX - rect.left) / rect.width;
            this.targetMouseY = (e.clientY - rect.top) / rect.height;
            this.isHovering = true;
        });

        container.addEventListener('mouseleave', () => {
            this.targetMouseX = 0.5;
            this.targetMouseY = 0.5;
            this.isHovering = false;
        });

        // Touch support — TeamLab feel
        container.addEventListener('touchmove', (e) => {
            const touch = e.touches[0];
            const rect = container.getBoundingClientRect();
            this.targetMouseX = (touch.clientX - rect.left) / rect.width;
            this.targetMouseY = (touch.clientY - rect.top) / rect.height;
            this.isHovering = true;
        }, { passive: true });

        container.addEventListener('touchend', () => {
            this.targetMouseX = 0.5;
            this.targetMouseY = 0.5;
            this.isHovering = false;
        });
    }

    // Simple noise function (no dependencies)
    noise(x, y, z) {
        const n = Math.sin(x * 12.9898 + y * 78.233 + z * 45.164) * 43758.5453;
        return n - Math.floor(n);
    }

    smoothNoise(x, y, z) {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const fx = x - ix;
        const fy = y - iy;

        // Smoothstep
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);

        const n00 = this.noise(ix, iy, z);
        const n10 = this.noise(ix + 1, iy, z);
        const n01 = this.noise(ix, iy + 1, z);
        const n11 = this.noise(ix + 1, iy + 1, z);

        const nx0 = n00 + sx * (n10 - n00);
        const nx1 = n01 + sx * (n11 - n01);

        return nx0 + sy * (nx1 - nx0);
    }

    fbm(x, y, z) {
        let value = 0;
        let amplitude = 0.5;
        let frequency = 1;

        for (let i = 0; i < 4; i++) {
            value += amplitude * this.smoothNoise(x * frequency, y * frequency, z);
            amplitude *= 0.5;
            frequency *= 2;
        }

        return value;
    }

    lerpColor(c1, c2, t) {
        return {
            r: c1.r + (c2.r - c1.r) * t,
            g: c1.g + (c2.g - c1.g) * t,
            b: c1.b + (c2.b - c1.b) * t,
        };
    }

    setPalette(newPalette) {
        this.targetPalette = { ...newPalette };
    }

    updatePalette() {
        const lerp = 0.02;
        for (const key of ['c1', 'c2', 'c3', 'c4', 'bg']) {
            if (this.targetPalette[key] && this.palette[key]) {
                this.palette[key].r += (this.targetPalette[key].r - this.palette[key].r) * lerp;
                this.palette[key].g += (this.targetPalette[key].g - this.palette[key].g) * lerp;
                this.palette[key].b += (this.targetPalette[key].b - this.palette[key].b) * lerp;
            }
        }
    }

    draw() {
        const ctx = this.ctx;
        const s = this.size;
        const cx = s / 2;
        const cy = s / 2;
        const r = s / 2 - 2;

        // Smooth mouse following
        this.mouseX += (this.targetMouseX - this.mouseX) * 0.05;
        this.mouseY += (this.targetMouseY - this.mouseY) * 0.05;

        // Smooth palette transitions
        this.updatePalette();

        // Clear
        ctx.clearRect(0, 0, s, s);

        // Clip to circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();

        // === Base gradient — the warm core ===
        const baseGrad = ctx.createRadialGradient(
            cx + (this.mouseX - 0.5) * s * 0.3,
            cy + (this.mouseY - 0.5) * s * 0.3,
            0,
            cx,
            cy,
            r
        );

        const { c1, c2, c3, c4 } = this.palette;
        baseGrad.addColorStop(0, `rgb(${c1.r|0}, ${c1.g|0}, ${c1.b|0})`);
        baseGrad.addColorStop(0.35, `rgb(${c2.r|0}, ${c2.g|0}, ${c2.b|0})`);
        baseGrad.addColorStop(0.65, `rgb(${c3.r|0}, ${c3.g|0}, ${c3.b|0})`);
        baseGrad.addColorStop(1, `rgb(${c4.r|0}, ${c4.g|0}, ${c4.b|0})`);

        ctx.fillStyle = baseGrad;
        ctx.fillRect(0, 0, s, s);

        // === Organic flow layer — the liquid movement ===
        const t = this.time;
        const flowOffsetX = Math.sin(t * 0.3) * s * 0.2 + (this.mouseX - 0.5) * s * 0.25;
        const flowOffsetY = Math.cos(t * 0.25) * s * 0.2 + (this.mouseY - 0.5) * s * 0.25;

        const flowGrad = ctx.createRadialGradient(
            cx + flowOffsetX,
            cy + flowOffsetY,
            r * 0.05,
            cx + flowOffsetX * 0.5,
            cy + flowOffsetY * 0.5,
            r * 0.8
        );

        flowGrad.addColorStop(0, `rgba(${c2.r|0}, ${c2.g|0}, ${c2.b|0}, 0.95)`);
        flowGrad.addColorStop(0.4, `rgba(${c1.r|0}, ${c1.g|0}, ${c1.b|0}, 0.7)`);
        flowGrad.addColorStop(0.7, `rgba(${c3.r|0}, ${c3.g|0}, ${c3.b|0}, 0.4)`);
        flowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = flowGrad;
        ctx.fillRect(0, 0, s, s);

        // === Second flow — counter-rotation ===
        const flow2X = Math.cos(t * 0.2 + 1.5) * s * 0.2 - (this.mouseX - 0.5) * s * 0.15;
        const flow2Y = Math.sin(t * 0.35 + 0.8) * s * 0.18 - (this.mouseY - 0.5) * s * 0.15;

        const flowGrad2 = ctx.createRadialGradient(
            cx + flow2X,
            cy + flow2Y,
            r * 0.02,
            cx + flow2X * 0.3,
            cy + flow2Y * 0.3,
            r * 0.9
        );

        flowGrad2.addColorStop(0, `rgba(${c4.r|0}, ${c4.g|0}, ${c4.b|0}, 0.8)`);
        flowGrad2.addColorStop(0.3, `rgba(${c3.r|0}, ${c3.g|0}, ${c3.b|0}, 0.5)`);
        flowGrad2.addColorStop(0.7, `rgba(${c1.r|0}, ${c1.g|0}, ${c1.b|0}, 0.2)`);
        flowGrad2.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = flowGrad2;
        ctx.fillRect(0, 0, s, s);

        // === Third flow layer — adds depth like reference orbs ===
        const flow3X = Math.sin(t * 0.15 + 3.0) * s * 0.25;
        const flow3Y = Math.cos(t * 0.2 + 2.0) * s * 0.2;

        const flowGrad3 = ctx.createRadialGradient(
            cx + flow3X + (this.mouseX - 0.5) * s * 0.1,
            cy + flow3Y + (this.mouseY - 0.5) * s * 0.1,
            r * 0.01,
            cx,
            cy,
            r * 0.7
        );

        flowGrad3.addColorStop(0, `rgba(${c1.r|0}, ${c1.g|0}, ${c1.b|0}, 0.85)`);
        flowGrad3.addColorStop(0.5, `rgba(${c2.r|0}, ${c2.g|0}, ${c2.b|0}, 0.45)`);
        flowGrad3.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = flowGrad3;
        ctx.fillRect(0, 0, s, s);

        // === Dark swirl — the "yin" shadow like the reference ===
        ctx.globalCompositeOperation = 'multiply';

        const swirlAngle = t * 0.1;
        const swirlX = cx + Math.cos(swirlAngle) * r * 0.3 + (this.mouseX - 0.5) * s * 0.1;
        const swirlY = cy + Math.sin(swirlAngle) * r * 0.25 + (this.mouseY - 0.5) * s * 0.1;

        const swirlGrad = ctx.createRadialGradient(
            swirlX, swirlY, 0,
            swirlX, swirlY, r * 0.7
        );
        swirlGrad.addColorStop(0, `rgba(${c4.r|0}, ${c4.g|0}, ${c4.b|0}, 0.85)`);
        swirlGrad.addColorStop(0.4, `rgba(${c4.r|0}, ${c4.g|0}, ${c4.b|0}, 0.4)`);
        swirlGrad.addColorStop(1, 'rgba(255, 255, 255, 1)');

        ctx.fillStyle = swirlGrad;
        ctx.fillRect(0, 0, s, s);

        // === Inner glow — luminous center ===
        ctx.globalCompositeOperation = 'screen';

        const glowGrad = ctx.createRadialGradient(
            cx + (this.mouseX - 0.5) * s * 0.15,
            cy + (this.mouseY - 0.5) * s * 0.15 - s * 0.05,
            0,
            cx,
            cy,
            r * 0.6
        );
        glowGrad.addColorStop(0, `rgba(${c2.r|0}, ${c2.g|0}, ${c2.b|0}, 0.65)`);
        glowGrad.addColorStop(0.5, `rgba(${c1.r|0}, ${c1.g|0}, ${c1.b|0}, 0.3)`);
        glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.fillStyle = glowGrad;
        ctx.fillRect(0, 0, s, s);

        // === Edge shadow — gives 3D sphere depth ===
        ctx.globalCompositeOperation = 'multiply';

        const edgeGrad = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r);
        edgeGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        edgeGrad.addColorStop(0.7, 'rgba(255, 255, 255, 1)');
        edgeGrad.addColorStop(1, `rgba(${c4.r|0}, ${c4.g|0}, ${c4.b|0}, 0.9)`);

        ctx.fillStyle = edgeGrad;
        ctx.fillRect(0, 0, s, s);

        // === Grain texture overlay ===
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 0.35;
        ctx.drawImage(this.grainCanvas, 0, 0, s, s);
        ctx.globalAlpha = 1;

        // === Subtle edge ring — like the reference orbs ===
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath();
        ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${c3.r|0}, ${c3.g|0}, ${c3.b|0}, 0.15)`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.restore();
    }

    animate() {
        this.time += 0.01;
        this.draw();
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }
}

// Initialize
window.orbEngine = new OrbEngine('orbCanvas');
