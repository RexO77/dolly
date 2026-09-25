# The camera

A clip's camera is a spec in `projects/<project>/cameras/<clip>.camera.json`. A scenario's `direction` writes it after every take (`dolly record`, `dolly direct`); the Studio writes it on Save; you can write it by hand. The renderer and the Studio read it through the same module, `engine/camera/math.mjs`, so the preview is the render.

```json
{
  "camera": [
    { "t": 0, "wide": true },
    { "t": 3.583, "wide": true },
    { "t": 4.783, "focus": { "x": 0, "y": 0.675, "w": 0.4688, "h": 0.325 } },
    { "t": 6.333, "focus": { "x": 0, "y": 0.675, "w": 0.4688, "h": 0.325 } },
    { "t": 7.533, "wide": true },
    { "t": 9.0, "wide": true }
  ],
  "spots": [
    { "x": 0, "y": 0.675, "w": 0.4688, "h": 0.325, "in": 4.633, "out": 6.433, "fade": 0.45 }
  ],
  "source": { "cut": { "from": 2.1, "to": 5.4, "fade": 0.3 } }
}
```

Every position and size is a fraction of the frame. Every time is seconds on the clip's clock.

## Keyframes

`camera` is a list of keyframes, sorted by `t`. Each is one of three views:

| Keyframe | The view |
| --- | --- |
| `{t, wide: true}` | the whole frame |
| `{t, focus: {x, y, w, h}, z?}` | lean in on a box: centred on it at 1.35 (or `z`), backed off just enough that the box fills at most 92% of the frame |
| `{t, cx, cy, z}` | a view by its centre and zoom |

Two equal neighbours make a hold. Between two different ones the camera moves on the **arriving** keyframe's curve:

| Key | The move |
| --- | --- |
| no key, or `ease: "spring"` | the zero-bounce spring: quick off the mark, a long soft settle, never past its end |
| `ease: "smooth"` | smootherstep: even, with no jolt at either end |
| `transition: {type: "easing", ease: [x1, y1, x2, y2]}` | a cubic Bezier over the move |
| `transition: {type: "spring", bounce}` | a spring with some bounce, made to land exactly on the move's end |

A `transition` wins over `ease`. The view never shows past the frame's edge: a crop near an edge is clamped inside it.

## Spots

`spots` are the washes. A wash lays a fixed warm paper colour, rgb(245, 239, 230), at 72% over everything but its box, with corners rounded to 6 CSS px. It is never a ring.

| Key | What it does |
| --- | --- |
| `x, y, w, h` | the box left clear |
| `in` | when it starts to come up |
| `fade` | how long it takes to come up (0.5s), on an ease-out |
| `out` | when it starts to go; without it, the wash stays to the end |
| `fadeOut` | how long it takes to go (70% of `fade`: exits are quieter than entrances) |

## Source

`source` trims the master before the camera sees it. Camera and spot times are on the trimmed clip's clock.

| Key | What it does |
| --- | --- |
| `end` | stop the clip at this time |
| `cut: {from, to, fade}` | take out `from` to `to` of the master, with a crossfade of `fade` seconds (0.25) across the join |

## Checks

A render and a Studio Save refuse a spec with errors: a keyframe with no time, a focus that is not a rect, a zoom below 1, an unknown `ease` or `transition`, a spot with no `in`, a cut whose `from` is not before its `to`. They warn about a lean past 1.485 (1.1 times the lean: text softens and the product loses its context) and about a spot that asks for a ring (ignored).

`dolly studio <project> <clip> --text` prints a spec as a shot list, with the take's beats on the same timeline. The Studio also flags a camera moving during a beat, a final hold under 0.8s, and a lean that upscales the master.

## The grammar

Every clip follows one direction. Its numbers live in `engine/camera/grammar.mjs` and nowhere else; scenarios read them from `h.grammar`, and `direction` shots follow them.

1. **Establish.** Hold wide long enough to take the page in: at least `ESTABLISH`, 0.8s.
2. **Lean in.** Spring to `LEAN_Z`, 1.35, on the spot where the change will happen. The move takes `SPRING`, 1.2s, on a critically damped spring (no bounce). It has come to rest `SETTLE`, 0.35s, before the change starts.
3. **Let it play.** The camera stays still while the product changes.
4. **Pull back and hold.** Spring back to wide once the change is done (1.2s), and hold, so the finished state is seen in context.

Two subjects too close together for a pull back and a new lean get a hop: straight across in `HOP`, 0.6s or more, with the wash crossfading so it never lifts between them. A shot's wash comes up 0.15s before the lean settles and fades as the camera pulls back.

| Constant | Value | |
| --- | --- | --- |
| `LEAN_Z` | 1.35 | how far a lean goes in |
| `SPRING` | 1.2s | a lean or a pull back |
| `HOP` | 0.6s | the shortest hop between two nearby subjects |
| `SETTLE` | 0.35s | how long a lean rests before its change |
| `ESTABLISH` | 0.8s | the shortest wide hold that reads as the whole page |
| `FOCUS_FILL` | 0.92 | the most of the frame a focus box may fill |
| `WASH`, `WASH_ALPHA` | rgb(245, 239, 230), 0.72 | the wash's colour and strength |
| `SPOT_RADIUS` | 6 | the wash's corner radius, CSS px |

Why 1.35: it is as far as a lean can go before text softens and the product loses the context around the change. There is no cursor: the only trace of the hand is what it lights up in the product, and when.

## Sharpness

A lean crops the master. At 1.35 on a 2880-wide master delivered at 1920, the crop is 2133 master pixels wide: still more than one master pixel per delivered pixel, so the lean stays sharp. Record at 2x (a retina display) for this to hold. The Studio reports the tightest lean's ratio, and warns when it drops below 1.
