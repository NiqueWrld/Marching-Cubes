using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

// ─── CLI options ─────────────────────────────────────────────────────────────
int radius   = GetIntArg("--radius", 12);
int yMin     = GetIntArg("--y-min", -1);
int yMax     = GetIntArg("--y-max",  3);
int centerX  = GetIntArg("--cx", 0);
int centerZ  = GetIntArg("--cz", 0);
int seed     = GetIntArg("--seed", 12345);
int chunkSz  = GetIntArg("--chunk", 16);
int tileSize = GetIntArg("--tile", 4);   // chunk-columns per tile (NxN)
double iso   = GetDoubleArg("--iso", 0.0);

string repoRoot = FindRepoRoot();
string mcFile   = Path.Combine(repoRoot, "src", "marching-cubes.ts");
string outDir   = GetStringArg("--out-dir", Path.Combine(repoRoot, "public", "world"));
if (Directory.Exists(outDir))
{
    foreach (var f in Directory.EnumerateFiles(outDir, "*.obj")) File.Delete(f);
}
Directory.CreateDirectory(outDir);

Console.WriteLine($"Repo:    {repoRoot}");
Console.WriteLine($"OutDir:  {outDir}");
Console.WriteLine($"Range:   x=[{centerX - radius}..{centerX + radius}] z=[{centerZ - radius}..{centerZ + radius}] y=[{yMin}..{yMax}]");
Console.WriteLine($"Seed={seed} chunk={chunkSz} tile={tileSize} iso={iso}");

var noise = new Noise(seed);

double DensityAt(double wx, double wy, double wz)
{
    double biome  = noise.Octave(wx * 0.004, 0, wz * 0.004, 2, 0.5, 2.0) * 0.5 + 0.5;
    double biome2 = biome * biome;
    double warpX  = noise.Perlin(wx * 0.018 + 3.7, 0, wz * 0.018) * 18;
    double warpZ  = noise.Perlin(wx * 0.018, 0, wz * 0.018 + 1.3) * 18;
    double sx = wx + warpX, sz = wz + warpZ;
    double baseH = noise.Octave(sx * 0.035, 0, sz * 0.035, 5, 0.52, 2.1) * 14 + 13
                 + noise.Octave(sx * 0.007, 0, sz * 0.007, 2, 0.5,  2.0) * 10;
    double r1 = 1.0 - Math.Abs(noise.Perlin(sx * 0.022, 0,   sz * 0.022));
    double r2 = 1.0 - Math.Abs(noise.Perlin(sx * 0.048, 0.5, sz * 0.048));
    double ridged = r1 * r1 * 48 + r2 * r2 * 14;
    double surfH = baseH + biome2 * ridged;

    // Fade terrain height down to below sea level near the world perimeter so
    // the bake region is always bordered by water instead of cliffs.
    const double SEA = 8.0;
    const double EDGE_FLOOR = SEA - 4.0;
    double half = radius * chunkSz;
    double dx = Math.Abs(wx - centerX * chunkSz);
    double dz = Math.Abs(wz - centerZ * chunkSz);
    double d  = Math.Max(dx, dz);
    double fadeStart = half * 0.70;
    double fadeEnd   = half * 0.98;
    double t = Math.Clamp((d - fadeStart) / (fadeEnd - fadeStart), 0.0, 1.0);
    t = t * t * (3 - 2 * t); // smoothstep
    double finalH = surfH * (1 - t) + EDGE_FLOOR * t;

    return (finalH - wy) / 8.0;
}

// ─── Bake whole world into one OBJ ───────────────────────────────────────────
int totalChunks = (2 * radius + 1) * (2 * radius + 1) * (yMax - yMin + 1);
int doneChunks = 0;
long totalTris = 0;
var sw = System.Diagnostics.Stopwatch.StartNew();

var inv = CultureInfo.InvariantCulture;

// One OBJ per tile (tileSize × tileSize chunk columns), with full y-stack inside.
var tileWriters = new Dictionary<(int tx, int tz), TileWriter>();

static int FloorDiv(int a, int b) => (a >= 0) ? a / b : -((-a + b - 1) / b);

for (int cx = centerX - radius; cx <= centerX + radius; cx++)
for (int cz = centerZ - radius; cz <= centerZ + radius; cz++)
for (int cy = yMin; cy <= yMax; cy++)
{
    doneChunks++;
    int ox = cx * chunkSz, oy = cy * chunkSz, oz = cz * chunkSz;
    var r = SurfaceNets.March(DensityAt, ox, oy, oz, chunkSz, iso);
    if (r.Verts.Count == 0) { Progress(); continue; }

    int triCount = r.Verts.Count / 9;
    totalTris += triCount;

    int tx = FloorDiv(cx, tileSize);
    int tz = FloorDiv(cz, tileSize);
    var key = (tx, tz);
    if (!tileWriters.TryGetValue(key, out var t))
    {
        t = new TileWriter(outDir, tx, tz);
        tileWriters[key] = t;
    }
    var w = t.W;

    for (int i = 0; i < r.Verts.Count; i += 3)
    {
        double vx = r.Verts[i], vy = r.Verts[i + 1], vz = r.Verts[i + 2];
        if (vx < t.MinX) t.MinX = vx; if (vx > t.MaxX) t.MaxX = vx;
        if (vy < t.MinY) t.MinY = vy; if (vy > t.MaxY) t.MaxY = vy;
        if (vz < t.MinZ) t.MinZ = vz; if (vz > t.MaxZ) t.MaxZ = vz;
        w.Write("v ");
        w.Write(vx.ToString("F4", inv)); w.Write(' ');
        w.Write(vy.ToString("F4", inv)); w.Write(' ');
        w.Write(vz.ToString("F4", inv)); w.Write(' ');
        w.Write(r.Cols[i    ].ToString("F4", inv)); w.Write(' ');
        w.Write(r.Cols[i + 1].ToString("F4", inv)); w.Write(' ');
        w.WriteLine(r.Cols[i + 2].ToString("F4", inv));
    }

    for (int i = 0; i < r.Norms.Count; i += 3)
    {
        w.Write("vn ");
        w.Write(r.Norms[i    ].ToString("F5", inv)); w.Write(' ');
        w.Write(r.Norms[i + 1].ToString("F5", inv)); w.Write(' ');
        w.WriteLine(r.Norms[i + 2].ToString("F5", inv));
    }

    int vCount = r.Verts.Count / 3;
    for (int i = 0; i < vCount; i += 3)
    {
        int a = t.VBase + i, b = a + 1, c = a + 2;
        w.Write("f "); w.Write(a); w.Write("//"); w.Write(a); w.Write(' ');
        w.Write(b);    w.Write("//"); w.Write(b); w.Write(' ');
        w.Write(c);    w.Write("//"); w.WriteLine(c);
    }
    t.VBase += vCount;
    t.Tris  += triCount;

    Progress();
}

// Flush and build manifest.
var manifest = new StringBuilder();
manifest.AppendLine("{");
manifest.AppendLine($"  \"seed\": {seed}, \"chunk\": {chunkSz}, \"tile\": {tileSize},");
manifest.AppendLine("  \"tiles\": [");
bool first = true;
long totalBytes = 0;
foreach (var (key, t) in tileWriters)
{
    t.W.Flush();
    long len = t.Fs.Length;
    totalBytes += len;
    t.W.Dispose();
    t.Fs.Dispose();
    string name = $"tile_{key.tx}_{key.tz}.obj";
    if (!first) manifest.AppendLine(",");
    first = false;
    manifest.Append($"    {{ \"file\": \"{name}\", \"tx\": {key.tx}, \"tz\": {key.tz}, \"bytes\": {len}, \"tris\": {t.Tris}, ");
    manifest.Append($"\"bbox\": [{t.MinX.ToString("F2", inv)}, {t.MinY.ToString("F2", inv)}, {t.MinZ.ToString("F2", inv)}, {t.MaxX.ToString("F2", inv)}, {t.MaxY.ToString("F2", inv)}, {t.MaxZ.ToString("F2", inv)}] }}");
}
manifest.AppendLine();
manifest.AppendLine("  ]");
manifest.AppendLine("}");
File.WriteAllText(Path.Combine(outDir, "manifest.json"), manifest.ToString());

sw.Stop();
Console.WriteLine();
Console.WriteLine($"Done. chunks={doneChunks} tiles={tileWriters.Count} triangles={totalTris:N0} bytes={totalBytes:N0} in {sw.Elapsed.TotalSeconds:F1}s");

void Progress()
{
    if (doneChunks % 16 == 0 || doneChunks == totalChunks)
        Console.Write($"\r  {doneChunks}/{totalChunks}  tris={totalTris:N0}   ");
}

// ─── Args ────────────────────────────────────────────────────────────────────
int GetIntArg(string n, int d)    { var v = GetRaw(n); return v is null ? d : int.Parse(v, CultureInfo.InvariantCulture); }
double GetDoubleArg(string n, double d) { var v = GetRaw(n); return v is null ? d : double.Parse(v, CultureInfo.InvariantCulture); }
string GetStringArg(string n, string d) => GetRaw(n) ?? d;
string? GetRaw(string n) { int i = Array.IndexOf(args, n); return (i >= 0 && i + 1 < args.Length) ? args[i + 1] : null; }
static string FindRepoRoot()
{
    var d = new DirectoryInfo(AppContext.BaseDirectory);
    while (d is not null && !File.Exists(Path.Combine(d.FullName, "package.json"))) d = d.Parent;
    return d?.FullName ?? Directory.GetCurrentDirectory();
}

// ─── Noise (port of src/noise.js) ────────────────────────────────────────────
class TileWriter
{
    public StreamWriter W;
    public FileStream Fs;
    public int VBase = 1;
    public long Tris = 0;
    public double MinX = double.PositiveInfinity, MaxX = double.NegativeInfinity;
    public double MinY = double.PositiveInfinity, MaxY = double.NegativeInfinity;
    public double MinZ = double.PositiveInfinity, MaxZ = double.NegativeInfinity;
    public TileWriter(string outDir, int tx, int tz)
    {
        string path = Path.Combine(outDir, $"tile_{tx}_{tz}.obj");
        Fs = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.Read, 1 << 20);
        W  = new StreamWriter(Fs) { NewLine = "\n" };
        W.WriteLine($"# Baked tile tx={tx} tz={tz}");
        W.WriteLine($"o Tile_{tx}_{tz}");
    }
}

class Noise
{
    readonly byte[] p = new byte[512];
    public Noise(int seed)
    {
        var b = new byte[256];
        for (int i = 0; i < 256; i++) b[i] = (byte)i;
        uint s = (uint)seed;
        for (int i = 255; i > 0; i--)
        {
            s = unchecked(s * 1664525u + 1013904223u);
            int j = (int)(s % (uint)(i + 1));
            (b[i], b[j]) = (b[j], b[i]);
        }
        for (int i = 0; i < 512; i++) p[i] = b[i & 255];
    }
    static double Fade(double t) => t * t * t * (t * (t * 6 - 15) + 10);
    static double Lerp(double a, double b, double t) => a + t * (b - a);
    static double Grad(int hash, double x, double y, double z)
    {
        int h = hash & 15;
        double u = h < 8 ? x : y;
        double v = h < 4 ? y : (h == 12 || h == 14 ? x : z);
        return (((h & 1) != 0) ? -u : u) + (((h & 2) != 0) ? -v : v);
    }
    public double Perlin(double x, double y, double z)
    {
        int X = (int)Math.Floor(x) & 255, Y = (int)Math.Floor(y) & 255, Z = (int)Math.Floor(z) & 255;
        x -= Math.Floor(x); y -= Math.Floor(y); z -= Math.Floor(z);
        double u = Fade(x), v = Fade(y), w = Fade(z);
        int A  = p[X]   + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
        int B  = p[X+1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
        return Lerp(
            Lerp(Lerp(Grad(p[AA],   x,   y,   z),   Grad(p[BA],   x-1, y,   z),   u),
                 Lerp(Grad(p[AB],   x,   y-1, z),   Grad(p[BB],   x-1, y-1, z),   u), v),
            Lerp(Lerp(Grad(p[AA+1], x,   y,   z-1), Grad(p[BA+1], x-1, y,   z-1), u),
                 Lerp(Grad(p[AB+1], x,   y-1, z-1), Grad(p[BB+1], x-1, y-1, z-1), u), v), w);
    }
    public double Octave(double x, double y, double z, int octs, double persistence, double lacunarity)
    {
        double val = 0, amp = 1, freq = 1, max = 0;
        for (int i = 0; i < octs; i++)
        {
            val += Perlin(x * freq, y * freq, z * freq) * amp;
            max += amp; amp *= persistence; freq *= lacunarity;
        }
        return val / max;
    }
}

// ─── Surface Nets (watertight; replaces marching cubes) ─────────────────────
static class SurfaceNets
{
    public record Result(List<float> Verts, List<float> Norms, List<float> Cols);

    public static Result March(Func<double, double, double, double> densityFn,
                               int ox, int oy, int oz, int size, double iso)
    {
        // Sample density on (size+2)^3 grid so we have one cell of overlap on the
        // +X/+Y/+Z side — this lets the quad loop emit the boundary quads that
        // would otherwise leave a 1-voxel gap between chunks.
        int N = size + 2;
        var density = new double[N * N * N];
        int Idx(int x, int y, int z) => (x * N + y) * N + z;
        for (int x = 0; x < N; x++)
        for (int y = 0; y < N; y++)
        for (int z = 0; z < N; z++)
            density[Idx(x, y, z)] = densityFn(ox + x, oy + y, oz + z);

        // Vertex grid covers (size+1)^3 cells (cell i uses density corners i..i+1).
        int VS = size + 1;
        int CellIdx(int x, int y, int z) => (x * VS + y) * VS + z;
        var vIdx  = new int[VS * VS * VS];
        var vPosX = new float[VS * VS * VS];
        var vPosY = new float[VS * VS * VS];
        var vPosZ = new float[VS * VS * VS];
        var vNrmX = new float[VS * VS * VS];
        var vNrmY = new float[VS * VS * VS];
        var vNrmZ = new float[VS * VS * VS];
        for (int i = 0; i < vIdx.Length; i++) vIdx[i] = -1;

        var verts = new List<float>();
        var norms = new List<float>();
        var cols  = new List<float>();

        for (int x = 0; x < VS; x++)
        for (int y = 0; y < VS; y++)
        for (int z = 0; z < VS; z++)
        {
            double d000 = density[Idx(x,   y,   z  )], d100 = density[Idx(x+1, y,   z  )],
                   d010 = density[Idx(x,   y+1, z  )], d110 = density[Idx(x+1, y+1, z  )],
                   d001 = density[Idx(x,   y,   z+1)], d101 = density[Idx(x+1, y,   z+1)],
                   d011 = density[Idx(x,   y+1, z+1)], d111 = density[Idx(x+1, y+1, z+1)];

            int solid = 0;
            if (d000 > iso) solid++;
            if (d100 > iso) solid++;
            if (d010 > iso) solid++;
            if (d110 > iso) solid++;
            if (d001 > iso) solid++;
            if (d101 > iso) solid++;
            if (d011 > iso) solid++;
            if (d111 > iso) solid++;
            if (solid == 0 || solid == 8) continue;

            // Average edge-crossing points → cell vertex.
            double sx = 0, sy = 0, sz = 0;
            int crossings = 0;
            // 4 X-axis edges
            if ((d000 > iso) != (d100 > iso)) { double t = (iso - d000) / (d100 - d000); sx += t; sy += 0; sz += 0; crossings++; }
            if ((d010 > iso) != (d110 > iso)) { double t = (iso - d010) / (d110 - d010); sx += t; sy += 1; sz += 0; crossings++; }
            if ((d001 > iso) != (d101 > iso)) { double t = (iso - d001) / (d101 - d001); sx += t; sy += 0; sz += 1; crossings++; }
            if ((d011 > iso) != (d111 > iso)) { double t = (iso - d011) / (d111 - d011); sx += t; sy += 1; sz += 1; crossings++; }
            // 4 Y-axis edges
            if ((d000 > iso) != (d010 > iso)) { double t = (iso - d000) / (d010 - d000); sx += 0; sy += t; sz += 0; crossings++; }
            if ((d100 > iso) != (d110 > iso)) { double t = (iso - d100) / (d110 - d100); sx += 1; sy += t; sz += 0; crossings++; }
            if ((d001 > iso) != (d011 > iso)) { double t = (iso - d001) / (d011 - d001); sx += 0; sy += t; sz += 1; crossings++; }
            if ((d101 > iso) != (d111 > iso)) { double t = (iso - d101) / (d111 - d101); sx += 1; sy += t; sz += 1; crossings++; }
            // 4 Z-axis edges
            if ((d000 > iso) != (d001 > iso)) { double t = (iso - d000) / (d001 - d000); sx += 0; sy += 0; sz += t; crossings++; }
            if ((d100 > iso) != (d101 > iso)) { double t = (iso - d100) / (d101 - d100); sx += 1; sy += 0; sz += t; crossings++; }
            if ((d010 > iso) != (d011 > iso)) { double t = (iso - d010) / (d011 - d010); sx += 0; sy += 1; sz += t; crossings++; }
            if ((d110 > iso) != (d111 > iso)) { double t = (iso - d110) / (d111 - d110); sx += 1; sy += 1; sz += t; crossings++; }

            double cx = crossings > 0 ? sx / crossings : 0.5;
            double cy = crossings > 0 ? sy / crossings : 0.5;
            double cz = crossings > 0 ? sz / crossings : 0.5;
            int ci = CellIdx(x, y, z);
            vPosX[ci] = (float)(x + cx);
            vPosY[ci] = (float)(y + cy);
            vPosZ[ci] = (float)(z + cz);
            vIdx[ci]  = 0;
        }

        // Laplacian smoothing — average each active cell with its 6 active neighbours.
        for (int pass = 0; pass < 2; pass++)
        {
            var tX = (float[])vPosX.Clone();
            var tY = (float[])vPosY.Clone();
            var tZ = (float[])vPosZ.Clone();
            for (int x = 1; x < VS - 1; x++)
            for (int y = 1; y < VS - 1; y++)
            for (int z = 1; z < VS - 1; z++)
            {
                int ci = CellIdx(x, y, z);
                if (vIdx[ci] < 0) continue;
                double nx = 0, ny = 0, nz = 0; int n = 0;
                void Add(int dx, int dy, int dz)
                {
                    int ni = CellIdx(x + dx, y + dy, z + dz);
                    if (vIdx[ni] >= 0) { nx += vPosX[ni]; ny += vPosY[ni]; nz += vPosZ[ni]; n++; }
                }
                Add(-1,0,0); Add(1,0,0); Add(0,-1,0); Add(0,1,0); Add(0,0,-1); Add(0,0,1);
                if (n > 0)
                {
                    tX[ci] = (float)((vPosX[ci] + nx / n) * 0.5);
                    tY[ci] = (float)((vPosY[ci] + ny / n) * 0.5);
                    tZ[ci] = (float)((vPosZ[ci] + nz / n) * 0.5);
                }
            }
            Array.Copy(tX, vPosX, tX.Length);
            Array.Copy(tY, vPosY, tY.Length);
            Array.Copy(tZ, vPosZ, tZ.Length);
        }

        // Per-vertex smooth normals from the density gradient at the vertex position.
        // densityFn is cheap to re-sample; gradient = ∇density, normal = -∇density
        // (density>iso = inside, so the surface normal points down-gradient).
        const double H = 0.4;
        for (int i = 0; i < vIdx.Length; i++)
        {
            if (vIdx[i] < 0) continue;
            double wx = ox + vPosX[i], wy = oy + vPosY[i], wz = oz + vPosZ[i];
            double gx = densityFn(wx + H, wy, wz) - densityFn(wx - H, wy, wz);
            double gy = densityFn(wx, wy + H, wz) - densityFn(wx, wy - H, wz);
            double gz = densityFn(wx, wy, wz + H) - densityFn(wx, wy, wz - H);
            double len = Math.Sqrt(gx * gx + gy * gy + gz * gz) + 1e-9;
            vNrmX[i] = (float)(-gx / len);
            vNrmY[i] = (float)(-gy / len);
            vNrmZ[i] = (float)(-gz / len);
        }

        // Emit non-indexed triangles (matches existing OBJ pipeline). Per-vertex
        // smooth normals + per-vertex colour.
        void Push(int vi)
        {
            double wx = ox + vPosX[vi], wy = oy + vPosY[vi], wz = oz + vPosZ[vi];
            verts.Add((float)wx); verts.Add((float)wy); verts.Add((float)wz);
            float nx = vNrmX[vi], ny = vNrmY[vi], nz = vNrmZ[vi];
            norms.Add(nx); norms.Add(ny); norms.Add(nz);
            double slope = Math.Abs(ny);
            const double WATER = 8;
            double rC, gC, bC;
            if (wy < WATER - 1)               { rC = 0.18; gC = 0.28; bC = 0.42; }
            else if (wy < WATER + 2.5)        { rC = 0.76; gC = 0.70; bC = 0.50; }
            else if (wy > 52 && slope > 0.55) { rC = 0.92; gC = 0.94; bC = 0.98; }
            else if (wy > 40 || slope < 0.45)
            {
                double shade = 0.38 + slope * 0.18;
                rC = shade + 0.04; gC = shade; bC = shade - 0.04;
            }
            else if (slope > 0.72)
            {
                rC = 0.22 + slope * 0.06; gC = 0.50 + slope * 0.10; bC = 0.18;
            }
            else
            {
                double tt = (slope - 0.45) / 0.27;
                double shade = 0.42;
                rC = shade * (1 - tt) + 0.24 * tt;
                gC = shade * (1 - tt) + 0.52 * tt;
                bC = (shade - 0.04) * (1 - tt) + 0.18 * tt;
            }
            cols.Add((float)rC); cols.Add((float)gC); cols.Add((float)bC);
        }
        void Quad(int a, int b, int c, int d, bool flip)
        {
            if (flip) { Push(a); Push(c); Push(b); Push(a); Push(d); Push(c); }
            else      { Push(a); Push(b); Push(c); Push(a); Push(c); Push(d); }
        }

        // Quad-emit loop: corner (x,y,z) for x,y,z in 1..VS-1 = 1..size. Cell
        // indices used span [x-1..x] which stays inside [0..size] = [0..VS-1].
        for (int x = 1; x < VS; x++)
        for (int y = 1; y < VS; y++)
        for (int z = 1; z < VS; z++)
        {
            double dC = density[Idx(x, y, z)];

            if ((dC > iso) != (density[Idx(x - 1, y, z)] > iso))
            {
                int v1 = CellIdx(x - 1, y, z);
                int v2 = CellIdx(x - 1, y - 1, z);
                int v3 = CellIdx(x - 1, y - 1, z - 1);
                int v4 = CellIdx(x - 1, y, z - 1);
                if (vIdx[v1] >= 0 && vIdx[v2] >= 0 && vIdx[v3] >= 0 && vIdx[v4] >= 0)
                    Quad(v1, v2, v3, v4, dC > iso);
            }
            if ((dC > iso) != (density[Idx(x, y - 1, z)] > iso))
            {
                int v1 = CellIdx(x, y - 1, z);
                int v2 = CellIdx(x, y - 1, z - 1);
                int v3 = CellIdx(x - 1, y - 1, z - 1);
                int v4 = CellIdx(x - 1, y - 1, z);
                if (vIdx[v1] >= 0 && vIdx[v2] >= 0 && vIdx[v3] >= 0 && vIdx[v4] >= 0)
                    Quad(v1, v2, v3, v4, dC > iso);
            }
            if ((dC > iso) != (density[Idx(x, y, z - 1)] > iso))
            {
                int v1 = CellIdx(x, y, z - 1);
                int v2 = CellIdx(x - 1, y, z - 1);
                int v3 = CellIdx(x - 1, y - 1, z - 1);
                int v4 = CellIdx(x, y - 1, z - 1);
                if (vIdx[v1] >= 0 && vIdx[v2] >= 0 && vIdx[v3] >= 0 && vIdx[v4] >= 0)
                    Quad(v1, v2, v3, v4, dC > iso);
            }
        }
        return new Result(verts, norms, cols);
    }
}

// ─── Old MC implementation removed (replaced by SurfaceNets above) ──────────

// ─── Parse edgeTable and triTable straight out of marching-cubes.ts ─────────
static class TableLoader
{
    public static (int[] edge, int[][] tri) Load(string tsFile)
    {
        if (!File.Exists(tsFile))
            throw new FileNotFoundException("Cannot find marching-cubes.ts", tsFile);
        string src = File.ReadAllText(tsFile);

        var edgeMatch = Regex.Match(src, @"edgeTable\s*=\s*new\s+Int32Array\s*\(\s*\[([\s\S]*?)\]\s*\)");
        if (!edgeMatch.Success) throw new InvalidDataException("edgeTable not found");
        int[] edge = ParseIntList(edgeMatch.Groups[1].Value);
        if (edge.Length != 256) throw new InvalidDataException($"edgeTable has {edge.Length} entries");

        var triMatch = Regex.Match(src, @"triTable\s*:\s*number\[\]\[\]\s*=\s*\[([\s\S]*?)\n\];");
        if (!triMatch.Success) throw new InvalidDataException("triTable not found");
        string body = triMatch.Groups[1].Value;
        var rows = Regex.Matches(body, @"\[([^\]]*)\]");
        // The TS source ships only the lower half (128 entries); the meshing code
        // mirrors the upper half via triTable[255 - cubeIdx]. Pad with empty rows
        // so direct indexing is still safe — March() falls back to the mirror.
        var tri = new int[256][];
        for (int i = 0; i < 256; i++)
        {
            tri[i] = i < rows.Count
                ? ParseIntList(rows[i].Groups[1].Value)
                : new[] { -1 };
        }
        if (rows.Count != 128 && rows.Count != 256)
            throw new InvalidDataException($"triTable has {rows.Count} entries (expected 128 or 256)");
        return (edge, tri);
    }

    static int[] ParseIntList(string s)
    {
        var list = new List<int>();
        foreach (var tok in s.Split(new[] { ',', ' ', '\t', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
        {
            string t = tok.Trim();
            if (t.Length == 0) continue;
            if (t.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
                list.Add(int.Parse(t.AsSpan(2), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
            else
                list.Add(int.Parse(t, CultureInfo.InvariantCulture));
        }
        return list.ToArray();
    }
}
