/**
 * Codificador de QR Code (Model 2, modo byte, correcção de erros M, versões 1-10) sem dependências.
 * Devolve a matriz de módulos (true = escuro). Verificado contra um descodificador (OpenCV) nos testes.
 * O Anexo III da AGT pede versão 4; o URL real não cabe na 4 (ver qr.ts), por isso escolhemos a menor que serve.
 */

// [codewords de EC por bloco, [blocos, dados por bloco][]] — nível M
const EC_M: Record<number, [number, Array<[number, number]>]> = {
  1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]], 5: [24, [[2, 43]]],
  6: [16, [[4, 27]]], 7: [18, [[4, 31]]], 8: [22, [[2, 38], [2, 39]]], 9: [22, [[3, 36], [2, 37]]], 10: [26, [[4, 43], [1, 44]]],
};
const ALIGN: Record<number, number[]> = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };

const dataCodewords = (v: number) => EC_M[v]![1].reduce((a, [n, d]) => a + n * d, 0);

// GF(256), polinómio 0x11D
const EXP = new Array<number>(512);
const LOG = new Array<number>(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x; LOG[x] = i;
    x <<= 1; if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
})();
const gmul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!);

function rsGenerator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]!;
      next[j + 1] ^= gmul(poly[j]!, EXP[i]!);
    }
    poly = next;
  }
  return poly; // coeficientes do termo de maior grau para o menor (o 1.º é 1)
}

function rsRemainder(data: number[], degree: number): number[] {
  const gen = rsGenerator(degree);
  const rem = new Array(degree).fill(0);
  for (const b of data) {
    const factor = b ^ rem.shift()!;
    rem.push(0);
    for (let i = 0; i < degree; i++) rem[i] ^= gmul(gen[i + 1]!, factor);
  }
  return rem;
}

function bchFormat(mask: number): number {
  const data = (0b00 << 3) | mask; // M = 00
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function bchVersion(v: number): number {
  let rem = v;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (v << 12) | rem;
}

export function qrMinVersion(byteLength: number): number | null {
  for (let v = 1; v <= 10; v++) {
    const countBits = v < 10 ? 8 : 16;
    if (4 + countBits + byteLength * 8 <= dataCodewords(v) * 8) return v;
  }
  return null;
}

export function qrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = qrMinVersion(bytes.length);
  if (!version) throw new RangeError("Texto demasiado longo para o codificador de QR (máx. versão 10)");
  const size = 17 + 4 * version;

  // 1) bits de dados
  const bits: number[] = [];
  const push = (val: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((b) => push(b, 8));
  const capBits = dataCodewords(version) * 8;
  push(0, Math.min(4, capBits - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; data.length < dataCodewords(version); pad ^= 0xec ^ 0x11) data.push(pad);

  // 2) blocos + EC + intercalação
  const [ecLen, groups] = EC_M[version]!;
  const blocks: number[][] = [];
  const ecs: number[][] = [];
  let off = 0;
  for (const [n, d] of groups) for (let i = 0; i < n; i++) {
    const blk = data.slice(off, off + d); off += d;
    blocks.push(blk); ecs.push(rsRemainder(blk, ecLen));
  }
  const out: number[] = [];
  const maxD = Math.max(...blocks.map((b) => b.length));
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.length) out.push(b[i]!);
  for (let i = 0; i < ecLen; i++) for (const e of ecs) out.push(e[i]!);
  const finalBits: number[] = [];
  out.forEach((b) => { for (let i = 7; i >= 0; i--) finalBits.push((b >>> i) & 1); });
  const rem = version === 1 ? 0 : version <= 6 ? 7 : 0;
  for (let i = 0; i < rem; i++) finalBits.push(0);

  // 3) matriz base + padrões de função
  const mod: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (r: number, c: number, v: boolean) => { mod[r]![c] = v; fn[r]![c] = true; };

  const finder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) {
      const r = r0 + dr, c = c0 + dc;
      if (r < 0 || c < 0 || r >= size || c >= size) continue;
      const on = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
      set(r, c, on);
    }
  };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const al = ALIGN[version]!;
  for (const r of al) for (const c of al) {
    if ((r === 6 && c === 6) || (r === 6 && c === al[al.length - 1]) || (r === al[al.length - 1] && c === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }
  set(size - 8, 8, true); // módulo escuro fixo
  // reservar áreas de formato e versão
  for (let i = 0; i < 9; i++) { if (!fn[8]![i]) set(8, i, false); if (!fn[i]![8]) set(i, 8, false); }
  for (let i = 0; i < 8; i++) { if (!fn[8]![size - 1 - i]) set(8, size - 1 - i, false); if (!fn[size - 1 - i]![8]) set(size - 1 - i, 8, false); }
  const drawVersion = () => {
    if (version < 7) return;
    const info = bchVersion(version);
    for (let i = 0; i < 18; i++) {
      const bit = ((info >>> i) & 1) === 1;
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      set(b, a, bit); set(a, b, bit);
    }
  };
  drawVersion();

  // 4) colocar dados em zigue-zague
  const place = (maskId: number): boolean[][] => {
    const m = mod.map((row) => row.slice());
    let idx = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const c = right - j;
        const up = ((right + 1) & 2) === 0;
        const r = up ? size - 1 - vert : vert;
        if (fn[r]![c]) continue;
        let bit = idx < finalBits.length ? finalBits[idx++] === 1 : false;
        const masked = [
          (r + c) % 2 === 0, r % 2 === 0, c % 3 === 0, (r + c) % 3 === 0,
          (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, ((r * c) % 2) + ((r * c) % 3) === 0,
          (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
        ][maskId]!;
        if (masked) bit = !bit;
        m[r]![c] = bit;
      }
    }
    // informação de formato
    const f = bchFormat(maskId);
    const fb = (i: number) => ((f >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) m[i]![8] = fb(i);
    m[7]![8] = fb(6); m[8]![8] = fb(7); m[8]![7] = fb(8);
    for (let i = 9; i < 15; i++) m[8]![14 - i] = fb(i);
    for (let i = 0; i < 8; i++) m[8]![size - 1 - i] = fb(i);
    for (let i = 8; i < 15; i++) m[size - 15 + i]![8] = fb(i);
    m[size - 8]![8] = true;
    return m;
  };

  const penalty = (m: boolean[][]): number => {
    let p = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (let a = 0; a < size; a++) {
        let run = 1;
        for (let b = 1; b < size; b++) {
          const cur = pass ? m[b]![a] : m[a]![b], prev = pass ? m[b - 1]![a] : m[a]![b - 1];
          if (cur === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
        }
        const line = Array.from({ length: size }, (_, b) => (pass ? m[b]![a] : m[a]![b]) ? 1 : 0).join("");
        p += 40 * ((line.match(/10111010000/g) ?? []).length + (line.match(/00001011101/g) ?? []).length);
      }
    }
    for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
      const v = m[r]![c];
      if (v === m[r]![c + 1] && v === m[r + 1]![c] && v === m[r + 1]![c + 1]) p += 3;
    }
    const dark = m.flat().filter(Boolean).length;
    p += 10 * Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size));
    return p;
  };

  let best = place(0), bestP = penalty(best);
  for (let k = 1; k < 8; k++) { const m = place(k), p = penalty(m); if (p < bestP) { best = m; bestP = p; } }
  return best;
}
