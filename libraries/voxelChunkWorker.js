let state = {
  params: null,
  chunkSize: 16,
  voxelChunkHeight: 128,
  voxelLayerSize: 256,
  voxelChunkVolume: 32768,
  seedHash: 0,
  floatingLayout: null,
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function hashSeed(seed) {
  let h = 2166136261 >>> 0;
  const s = String(seed || "default-seed");
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function randomFromInt2DWithSeed(x, z, seedHash) {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ (seedHash | 0);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return (n & 0x7fffffff) / 0x7fffffff;
}

function randomFromInt3DWithSeed(x, y, z, seedHash) {
  let n = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 1442695041) ^ Math.imul(z | 0, 668265263) ^ (seedHash | 0)) >>> 0;
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return (n & 0x7fffffff) / 0x7fffffff;
}

function smoothstep(t) {
  return t * t * (3 - (2 * t));
}

function lerp(a, b, t) {
  return a + ((b - a) * t);
}

function valueNoise2D(x, z, seedHash) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const x1 = x0 + 1;
  const z1 = z0 + 1;
  const sx = smoothstep(x - x0);
  const sz = smoothstep(z - z0);
  const n00 = randomFromInt2DWithSeed(x0, z0, seedHash);
  const n10 = randomFromInt2DWithSeed(x1, z0, seedHash);
  const n01 = randomFromInt2DWithSeed(x0, z1, seedHash);
  const n11 = randomFromInt2DWithSeed(x1, z1, seedHash);
  const ix0 = lerp(n00, n10, sx);
  const ix1 = lerp(n01, n11, sx);
  return (lerp(ix0, ix1, sz) * 2.0) - 1.0;
}

function valueNoise3D(x, y, z, seedHash) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const z1 = z0 + 1;
  const sx = smoothstep(x - x0);
  const sy = smoothstep(y - y0);
  const sz = smoothstep(z - z0);
  const c000 = randomFromInt3DWithSeed(x0, y0, z0, seedHash);
  const c100 = randomFromInt3DWithSeed(x1, y0, z0, seedHash);
  const c010 = randomFromInt3DWithSeed(x0, y1, z0, seedHash);
  const c110 = randomFromInt3DWithSeed(x1, y1, z0, seedHash);
  const c001 = randomFromInt3DWithSeed(x0, y0, z1, seedHash);
  const c101 = randomFromInt3DWithSeed(x1, y0, z1, seedHash);
  const c011 = randomFromInt3DWithSeed(x0, y1, z1, seedHash);
  const c111 = randomFromInt3DWithSeed(x1, y1, z1, seedHash);
  const ix00 = lerp(c000, c100, sx);
  const ix10 = lerp(c010, c110, sx);
  const ix01 = lerp(c001, c101, sx);
  const ix11 = lerp(c011, c111, sx);
  const iy0 = lerp(ix00, ix10, sy);
  const iy1 = lerp(ix01, ix11, sy);
  return (lerp(iy0, iy1, sz) * 2.0) - 1.0;
}

function buildFloatingLayout(params) {
  if ((params?.worldStyle || "") !== "floating_hub_islands") return null;
  const hubHalfSize = Math.max(14, Math.round(params.hubRadius || 28));
  const islandHalfSize = Math.max(12, Math.round((params.islandRadiusMax || 16) * 0.95));
  const ringDistance = Math.max(Math.round(params.ringRadius || 72), hubHalfSize + islandHalfSize + 8);
  const flatHeight = Math.round(params.hubHeight || 58);
  return {
    hubHeight: flatHeight,
    hubHalfSize,
    islands: [
      { id: 0, x: 0, z: ringDistance, halfSize: islandHalfSize, height: flatHeight, biome: "fire" },
      { id: 1, x: 0, z: -ringDistance, halfSize: islandHalfSize, height: flatHeight, biome: "earth" },
      { id: 2, x: ringDistance, z: 0, halfSize: islandHalfSize, height: flatHeight, biome: "wind" },
      { id: 3, x: -ringDistance, z: 0, halfSize: islandHalfSize, height: flatHeight, biome: "grass" },
    ],
  };
}

function sampleFloatingColumn(wx, wz) {
  const layout = state.floatingLayout;
  if (!layout) return { height: null, zone: "void", biome: "void" };
  if (Math.abs(wx) <= layout.hubHalfSize && Math.abs(wz) <= layout.hubHalfSize) return { height: layout.hubHeight, zone: "hub", biome: "stone" };
  for (const island of layout.islands) {
    const dx = wx - island.x;
    const dz = wz - island.z;
    if (Math.abs(dx) <= island.halfSize && Math.abs(dz) <= island.halfSize) return { height: island.height, zone: "island", biome: island.biome };
  }
  return { height: null, zone: "void", biome: "void" };
}

function sampleFixedColumn(wx, wz) {
  const params = state.params || {};
  const layout = (params.biomeLayout || "").toString().toLowerCase();
  let biomeKey = "";
  let baseHeight = Number(params.hubHeight || params.baseHeight || 58);
  let amp = Math.max(0, Number(params.fixedNoiseAmplitude ?? 2.2));
  let scale = Math.max(0.001, Number(params.fixedNoiseScale ?? 0.06));
  let octaves = Math.max(1, Math.min(4, Math.round(Number(params.fixedNoiseOctaves ?? 2))));
  let roughnessMul = 1.0;
  if (layout === "quadrants") {
    const qb = (params.quadrantBiomes && typeof params.quadrantBiomes === "object") ? params.quadrantBiomes : null;
    const qKey = (wx >= 0 && wz >= 0) ? "xp_zp" : ((wx < 0 && wz >= 0) ? "xn_zp" : ((wx < 0 && wz < 0) ? "xn_zn" : "xp_zn"));
    biomeKey = (qb?.[qKey] || "").toString().toLowerCase();
    if (!biomeKey) biomeKey = (wx >= 0 && wz >= 0) ? "fire" : (wx < 0 && wz >= 0) ? "grass" : (wx < 0 && wz < 0) ? "earth" : "wind";
    baseHeight = Number(params.surfaceHeight ?? params.baseHeight ?? 64);
    amp = Math.max(0, Number(params.mountainAmplitude ?? params.fixedNoiseAmplitude ?? 20));
    scale = Math.max(0.001, Number(params.mountainNoiseScale ?? params.fixedNoiseScale ?? 0.02));
  } else {
    const cells = params.terrainCells || null;
    if (!cells) return { height: null, zone: "void", biome: "void" };
    const biome = cells[`${wx},${wz}`];
    if (!biome) return { height: null, zone: "void", biome: "void" };
    biomeKey = biome.toString().toLowerCase();
    const hubRough = Math.max(0, Math.min(1, Number(params.fixedHubRoughness ?? 0.35)));
    const bridgeRough = Math.max(0, Math.min(1, Number(params.fixedBridgeRoughness ?? 0.18)));
    if (biomeKey === "stone") roughnessMul = hubRough;
    else if (biomeKey === "bridge") roughnessMul = bridgeRough;
  }
  let noise = 0;
  let weight = 0;
  let freq = 1;
  let ampMul = 1;
  for (let i = 0; i < octaves; i += 1) {
    const n = valueNoise2D(wx * scale * freq, wz * scale * freq, state.seedHash);
    noise += n * ampMul;
    weight += ampMul;
    freq *= 2.07;
    ampMul *= 0.5;
  }
  const normalized = weight > 0 ? (noise / weight) : 0;
  const biomeYOffset = ((biomeKey === "fire") ? 0.9 : 0.0) + ((biomeKey === "wind") ? 0.55 : 0.0) - ((biomeKey === "earth") ? 0.45 : 0.0);
  const maxY = Math.max(7, Math.round(Number(state.params?.voxelWorldHeight ?? 128)) - 1);
  const finalHeight = Math.max(0, Math.min(maxY, baseHeight + biomeYOffset + (normalized * amp * roughnessMul)));
  return { height: Math.round(finalHeight), zone: (layout === "quadrants") ? "quadrant" : (biomeKey === "stone" ? "hub" : "island"), biome: biomeKey };
}

function sampleHeight(wx, wz) {
  const worldStyle = (state.params?.worldStyle || "").toLowerCase();
  if (worldStyle === "fixed_biome_grid") return sampleFixedColumn(wx, wz).height;
  if (worldStyle === "floating_hub_islands") return sampleFloatingColumn(wx, wz).height;
  const scale = Number(state.params?.noiseScale ?? 0.11);
  const nx = wx * scale;
  const nz = wz * scale;
  const h1 = valueNoise2D(nx, nz, state.seedHash);
  const h2 = valueNoise2D(nx * 2.1, nz * 2.1, state.seedHash) * 0.5;
  const h3 = valueNoise2D(nx * 4.3, nz * 4.3, state.seedHash) * 0.25;
  const n = (h1 + h2 + h3) / 1.75;
  const h = Number(state.params?.baseHeight ?? 52) + (n * Number(state.params?.heightVariation ?? 14));
  return Math.round(Math.max(2, h));
}

function pickWeightedBlock(worldSeed, x, z, salt, entries, fallback) {
  let total = 0;
  const valid = [];
  for (const row of entries || []) {
    const bid = Math.max(1, Number(row?.[0]) | 0);
    const w = Number(row?.[1]);
    if (!Number.isFinite(w) || w <= 0) continue;
    valid.push([bid, w]);
    total += w;
  }
  if (!valid.length || total <= 0) return Math.max(1, Number(fallback) | 0);
  const seed = hashSeed(`${worldSeed}:${salt}`);
  const jitter = hashSeed(salt) & 0xffff;
  const r = randomFromInt2DWithSeed((x | 0) + jitter, (z | 0) - jitter, seed);
  let t = clamp(r, 0, 0.999999) * total;
  let acc = 0;
  for (const [bid, w] of valid) {
    acc += w;
    if (t <= acc) return bid;
  }
  return valid[valid.length - 1][0];
}

function columnSlopeHint(wx, wz, topY) {
  const hpx = sampleFixedColumn((wx | 0) + 1, wz | 0).height;
  const hnx = sampleFixedColumn((wx | 0) - 1, wz | 0).height;
  const hpz = sampleFixedColumn(wx | 0, (wz | 0) + 1).height;
  const hnz = sampleFixedColumn(wx | 0, (wz | 0) - 1).height;
  const y = topY | 0;
  return Math.max(Math.abs((hpx | 0) - y), Math.abs((hnx | 0) - y), Math.abs((hpz | 0) - y), Math.abs((hnz | 0) - y));
}

function defaultSurfaceBlockId(worldSeed, biome, x, z, slopeHint) {
  const b = (biome || "").toString().toLowerCase();
  const slope = Math.max(0, Number(slopeHint) || 0);
  const slopeBin = slope < 1.0 ? 0 : (slope < 2.5 ? 1 : 2);
  const byBiome = {
    grass: [[2, 3.0], [1, 2.2], [3, 1.6], [16, 1.0], [17, 0.8], [19, 0.6], [20, 0.35]],
    earth: [[16, 2.8], [18, 2.0], [17, 1.8], [3, 1.2], [1, 0.8], [19, 0.7], [20, 0.35]],
    stone: [[5, 2.6], [6, 2.2], [8, 1.5], [7, 1.2], [3, 0.8], [19, 0.45], [20, 0.3]],
    fire: [[4, 2.5], [3, 1.9], [8, 1.8], [6, 1.3], [14, 0.9], [19, 0.5], [20, 0.4]],
    wind: [[9, 2.1], [10, 1.8], [11, 1.5], [12, 1.2], [1, 0.7], [19, 0.55], [20, 0.35]],
    bridge: [[13, 2.5], [14, 2.2], [15, 1.7], [10, 1.0], [11, 0.8], [19, 0.45], [20, 0.35]],
  };
  const base = byBiome[b] || byBiome.grass;
  const adjusted = base.map(([bid, w]) => {
    let ww = Number(w);
    if (slopeBin === 1) {
      if ([5, 6, 7, 8, 11, 12, 13, 14, 15].includes(bid)) ww *= 1.35;
      if ([2, 16, 18].includes(bid)) ww *= 0.78;
      if (bid === 19) ww *= 1.2;
    } else if (slopeBin === 2) {
      if ([5, 6, 7, 8, 11, 12, 13, 14, 15].includes(bid)) ww *= 1.8;
      if ([1, 2, 16, 17, 18].includes(bid)) ww *= 0.5;
      if (bid === 19) ww *= 1.45;
    }
    return [bid, ww];
  });
  return pickWeightedBlock(worldSeed, x, z, `surface:${b}:s${slopeBin}`, adjusted, 2);
}

function defaultSubsoilBlockId(worldSeed, biome, x, y, z) {
  const b = (biome || "").toString().toLowerCase();
  const byBiome = {
    grass: [[16, 2.6], [17, 1.8], [18, 1.6], [3, 1.1], [19, 0.5]],
    earth: [[16, 2.7], [18, 2.1], [17, 1.6], [3, 1.0], [19, 0.5]],
    stone: [[6, 2.2], [5, 1.7], [7, 1.5], [8, 1.2], [19, 0.4]],
    fire: [[6, 2.0], [8, 1.9], [4, 1.3], [3, 1.2], [19, 0.55]],
    wind: [[11, 1.8], [12, 1.7], [9, 1.4], [10, 1.2], [19, 0.5]],
    bridge: [[13, 2.1], [14, 1.9], [15, 1.4], [11, 1.0], [19, 0.5]],
  };
  return pickWeightedBlock(worldSeed, (x | 0) + ((y | 0) * 11), (z | 0) - ((y | 0) * 7), `subsoil:${b}`, byBiome[b] || byBiome.grass, 16);
}

function defaultDeepBlockId(worldSeed, biome, x, y, z) {
  const b = (biome || "").toString().toLowerCase();
  const byBiome = {
    grass: [[6, 2.8], [7, 2.1], [5, 1.8], [8, 1.2], [17, 0.6], [20, 0.25]],
    earth: [[6, 2.7], [7, 2.2], [5, 1.7], [8, 1.3], [18, 0.55], [20, 0.25]],
    stone: [[7, 2.9], [6, 2.3], [5, 1.7], [8, 1.3], [12, 0.45], [20, 0.25]],
    fire: [[8, 2.4], [6, 2.1], [7, 1.8], [4, 1.2], [14, 0.6], [20, 0.35]],
    wind: [[12, 2.1], [11, 2.0], [6, 1.5], [7, 1.2], [9, 0.8], [20, 0.25]],
    bridge: [[14, 2.2], [13, 2.0], [15, 1.5], [11, 1.0], [7, 0.8], [20, 0.25]],
  };
  return pickWeightedBlock(worldSeed, (x | 0) + ((y | 0) * 17), (z | 0) - ((y | 0) * 13), `deep:${b}`, byBiome[b] || byBiome.grass, 6);
}

function dist2PointSegment3D(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax; const aby = by - ay; const abz = bz - az;
  const apx = px - ax; const apy = py - ay; const apz = pz - az;
  const ab2 = (abx * abx) + (aby * aby) + (abz * abz);
  if (ab2 <= 1e-9) return (apx * apx) + (apy * apy) + (apz * apz);
  let t = ((apx * abx) + (apy * aby) + (apz * abz)) / ab2;
  t = clamp(t, 0, 1);
  const qx = ax + (abx * t); const qy = ay + (aby * t); const qz = az + (abz * t);
  const dx = px - qx; const dy = py - qy; const dz = pz - qz;
  return (dx * dx) + (dy * dy) + (dz * dz);
}

function shouldCarveWormAt(worldSeed, x, y, z, topY) {
  if (Number(state.params?.wormEnabled ?? 1) !== 1) return false;
  const wormCount = clamp(Math.round(Number(state.params?.wormCount ?? 3)), 0, 8);
  if (wormCount <= 0) return false;
  const minLen = clamp(Number(state.params?.wormLengthMin ?? 48), 12, 160);
  const maxLen = Math.max(minLen, clamp(Number(state.params?.wormLengthMax ?? 120), 24, 220));
  const minRad = clamp(Number(state.params?.wormRadiusMin ?? 2.2), 0.8, 6.0);
  const maxRad = Math.max(minRad, clamp(Number(state.params?.wormRadiusMax ?? 4.8), 1.2, 9.0));
  const region = 64;
  const rx = Math.floor((x | 0) / region);
  const rz = Math.floor((z | 0) / region);
  const caveMinY = clamp(Math.round(Number(state.params?.caveMinY ?? 8)), 1, 64);
  let bandTop = Math.max(caveMinY + 6, (topY | 0) - 8);
  const bandBot = Math.max(caveMinY + 2, (topY | 0) - 44);
  if (bandTop <= bandBot) bandTop = bandBot + 2;
  for (let rzz = rz - 1; rzz <= rz + 1; rzz += 1) {
    for (let rxx = rx - 1; rxx <= rx + 1; rxx += 1) {
      const regionSeed = hashSeed(`${worldSeed}:worms:v1:${rxx}:${rzz}`);
      const baseX = rxx * region;
      const baseZ = rzz * region;
      for (let i = 0; i < wormCount; i += 1) {
        const rnd = (a, b) => randomFromInt2DWithSeed(a, b, regionSeed);
        const sx = baseX + (rnd((rxx * 131) + (i * 17) + 11, (rzz * 193) - (i * 29) - 7) * region);
        const sz = baseZ + (rnd((rxx * 197) + (i * 23) + 5, (rzz * 149) - (i * 31) - 13) * region);
        const sy = bandBot + (rnd((rxx * 167) + (i * 19) + 3, (rzz * 173) - (i * 37) - 9) * (bandTop - bandBot));
        const theta = rnd((rxx * 181) + (i * 41) + 1, (rzz * 211) - (i * 43) - 1) * (Math.PI * 2.0);
        const length = minLen + (rnd((rxx * 223) + (i * 47) + 2, (rzz * 227) - (i * 53) - 2) * (maxLen - minLen));
        const radius = minRad + (rnd((rxx * 229) + (i * 59) + 4, (rzz * 233) - (i * 61) - 4) * (maxRad - minRad));
        const dySlope = (rnd((rxx * 239) + (i * 67) + 6, (rzz * 241) - (i * 71) - 6) - 0.5) * (length * 0.18);
        const curveLat = (rnd((rxx * 251) + (i * 73) + 8, (rzz * 257) - (i * 79) - 8) - 0.5) * (length * 0.45);
        const curveY = (rnd((rxx * 263) + (i * 83) + 10, (rzz * 269) - (i * 89) - 10) - 0.5) * (length * 0.22);
        const dx = Math.cos(theta); const dz = Math.sin(theta);
        const pxPerp = -dz; const pzPerp = dx;
        const ex = sx + (dx * length); const ey = sy + dySlope; const ez = sz + (dz * length);
        const mx = sx + (dx * (length * 0.5)) + (pxPerp * curveLat);
        const my = sy + (dySlope * 0.5) + curveY;
        const mz = sz + (dz * (length * 0.5)) + (pzPerp * curveLat);
        const rad2 = radius * radius;
        const minX = Math.min(sx, mx, ex) - radius; const maxX = Math.max(sx, mx, ex) + radius;
        const minY = Math.min(sy, my, ey) - radius; const maxY = Math.max(sy, my, ey) + radius;
        const minZ = Math.min(sz, mz, ez) - radius; const maxZ = Math.max(sz, mz, ez) + radius;
        if (x < minX || x > maxX || y < minY || y > maxY || z < minZ || z > maxZ) continue;
        if (dist2PointSegment3D(x, y, z, sx, sy, sz, mx, my, mz) <= rad2) return true;
        if (dist2PointSegment3D(x, y, z, mx, my, mz, ex, ey, ez) <= rad2) return true;
      }
    }
  }
  return false;
}

function shouldCarveCaveAt(worldSeed, biome, x, y, z, topY) {
  if (!state.params?.caveEnabled) return false;
  const minY = clamp(Math.round(Number(state.params?.caveMinY ?? 8)), 1, 64);
  if (y < minY) return false;
  const surfaceBuffer = clamp(Math.round(Number(state.params?.caveSurfaceBuffer ?? 4)), 2, 12);
  if (y >= (topY - surfaceBuffer)) return false;
  const safeR = clamp(Math.round(Number(state.params?.caveSpawnSafeRadius ?? 24)), 0, 64);
  if (safeR > 0 && (((x * x) + (z * z)) <= (safeR * safeR))) return false;
  const scale = clamp(Number(state.params?.caveNoiseScale ?? 0.045), 0.010, 0.120);
  const oct = clamp(Math.round(Number(state.params?.caveNoiseOctaves ?? 3)), 1, 4);
  let threshold = clamp(Number(state.params?.caveDensityThreshold ?? 0.62), 0.45, 0.90);
  const b = String(biome || "").toLowerCase();
  const biomeAdjust = ({ fire: -0.03, stone: -0.02, earth: 0.0, grass: 0.02, wind: 0.03, bridge: 0.04 }[b] ?? 0.0);
  threshold = clamp(threshold + biomeAdjust, 0.40, 0.95);
  const depth = Math.max(0, topY - y);
  if (depth < (surfaceBuffer + 6)) threshold += 0.06;
  else if (depth > 24) threshold -= 0.03;
  threshold = clamp(threshold, 0.40, 0.95);
  const caveSeed = hashSeed(`${worldSeed}:caves:v1`);
  let noise = 0, weight = 0, freq = 1, amp = 1;
  for (let i = 0; i < oct; i += 1) {
    const n = valueNoise3D(x * scale * freq, y * scale * freq, z * scale * freq, caveSeed);
    noise += n * amp;
    weight += amp;
    freq *= 2.03;
    amp *= 0.5;
  }
  const n01 = ((weight > 0 ? noise / weight : 0) * 0.5) + 0.5;
  return (n01 > threshold) || shouldCarveWormAt(worldSeed, x, y, z, topY);
}

function maybePromoteEmissiveBlock(worldSeed, blockId, x, y, z, topY) {
  const bid = Math.max(0, Number(blockId) | 0);
  if (bid <= 0) return 0;
  if (Number(state.params?.caveEmissiveEnabled ?? 1) !== 1) return bid;
  const surfaceBuffer = clamp(Math.round(Number(state.params?.caveSurfaceBuffer ?? 4)), 2, 12);
  if (y >= (topY - (surfaceBuffer + 2))) return bid;
  const density = clamp(Number(state.params?.caveEmissiveDensity ?? 0.018), 0.0, 0.08);
  if (density <= 0) return bid;
  const depth = Math.max(0, topY - y);
  const chance = clamp(density * (1.0 + Math.min(0.9, Math.max(0.0, (depth - 8) * 0.03))), 0.0, 0.25);
  const seed = hashSeed(`${worldSeed}:cave-emissive:v1`);
  return randomFromInt3DWithSeed(x, y, z, seed) < chance ? 20 : bid;
}

function voxelIndex(lx, ly, lz) {
  return lx + (lz * state.chunkSize) + (ly * state.voxelLayerSize);
}

function buildVoxelBlocksFromHeights(cx, cz, heights, overridesRows) {
  const blocks = new Uint16Array(state.voxelChunkVolume);
  let solidCount = 0;
  const worldSeed = String(state.params?.seed || "default-seed");
  for (let z = 0; z < state.chunkSize; z += 1) {
    const row = heights[z] || [];
    for (let x = 0; x < state.chunkSize; x += 1) {
      const h = row[x];
      if (h === null || !Number.isFinite(h)) continue;
      const wx = (cx * state.chunkSize) + x;
      const wz = (cz * state.chunkSize) + z;
      const sample = (state.params?.worldStyle === "fixed_biome_grid") ? sampleFixedColumn(wx, wz) :
        (state.params?.worldStyle === "floating_hub_islands" ? sampleFloatingColumn(wx, wz) : null);
      const biome = (sample?.biome || "grass").toString().toLowerCase();
      const topY = clamp(Math.round(Number(h) || 0), 0, state.voxelChunkHeight - 1);
      const slopeHint = columnSlopeHint(wx, wz, topY);
      const surfaceBlockId = defaultSurfaceBlockId(worldSeed, biome, wx, wz, slopeHint);
      for (let y = 0; y <= topY; y += 1) {
        let blockId = 0;
        if (y === topY) blockId = surfaceBlockId;
        else if (y >= (topY - 3)) blockId = defaultSubsoilBlockId(worldSeed, biome, wx, y, wz);
        else blockId = defaultDeepBlockId(worldSeed, biome, wx, y, wz);
        blockId = maybePromoteEmissiveBlock(worldSeed, blockId, wx, y, wz, topY);
        if (blockId > 0 && shouldCarveCaveAt(worldSeed, biome, wx, y, wz, topY)) blockId = 0;
        blocks[voxelIndex(x, y, z)] = blockId;
        if (blockId > 0) solidCount += 1;
      }
    }
  }
  for (const row of overridesRows || []) {
    const wx = Number(row?.[0]); const wy = Number(row?.[1]); const wz = Number(row?.[2]);
    const bid = Math.max(0, Number(row?.[3]) | 0);
    if (![wx, wy, wz].every((v) => Number.isFinite(v))) continue;
    if (wy < 0 || wy >= state.voxelChunkHeight) continue;
    const cx0 = Math.floor((wx | 0) / state.chunkSize);
    const cz0 = Math.floor((wz | 0) / state.chunkSize);
    if (cx0 !== (cx | 0) || cz0 !== (cz | 0)) continue;
    const lx = (wx | 0) - (cx0 * state.chunkSize);
    const lz = (wz | 0) - (cz0 * state.chunkSize);
    const idx = voxelIndex(lx, wy | 0, lz);
    const prev = blocks[idx] || 0;
    if (prev === bid) continue;
    if (prev > 0 && bid <= 0) solidCount = Math.max(0, solidCount - 1);
    if (prev <= 0 && bid > 0) solidCount += 1;
    blocks[idx] = bid;
  }
  return { blocks, solidCount };
}

function generateChunk(cx, cz, overridesRows) {
  const heights = [];
  let minH = Infinity;
  let maxH = -Infinity;
  let columnCount = 0;
  for (let z = 0; z < state.chunkSize; z += 1) {
    const row = [];
    for (let x = 0; x < state.chunkSize; x += 1) {
      const wx = (cx * state.chunkSize) + x;
      const wz = (cz * state.chunkSize) + z;
      const h = sampleHeight(wx, wz);
      row.push(h);
      if (h !== null && Number.isFinite(h)) {
        columnCount += 1;
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
      }
    }
    heights.push(row);
  }
  const built = buildVoxelBlocksFromHeights(cx, cz, heights, overridesRows);
  return { cx, cz, minH, maxH, heights, columnCount, blocks: built.blocks, solidCount: built.solidCount };
}

self.onmessage = (ev) => {
  const msg = ev?.data || {};
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "configure") {
    state.params = msg.params || {};
    state.chunkSize = Math.max(8, Math.min(64, Number(msg.chunkSize) || 16));
    state.voxelChunkHeight = Math.max(16, Math.min(512, Number(msg.voxelChunkHeight) || 128));
    state.voxelLayerSize = state.chunkSize * state.chunkSize;
    state.voxelChunkVolume = state.voxelLayerSize * state.voxelChunkHeight;
    state.seedHash = hashSeed(String(state.params?.seed || "default-seed"));
    state.floatingLayout = buildFloatingLayout(state.params || {});
    return;
  }
  if (msg.type === "generate") {
    const reqId = Number(msg.reqId) | 0;
    const cx = Number(msg.cx) | 0;
    const cz = Number(msg.cz) | 0;
    const out = generateChunk(cx, cz, Array.isArray(msg.overrides) ? msg.overrides : []);
    self.postMessage({
      type: "generated",
      reqId,
      cx,
      cz,
      minH: out.minH,
      maxH: out.maxH,
      heights: out.heights,
      columnCount: out.columnCount,
      solidCount: out.solidCount,
      blocksBuffer: out.blocks.buffer,
    }, [out.blocks.buffer]);
  }
};
