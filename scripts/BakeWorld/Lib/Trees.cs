using System.Globalization;

// Tree generation baked into world tiles. Mirrors src/lib/trees.ts so colliders
// stay in sync between the C# baker and the TS runtime.

static class Trees
{
    /// <summary>
    /// Generate up to 5 trees for one chunk, emit their geometry into the tile
    /// writer, and record collider data on the tile.
    /// </summary>
    public static void BakeChunk(
        TileWriter t, IFormatProvider inv,
        Func<double, double, double, double> densityFn,
        int cx, int cz, int ox, int oy, int oz,
        int chunkSz, double iso)
    {
        for (int ti = 0; ti < 5; ti++)
        {
            int seedT = unchecked((cx * 73856093) ^ (cz * 19349663) ^ (ti * 1234567));
            double wx = ox + SeededRand(seedT)     * chunkSz;
            double wz = oz + SeededRand(seedT + 1) * chunkSz;
            double? sy = FindSurfaceY(densityFn, wx, oy, wz, chunkSz, iso);
            if (sy is null) continue;
            // Surface Nets + Laplacian smoothing pulls the rendered mesh slightly
            // below the analytic iso surface. Sink the trunk base so it doesn't
            // float above the visible ground.
            const double SURFACE_SINK = 0.45;
            double groundY = sy.Value - SURFACE_SINK;

            const double e = 0.5;
            double gx = densityFn(wx + e, sy.Value, wz) - densityFn(wx - e, sy.Value, wz);
            double gy = densityFn(wx, sy.Value + e, wz) - densityFn(wx, sy.Value - e, wz);
            double gz = densityFn(wx, sy.Value, wz + e) - densityFn(wx, sy.Value, wz - e);
            double glen = Math.Sqrt(gx * gx + gy * gy + gz * gz);
            if (glen < 1e-6) glen = 1;
            if (-gy / glen < 0.72) continue;

            double trunkH   = 3.5 + SeededRand(seedT + 2) * 2.5;
            double foliageR = 2.2 + SeededRand(seedT + 3) * 1.8;
            var fCol = SeededRand(seedT + 4) > 0.5
                ? (R: 0.176, G: 0.416, B: 0.122)
                : (R: 0.227, G: 0.541, B: 0.165);
            double f2dx = (SeededRand(seedT + 5) - 0.5) * foliageR;
            double f2dz = (SeededRand(seedT + 6) - 0.5) * foliageR;

            // Trunk (tapered cylinder)
            AppendCylinder(t, inv,
                cx: wx, cz: wz, cyBot: groundY, cyTop: groundY + trunkH,
                rBot: 0.35, rTop: 0.22, radial: 7,
                colR: 0.420, colG: 0.227, colB: 0.165);

            // Foliage f1 (main canopy)
            double f1y = groundY + trunkH + foliageR * 0.55;
            AppendSphere(t, inv, wx, f1y, wz, foliageR, 7, 6, fCol.R, fCol.G, fCol.B);

            // Foliage f2 (smaller offset ball)
            double f2x = wx + f2dx;
            double f2y = groundY + trunkH + foliageR * 1.1;
            double f2z = wz + f2dz;
            AppendSphere(t, inv, f2x, f2y, f2z, foliageR * 0.7, 6, 5, fCol.R, fCol.G, fCol.B);

            // Colliders for the manifest
            t.Trunks.Add((wx, wz, 0.45, groundY, groundY + trunkH));
            t.Foliage.Add((wx, f1y, wz, foliageR));
            t.Foliage.Add((f2x, f2y, f2z, foliageR * 0.7));
        }
    }

    // Mirrors seededRand in src/lib/terrain.ts (Math.imul-style 32-bit hash).
    public static double SeededRand(int s)
    {
        uint u = unchecked((uint)s);
        u = unchecked(((u ^ (u >> 16)) * 0x45d9f3b));
        u = unchecked(((u ^ (u >> 16)) * 0x45d9f3b));
        u = u ^ (u >> 16);
        return u / 4294967295.0;
    }

    // Bisect to find the iso surface; searches well outside one chunk's y-band
    // so trees on tall ridges or in deep valleys still get a hit.
    public static double? FindSurfaceY(Func<double, double, double, double> density,
                                       double wx, int oy, double wz, int chunkSz, double iso)
    {
        double bot = oy - chunkSz;        // one chunk below
        double top = oy + chunkSz * 4;    // up to four chunks above
        if (density(wx, bot, wz) <= iso) return null;
        if (density(wx, top, wz) >  iso) return null;
        double lo = bot, hi = top;
        for (int i = 0; i < 24; i++)
        {
            double mid = (lo + hi) * 0.5;
            if (density(wx, mid, wz) > iso) lo = mid; else hi = mid;
        }
        return hi;
    }

    static void AppendCylinder(TileWriter t, IFormatProvider inv,
        double cx, double cz, double cyBot, double cyTop,
        double rBot, double rTop, int radial,
        double colR, double colG, double colB)
    {
        var w = t.W;
        int baseIdx = t.VBase;

        // Bottom ring (0..radial-1), top ring (radial..2*radial-1)
        for (int side = 0; side < 2; side++)
        {
            double y = side == 0 ? cyBot : cyTop;
            double r = side == 0 ? rBot  : rTop;
            for (int i = 0; i < radial; i++)
            {
                double a = (i / (double)radial) * Math.PI * 2;
                double vx = cx + Math.Cos(a) * r;
                double vz = cz + Math.Sin(a) * r;
                WriteV(w, inv, vx, y, vz, colR, colG, colB);
                WriteVN(w, inv, Math.Cos(a), 0, Math.Sin(a));
                Bounds(t, vx, y, vz);
            }
        }
        // Top + bottom cap centers
        WriteV(w, inv, cx, cyTop, cz, colR, colG, colB);
        WriteVN(w, inv, 0, 1, 0);
        Bounds(t, cx, cyTop, cz);
        WriteV(w, inv, cx, cyBot, cz, colR, colG, colB);
        WriteVN(w, inv, 0, -1, 0);
        Bounds(t, cx, cyBot, cz);
        int topCenter = baseIdx + 2 * radial;
        int botCenter = baseIdx + 2 * radial + 1;

        // Side quads
        for (int i = 0; i < radial; i++)
        {
            int next = (i + 1) % radial;
            int b0 = baseIdx + i;
            int b1 = baseIdx + next;
            int t0 = baseIdx + radial + i;
            int t1 = baseIdx + radial + next;
            WriteTri(w, b0, t0, t1);
            WriteTri(w, b0, t1, b1);
        }
        // Top cap fan (CCW from above)
        for (int i = 0; i < radial; i++)
        {
            int next = (i + 1) % radial;
            int t0 = baseIdx + radial + i;
            int t1 = baseIdx + radial + next;
            WriteTri(w, topCenter, t1, t0);
        }
        // Bottom cap fan
        for (int i = 0; i < radial; i++)
        {
            int next = (i + 1) % radial;
            int b0 = baseIdx + i;
            int b1 = baseIdx + next;
            WriteTri(w, botCenter, b0, b1);
        }

        t.VBase += 2 * radial + 2;
        t.Tris  += 4 * radial;
    }

    static void AppendSphere(TileWriter t, IFormatProvider inv,
        double cx, double cy, double cz, double r, int wSeg, int hSeg,
        double colR, double colG, double colB)
    {
        var w = t.W;
        int baseIdx = t.VBase;
        for (int y = 0; y <= hSeg; y++)
        {
            double v = y / (double)hSeg;
            double phi = v * Math.PI;
            for (int x = 0; x <= wSeg; x++)
            {
                double u = x / (double)wSeg;
                double theta = u * Math.PI * 2;
                double nx = -Math.Cos(theta) * Math.Sin(phi);
                double ny =  Math.Cos(phi);
                double nz =  Math.Sin(theta) * Math.Sin(phi);
                double vx = cx + r * nx, vy = cy + r * ny, vz = cz + r * nz;
                WriteV(w, inv, vx, vy, vz, colR, colG, colB);
                WriteVN(w, inv, nx, ny, nz);
                Bounds(t, vx, vy, vz);
            }
        }
        int stride = wSeg + 1;
        int trisAdded = 0;
        for (int y = 0; y < hSeg; y++)
        for (int x = 0; x < wSeg; x++)
        {
            int a = baseIdx + y * stride + x;
            int b = baseIdx + y * stride + x + 1;
            int c = baseIdx + (y + 1) * stride + x + 1;
            int d = baseIdx + (y + 1) * stride + x;
            if (y != 0)        { WriteTri(w, a, d, b); trisAdded++; }
            if (y != hSeg - 1) { WriteTri(w, b, d, c); trisAdded++; }
        }
        t.VBase += (hSeg + 1) * (wSeg + 1);
        t.Tris  += trisAdded;
    }

    static void WriteV(StreamWriter w, IFormatProvider inv, double x, double y, double z, double r, double g, double b)
    {
        w.Write("v ");
        w.Write(x.ToString("F4", inv)); w.Write(' ');
        w.Write(y.ToString("F4", inv)); w.Write(' ');
        w.Write(z.ToString("F4", inv)); w.Write(' ');
        w.Write(r.ToString("F4", inv)); w.Write(' ');
        w.Write(g.ToString("F4", inv)); w.Write(' ');
        w.WriteLine(b.ToString("F4", inv));
    }
    static void WriteVN(StreamWriter w, IFormatProvider inv, double x, double y, double z)
    {
        double L = Math.Sqrt(x * x + y * y + z * z); if (L < 1e-9) L = 1;
        w.Write("vn ");
        w.Write((x / L).ToString("F5", inv)); w.Write(' ');
        w.Write((y / L).ToString("F5", inv)); w.Write(' ');
        w.WriteLine((z / L).ToString("F5", inv));
    }
    static void WriteTri(StreamWriter w, int a, int b, int c)
    {
        w.Write("f ");
        w.Write(a); w.Write("//"); w.Write(a); w.Write(' ');
        w.Write(b); w.Write("//"); w.Write(b); w.Write(' ');
        w.Write(c); w.Write("//"); w.WriteLine(c);
    }
    static void Bounds(TileWriter t, double x, double y, double z)
    {
        if (x < t.MinX) t.MinX = x; if (x > t.MaxX) t.MaxX = x;
        if (y < t.MinY) t.MinY = y; if (y > t.MaxY) t.MaxY = y;
        if (z < t.MinZ) t.MinZ = z; if (z > t.MaxZ) t.MaxZ = z;
    }
}
