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

var (edgeTable, triTable) = TableLoader.Load(mcFile);
Console.WriteLine($"Loaded edgeTable[{edgeTable.Length}] triTable[{triTable.Length}]");

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
    return (baseH + biome2 * ridged - wy) / 8.0;
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
    var r = MarchingCubes.March(DensityAt, ox, oy, oz, chunkSz, iso, edgeTable, triTable);
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

// ─── Marching cubes (port of src/marching-cubes.ts) ──────────────────────────
static class MarchingCubes
{
    public record Result(List<float> Verts, List<float> Norms, List<float> Cols);

    public static Result March(Func<double, double, double, double> densityFn,
                               int ox, int oy, int oz, int size, double iso,
                               int[] edgeTable, int[][] triTable)
    {
        int N = size + 1;
        var density = new double[N * N * N];
        int Idx(int x, int y, int z) => x * N * N + y * N + z;
        for (int x = 0; x < N; x++)
        for (int y = 0; y < N; y++)
        for (int z = 0; z < N; z++)
            density[Idx(x, y, z)] = densityFn(ox + x, oy + y, oz + z);

        var verts = new List<float>();
        var norms = new List<float>();
        var cols  = new List<float>();
        var edgePts = new (double X, double Y, double Z)[12];
        var hasEdge = new bool[12];

        (double, double, double) EdgeVert(int x0, int y0, int z0, int x1, int y1, int z1)
        {
            double d0 = density[Idx(x0, y0, z0)], d1 = density[Idx(x1, y1, z1)];
            double t = (iso - d0) / (d1 - d0 + 1e-9);
            return (x0 + t * (x1 - x0), y0 + t * (y1 - y0), z0 + t * (z1 - z0));
        }

        for (int x = 0; x < size; x++)
        for (int y = 0; y < size; y++)
        for (int z = 0; z < size; z++)
        {
            double c0 = density[Idx(x,   y,   z  )], c1 = density[Idx(x+1, y,   z  )],
                   c2 = density[Idx(x+1, y,   z+1)], c3 = density[Idx(x,   y,   z+1)],
                   c4 = density[Idx(x,   y+1, z  )], c5 = density[Idx(x+1, y+1, z  )],
                   c6 = density[Idx(x+1, y+1, z+1)], c7 = density[Idx(x,   y+1, z+1)];
            int cubeIdx = 0;
            if (c0 < iso) cubeIdx |= 1;
            if (c1 < iso) cubeIdx |= 2;
            if (c2 < iso) cubeIdx |= 4;
            if (c3 < iso) cubeIdx |= 8;
            if (c4 < iso) cubeIdx |= 16;
            if (c5 < iso) cubeIdx |= 32;
            if (c6 < iso) cubeIdx |= 64;
            if (c7 < iso) cubeIdx |= 128;
            int e = edgeTable[cubeIdx];
            if (e == 0) continue;

            Array.Clear(hasEdge, 0, 12);
            if ((e &    1) != 0) { edgePts[0]  = EdgeVert(x,   y,   z,   x+1, y,   z  ); hasEdge[0]  = true; }
            if ((e &    2) != 0) { edgePts[1]  = EdgeVert(x+1, y,   z,   x+1, y,   z+1); hasEdge[1]  = true; }
            if ((e &    4) != 0) { edgePts[2]  = EdgeVert(x,   y,   z+1, x+1, y,   z+1); hasEdge[2]  = true; }
            if ((e &    8) != 0) { edgePts[3]  = EdgeVert(x,   y,   z,   x,   y,   z+1); hasEdge[3]  = true; }
            if ((e &   16) != 0) { edgePts[4]  = EdgeVert(x,   y+1, z,   x+1, y+1, z  ); hasEdge[4]  = true; }
            if ((e &   32) != 0) { edgePts[5]  = EdgeVert(x+1, y+1, z,   x+1, y+1, z+1); hasEdge[5]  = true; }
            if ((e &   64) != 0) { edgePts[6]  = EdgeVert(x,   y+1, z+1, x+1, y+1, z+1); hasEdge[6]  = true; }
            if ((e &  128) != 0) { edgePts[7]  = EdgeVert(x,   y+1, z,   x,   y+1, z+1); hasEdge[7]  = true; }
            if ((e &  256) != 0) { edgePts[8]  = EdgeVert(x,   y,   z,   x,   y+1, z  ); hasEdge[8]  = true; }
            if ((e &  512) != 0) { edgePts[9]  = EdgeVert(x+1, y,   z,   x+1, y+1, z  ); hasEdge[9]  = true; }
            if ((e & 1024) != 0) { edgePts[10] = EdgeVert(x+1, y,   z+1, x+1, y+1, z+1); hasEdge[10] = true; }
            if ((e & 2048) != 0) { edgePts[11] = EdgeVert(x,   y,   z+1, x,   y+1, z+1); hasEdge[11] = true; }

            int[] tris = triTable[cubeIdx];
            if (tris.Length == 0 || tris[0] == -1)
                tris = triTable[255 - cubeIdx];
            if (tris.Length == 0 || tris[0] == -1) continue;

            for (int t = 0; t + 2 < tris.Length && tris[t] != -1; t += 3)
            {
                int i0 = tris[t], i1 = tris[t + 1], i2 = tris[t + 2];
                if (!hasEdge[i0] || !hasEdge[i1] || !hasEdge[i2]) continue;
                var p0 = edgePts[i0]; var p1 = edgePts[i1]; var p2 = edgePts[i2];

                double ax = p1.X - p0.X, ay = p1.Y - p0.Y, az = p1.Z - p0.Z;
                double bx = p2.X - p0.X, by = p2.Y - p0.Y, bz = p2.Z - p0.Z;
                double nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
                double len = Math.Sqrt(nx * nx + ny * ny + nz * nz) + 1e-9;
                double nxn = nx / len, nyn = ny / len, nzn = nz / len;

                for (int k = 0; k < 3; k++)
                {
                    var pt = k == 0 ? p0 : k == 1 ? p1 : p2;
                    verts.Add((float)(ox + pt.X));
                    verts.Add((float)(oy + pt.Y));
                    verts.Add((float)(oz + pt.Z));
                    norms.Add((float)nxn); norms.Add((float)nyn); norms.Add((float)nzn);

                    double worldY = oy + pt.Y;
                    double slope  = Math.Abs(nyn);
                    const double WATER = 8;
                    double rC, gC, bC;
                    if (worldY < WATER - 1)               { rC = 0.18; gC = 0.28; bC = 0.42; }
                    else if (worldY < WATER + 2.5)        { rC = 0.76; gC = 0.70; bC = 0.50; }
                    else if (worldY > 52 && slope > 0.55) { rC = 0.92; gC = 0.94; bC = 0.98; }
                    else if (worldY > 40 || slope < 0.45)
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
            }
        }
        return new Result(verts, norms, cols);
    }
}

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
