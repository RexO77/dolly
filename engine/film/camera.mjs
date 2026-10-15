/**
 * The launch camera: a take seen as a plane in 3D, through a perspective
 * camera that drifts. Pure functions, no Node or DOM, so the renderer and
 * the Studio place every shot with the same numbers.
 *
 * The plane is the recorded screen in CSS pixels (u, v). The camera puts a
 * focal point (fx, fy) of it at the centre of the frame, magnified `mag`
 * times, then turns it like CSS `rotateX(pitch) rotateY(yaw) rotateZ(roll)`
 * (roll first, so lines of text run diagonally; then yaw; then the tilt
 * back), shifts it by a drift, and looks at it from `perspective` away.
 * Lengths in output pixels are for a 1080-high frame and scale with it.
 */

const rad = (d) => (d * Math.PI) / 180;
const REFERENCE_HEIGHT = 1080;

/** Where a shot's camera is at shot time `t` (seconds from the cut): every value interpolated along the shot's drift. */
export function cameraAt(shot, t) {
  const u = shot.length > 0 ? Math.max(0, Math.min(1, t / shot.length)) : 0;
  /* Constant drift, or an ease-out over the first third that hands off to a constant one: never to a stop. */
  const e = shot.ease === 'arrive' ? arrive(u) : u;
  const lerp = ([a, b]) => a + (b - a) * e;
  return {
    mag: lerp(shot.mag),
    pitch: lerp(shot.pitch),
    yaw: lerp(shot.yaw),
    roll: lerp(shot.roll),
    fx: lerp(shot.fx),
    fy: lerp(shot.fy),
    tx: lerp(shot.tx),
    ty: lerp(shot.ty),
    perspective: shot.perspective,
  };
}

/** An ease-out over the first third, then a straight line at the speed it reached: the camera arrives and keeps drifting. */
function arrive(u) {
  const k = 1 / 3;
  /* A quadratic ease-out to u = k, whose end speed matches the line after it. */
  const slope = 1 / (1 - k / 2);
  if (u < k) return slope * (u - (u * u) / (2 * k));
  return slope * (k / 2) + slope * (u - k);
}

/**
 * The camera as matrices, for an output W x H:
 *   H     the 3x3 homography, row major, from a plane point (u, v, 1) to the
 *         output pixel (x, y) once divided by its third coordinate
 *   depth [a, b, c]: the plane point's depth toward the viewer, a u + b v + c,
 *         in output pixels (0 at the focal point, negative is farther away)
 */
export function projection(cam, W, H) {
  const s = H / REFERENCE_HEIGHT;
  const m = cam.mag * s;
  const P = cam.perspective * s;
  const [cx, sx] = [Math.cos(rad(cam.pitch)), Math.sin(rad(cam.pitch))];
  const [cy, sy] = [Math.cos(rad(cam.yaw)), Math.sin(rad(cam.yaw))];
  const [cz, sz] = [Math.cos(rad(cam.roll)), Math.sin(rad(cam.roll))];
  /* R = Rx(pitch) . Ry(yaw) . Rz(roll), applied to (x, y, 0): only its first two columns matter. */
  const R = [
    [cy * cz, -cy * sz],
    [sx * sy * cz + cx * sz, -sx * sy * sz + cx * cz],
    [-cx * sy * cz + sx * sz, cx * sy * sz + sx * cz],
  ];
  /* M: plane (u, v, 1) to camera space (x, y, z), with the focal point at the origin plus the drift. */
  const M = R.map(([a, b], i) => [a * m, b * m, -(a * m * cam.fx + b * m * cam.fy) + (i === 0 ? cam.tx * s : i === 1 ? cam.ty * s : 0)]);
  /* The perspective divide: w = P - z, x' = W/2 + P x / w. */
  const Wrow = [-M[2][0], -M[2][1], P - M[2][2]];
  const Hm = [
    ...[0, 1, 2].map((j) => P * M[0][j] + (W / 2) * Wrow[j]),
    ...[0, 1, 2].map((j) => P * M[1][j] + (H / 2) * Wrow[j]),
    ...Wrow,
  ];
  return { H: Hm, depth: M[2] };
}

/** The inverse of a 3x3 row-major matrix. */
export function invert(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
}

/** Apply a 3x3 row-major homography to (x, y). */
export function apply(m, x, y) {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}
