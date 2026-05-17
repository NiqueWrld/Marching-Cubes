export class Noise {
    constructor(seed = 42) {
        this.p = new Uint8Array(512);
        const base = new Uint8Array(256);
        for (let i = 0; i < 256; i++) base[i] = i;
        let s = seed;
        for (let i = 255; i > 0; i--) {
            s = (s * 1664525 + 1013904223) >>> 0;
            const j = s % (i + 1);
            [base[i], base[j]] = [base[j], base[i]];
        }
        for (let i = 0; i < 512; i++) this.p[i] = base[i & 255];
    }
    fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    lerp(a, b, t) { return a + t * (b - a); }
    grad(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y, v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
        return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
    }
    perlin(x, y, z) {
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
        x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
        const u = this.fade(x), v = this.fade(y), w = this.fade(z);
        const p = this.p;
        const A = p[X]+Y, AA = p[A]+Z, AB = p[A+1]+Z;
        const B = p[X+1]+Y, BA = p[B]+Z, BB = p[B+1]+Z;
        return this.lerp(
            this.lerp(this.lerp(this.grad(p[AA],x,y,z),   this.grad(p[BA],x-1,y,z),   u),
                      this.lerp(this.grad(p[AB],x,y-1,z), this.grad(p[BB],x-1,y-1,z), u), v),
            this.lerp(this.lerp(this.grad(p[AA+1],x,y,z-1), this.grad(p[BA+1],x-1,y,z-1), u),
                      this.lerp(this.grad(p[AB+1],x,y-1,z-1), this.grad(p[BB+1],x-1,y-1,z-1), u), v), w
        );
    }
    octave(x, y, z, octs = 4, persistence = 0.5, lacunarity = 2.0) {
        let val = 0, amp = 1, freq = 1, max = 0;
        for (let i = 0; i < octs; i++) {
            val += this.perlin(x * freq, y * freq, z * freq) * amp;
            max += amp; amp *= persistence; freq *= lacunarity;
        }
        return val / max;
    }
}
