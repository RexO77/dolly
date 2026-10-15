/**
 * A launch film's shots, from what a person (or the director) writes down
 * to every number the renderer needs. Pure: the Studio resolves shots with
 * the same module.
 *
 * A shot names the moment it cuts in on (`at`, seconds into its take), how
 * long it runs, and its subject: a box the take measured, by name, or a
 * rect. Everything else has a default from the grammar: the scale from
 * the subject's size, the diagonal alternating from the shot before, the
 * drift along the subject, the light shaped to it.
 *
 *   {take?, at, length, subject, scale?, diagonal?, track?, push?, turn?,
 *    rack?: [{at, to}], mag?, pitch?, roll?, yaw?, perspective?}
 */
import { cameraAt, projection, invert, apply } from './camera.mjs';
import { SCALES, SUBJECT_FILL, DRIFT, LIGHT_LAG, RACK, GRADE } from './grammar.mjs';

const REFERENCE_WIDTH = 1920;
const rad = (d) => (d * Math.PI) / 180;
const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** A subject as a rect in the take's CSS pixels: a box name, a rect in fractions of the screen, or one in CSS pixels. */
export function subjectRect(subject, take) {
  const { width, height } = take.viewport;
  const r = typeof subject === 'string' ? take.boxes?.[subject] : subject;
  if (!r) throw new Error(`the take has no box "${subject}" (it has ${Object.keys(take.boxes ?? {}).join(', ') || 'none'}); mark it with h.box`);
  const fraction = r.w <= 1 && r.h <= 1;
  return fraction ? { x: r.x * width, y: r.y * height, w: r.w * width, h: r.h * height } : { ...r };
}

/** The scale a subject asks for: the class, and the magnification that makes it fill its share of the frame. */
export function scaleFor(rect, name) {
  const want = (SUBJECT_FILL * REFERENCE_WIDTH) / Math.max(rect.w, 1);
  const pick = name ?? (want >= 4.5 ? 'extreme' : want >= 2.6 ? 'macro' : 'medium');
  const range = { extreme: [4.5, 6.5], macro: [2.6, 4], medium: [1.4, 2.5], wide: [0.85, 1.1] }[pick];
  return { name: pick, mag: name === 'wide' ? SCALES.wide.mag : Math.max(range[0], Math.min(range[1], want)) };
}

/**
 * Every shot with its camera and light worked out, in film order. `takes`
 * maps a take's name to its take file (beats, boxes, viewport). Each shot
 * gets `cut` (when it starts in the film) and `from` (the take time it
 * starts on).
 */
export function resolveShots(film, takes) {
  let cut = 0;
  let diagonal = -1;
  return film.shots.map((s, i) => {
    const takeName = s.take ?? film.take;
    const take = takes[takeName];
    if (!take) throw new Error(`shot ${i + 1} is cut from "${takeName}", which has not been recorded`);
    const rect = subjectRect(s.subject, take);
    const scale = scaleFor(rect, s.scale);
    const preset = SCALES[scale.name];
    /* The diagonal flips on every cut, unless a shot says otherwise; the wide shot has none. */
    diagonal = scale.name === 'wide' ? diagonal : s.diagonal ?? -diagonal;
    const sign = scale.name === 'wide' ? 0 : diagonal;
    const tall = rect.h > rect.w * 1.4;
    const roll = s.roll ?? preset.roll * sign;
    const pitch = s.pitch ?? preset.pitch;
    const yaw = s.yaw ?? preset.yaw * (sign || 1) * -1;
    const mag = s.mag ?? scale.mag;
    const push = s.push ?? DRIFT.push;
    const turn = s.turn ?? DRIFT.turn;
    /* Track along the action: along a row for a wide subject, down a column for a tall one, laid on the diagonal. */
    const along = tall ? rad(roll + 90) : rad(roll);
    const track = s.track ?? [Math.cos(along) * DRIFT.track * (sign || 1), Math.sin(along) * DRIFT.track * (sign || 1)];
    const travel = track.map((v) => v * REFERENCE_WIDTH);
    const focus = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    const shot = {
      index: i,
      take: takeName,
      cut,
      from: s.at,
      length: s.length,
      scale: scale.name,
      diagonal: sign,
      rect,
      mag: [mag, mag * (1 + push)],
      pitch: [pitch, pitch],
      yaw: [yaw, yaw],
      roll: [roll, roll + turn * (sign || 1)],
      fx: [focus.x, focus.x],
      fy: [focus.y, focus.y],
      /* The subject drifts the other way across the frame as the camera travels. */
      tx: [travel[0] / 2, -travel[0] / 2],
      ty: [travel[1] / 2, -travel[1] / 2],
      perspective: s.perspective ?? preset.perspective,
      ease: 'arrive',
      preset,
      tall,
      rack: (s.rack ?? []).map((r) => ({ at: r.at, rect: subjectRect(r.to, take) })),
      light: s.light ?? {},
    };
    cut += s.length;
    return shot;
  });
}

/** Where focus sits at shot time `t`: the subject's centre, sliding to each rack's target over RACK seconds. */
export function focusAt(shot, t) {
  let at = { x: shot.rect.x + shot.rect.w / 2, y: shot.rect.y + shot.rect.h / 2 };
  for (const r of shot.rack) {
    const to = { x: r.rect.x + r.rect.w / 2, y: r.rect.y + r.rect.h / 2 };
    const e = smooth((t - r.at) / RACK);
    at = { x: at.x + (to.x - at.x) * e, y: at.y + (to.y - at.y) * e };
  }
  return at;
}

/**
 * The camera and the look at shot time `t`, for an OW x OH frame: the
 * camera, the focus on the plane, the blur that puts the far edge at the
 * scale's blur, and the pool of light, trailing the focus by LIGHT_LAG.
 */
export function shotAt(shot, t, OW, OH) {
  const cam = cameraAt(shot, t);
  const f = focusAt(shot, t);
  /* The light trails: the mean of where focus was over the last LIGHT_LAG seconds, never before the cut. */
  const N = 8;
  let lx = 0;
  let ly = 0;
  for (let k = 0; k < N; k += 1) {
    const p = focusAt(shot, Math.max(0, t - (LIGHT_LAG * k) / (N - 1)));
    lx += p.x / N;
    ly += p.y / N;
  }
  const { H, depth } = projection(cam, OW, OH);
  const inv = invert(H);
  const zAt = ([u, v]) => depth[0] * u + depth[1] * v + depth[2];
  const zFocus = zAt([f.x, f.y]);
  /* The far edge is whichever of the frame's top and bottom lies deeper; it gets the scale's far blur. */
  const zTop = zAt(apply(inv, OW / 2, 0));
  const zBottom = zAt(apply(inv, OW / 2, OH));
  const reach = Math.max(Math.abs(zTop - zFocus), Math.abs(zBottom - zFocus), 1);
  const s = OH / 1080;
  const { preset } = shot;
  /* The pool's reach on screen, as a share of the frame width, turned into plane pixels at this magnification. */
  const alongR = ((shot.light.along ?? preset.along) * REFERENCE_WIDTH) / cam.mag;
  const acrossR = ((shot.light.across ?? preset.across) * REFERENCE_WIDTH) / cam.mag;
  /* The key hangs toward the far side of the slab and to one side, flipping with the diagonal. */
  const side = shot.diagonal || 1;
  const light = {
    x: lx,
    y: ly,
    along: alongR,
    across: acrossR,
    angle: shot.tall ? Math.PI / 2 : 0,
    coreRatio: preset.core || 0.0001,
    keyX: 0.12 * alongR * side,
    keyY: -0.1 * acrossR,
  };
  return {
    cam,
    look: {
      focus: [f.x, f.y],
      blur: { k: (preset.farBlur * s) / reach, max: preset.maxBlur * s },
      light,
      slab: { radius: GRADE.slabRadius },
      exposure: GRADE.exposure,
      vignette: GRADE.vignette,
    },
  };
}
