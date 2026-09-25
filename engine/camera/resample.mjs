/**
 * Lanczos crop-and-resize of packed RGB frames, ported from Pillow's
 * libImaging/Resample.c so a render matches what camera.py shipped, pixel
 * for pixel: the same float32 box, the same 22-bit fixed-point weights, the
 * same horizontal-then-vertical passes through an 8-bit intermediate.
 *
 * The box is fractional, which is what keeps a slow lean sub-pixel smooth.
 */

const PRECISION_BITS = 32 - 8 - 2;
const ONE = 2 ** PRECISION_BITS;
const HALF = 2 ** (PRECISION_BITS - 1);
const SUPPORT = 3;

function sinc(x) {
  if (x === 0) return 1;
  x *= Math.PI;
  return Math.sin(x) / x;
}

function lanczos(x) {
  return -SUPPORT <= x && x < SUPPORT ? sinc(x) * sinc(x / SUPPORT) : 0;
}

/**
 * Per output pixel along one axis: the first source pixel it reads, how
 * many it reads, and their fixed-point weights.
 */
function coefficients(inSize, in0, in1, outSize) {
  in0 = Math.fround(in0);
  in1 = Math.fround(in1);
  const scale = Math.fround(in1 - in0) / outSize;
  const filterscale = Math.max(scale, 1);
  const support = SUPPORT * filterscale;
  const ksize = Math.ceil(support) * 2 + 1;
  const bounds = new Int32Array(outSize * 2);
  const kk = new Int32Array(outSize * ksize);
  const w = new Float64Array(ksize);
  const ss = 1 / filterscale;
  for (let xx = 0; xx < outSize; xx += 1) {
    const center = in0 + (xx + 0.5) * scale;
    const xmin = Math.max(Math.trunc(center - support + 0.5), 0);
    const xmax = Math.min(Math.trunc(center + support + 0.5), inSize) - xmin;
    let ww = 0;
    for (let x = 0; x < xmax; x += 1) {
      w[x] = lanczos((x + xmin - center + 0.5) * ss);
      ww += w[x];
    }
    for (let x = 0; x < xmax; x += 1) {
      const k = ww !== 0 ? w[x] / ww : w[x];
      kk[xx * ksize + x] = Math.trunc(k < 0 ? -0.5 + k * ONE : 0.5 + k * ONE);
    }
    bounds[xx * 2] = xmin;
    bounds[xx * 2 + 1] = xmax;
  }
  return { ksize, bounds, kk };
}

const clip8 = (v) => {
  const s = Math.floor(v / ONE);
  return s < 0 ? 0 : s > 255 ? 255 : s;
};

/**
 * Resize the region `box` = [x0, y0, x1, y1] (source pixels, fractional) of
 * a W x H RGB frame to OW x OH. Returns a new Uint8Array of OW * OH * 3.
 */
export function resample(src, W, H, OW, OH, box) {
  const [bx0, by0, bx1, by1] = box.map(Math.fround);
  const horiz = coefficients(W, bx0, bx1, OW);
  const vert = coefficients(H, by0, by1, OH);
  const needH = OW !== W || bx0 !== 0 || bx1 !== OW;
  const needV = OH !== H || by0 !== 0 || by1 !== OH;

  let img = src;
  let iw = W;
  const vb = vert.bounds.slice();
  if (needH) {
    const first = vb[0];
    const last = vb[OH * 2 - 2] + vb[OH * 2 - 1];
    for (let i = 0; i < OH; i += 1) vb[i * 2] -= first;
    const rows = last - first;
    const tmp = new Uint8Array(OW * rows * 3);
    const { ksize, bounds, kk } = horiz;
    for (let y = 0; y < rows; y += 1) {
      const row = (y + first) * W * 3;
      const outRow = y * OW * 3;
      for (let xx = 0; xx < OW; xx += 1) {
        const xmin = bounds[xx * 2];
        const xmax = bounds[xx * 2 + 1];
        const k = xx * ksize;
        let s0 = HALF;
        let s1 = HALF;
        let s2 = HALF;
        let p = row + xmin * 3;
        for (let x = 0; x < xmax; x += 1, p += 3) {
          const c = kk[k + x];
          s0 += src[p] * c;
          s1 += src[p + 1] * c;
          s2 += src[p + 2] * c;
        }
        const o = outRow + xx * 3;
        tmp[o] = clip8(s0);
        tmp[o + 1] = clip8(s1);
        tmp[o + 2] = clip8(s2);
      }
    }
    img = tmp;
    iw = OW;
  }
  if (!needV) return img === src ? src.slice() : img;

  const out = new Uint8Array(iw * OH * 3);
  const { ksize, kk } = vert;
  const stride = iw * 3;
  for (let yy = 0; yy < OH; yy += 1) {
    const ymin = vb[yy * 2];
    const ymax = vb[yy * 2 + 1];
    const k = yy * ksize;
    const outRow = yy * stride;
    for (let xx = 0; xx < iw; xx += 1) {
      let s0 = HALF;
      let s1 = HALF;
      let s2 = HALF;
      let p = ymin * stride + xx * 3;
      for (let y = 0; y < ymax; y += 1, p += stride) {
        const c = kk[k + y];
        s0 += img[p] * c;
        s1 += img[p + 1] * c;
        s2 += img[p + 2] * c;
      }
      const o = outRow + xx * 3;
      out[o] = clip8(s0);
      out[o + 1] = clip8(s1);
      out[o + 2] = clip8(s2);
    }
  }
  return out;
}
