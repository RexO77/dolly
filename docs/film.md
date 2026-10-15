# Launch films

Dolly makes two kinds of video from the same takes, and judges each by its own rules.

| | Demo mode | Launch mode |
| --- | --- | --- |
| What it is | A clip of the product working: flat, legible, the whole screen in view | A film of hero shots: the UI floating in black, tilted, a thin band in focus |
| For | Docs, READMEs, case studies, onboarding | Launch posts, landing page heroes, feature trailers |
| Camera | Establish wide, lean in to 1.35, hold still, pull back | Steep close-ups at 2 to 6 times, a slow drift, hard cuts on the action |
| Light | A warm wash over everything but the subject | A pool of light on the subject, falling off into black |
| Frame rate | 30 fps | 24 fps, with motion blur and fine grain |
| Ends | On the product | On one line of copy, then a still logo |
| Command | `dolly render` | `dolly film` |
| Judged on | The camera notes (soft leans, moves through a change) | A film still's checklist (below) |

## Record a launch take

A launch film's close-ups magnify the UI up to six times, so the take needs the pixels for it, and enough frames for smooth 24 fps at that size. Give the scenario its own meta:

```js
export const meta = {
  viewport: { dpr: 4 },   // render the page at 4x, whatever the display
  colorScheme: 'dark',    // a dark slab in a black void; use the product's dark mode
  slow: 4,                // record in slow motion, played back at speed: 4x the frames
};
```

`slow` runs the product four times slower while it is filmed (its CSS animations, its timers and the hand all slow together), then plays the master back at speed. A 5760-wide take then has about 38 frames a second where things move.

Mark a box for everything a shot might look at, with `h.box`, `h.boxCss`, or `h.boxCss(name, await h.boxOf(selector))`.

## Write the film

Export `film` from the scenario: the beats to cut on, and what each shot looks at.

```js
export const film = {
  shots: [
    { on: 'filter', subject: 'chip', lead: 0.7 },
    { on: 'open', subject: 'list', lead: 2.2, length: 3 },
    { on: 'opened', subject: 'issue', length: 2.8, rack: [{ at: 1.7, to: 'status' }] },
    { on: 'pick', subject: 'menu', lead: 0.8, length: 3 },
    { on: 'done', wide: true },
    { on: 'done', subject: 'toast', lead: -1.2, length: 2.4 },
  ],
  ending: { copy: 'Wrenly.', tagline: 'Ship the week.', logo: 'app/mark.svg', name: 'Wrenly' },
};
```

| Key | What it does |
| --- | --- |
| `on` | the beat the shot cuts on; it cuts in `lead` seconds before it (0.6 by default), so the action starts just after the cut |
| `subject` | a box the take measured, by name, or a rect: what is in focus and lit |
| `wide` | the payoff: the film's one wide shot, near-frontal, the whole window |
| `length` | seconds; by default 2.4 for an accent on a small subject, 3.2 for a look at a bigger one, 3.6 for the payoff |
| `scale` | `extreme`, `macro`, `medium` or `wide`; by default from the subject's size |
| `rack` | `[{at, to}]`: slide focus (and the light, a beat later) to another subject, `at` seconds into the shot |
| `diagonal` | `1` or `-1`, the way text runs across the frame; it flips on every cut by default |
| `track`, `push`, `turn` | the drift: how far it travels (a share of the frame width), how much it pushes in, how far it turns |

`ending` sets one line (`copy` and `tagline`) on black, then the logo: `logo` (a path from the workspace, drawn in plain white) and `name` beside it.

## Make it

```bash
dolly record shop shop-launch
dolly film shop shop-launch --judge
dolly film shop shop-launch
```

`dolly film` writes the shots to `films/<clip>.film.json`, where you can edit them, renders `out/<clip>-film.mp4` and its poster (from the payoff), and judges the film. `--judge` only judges, which is quick: it renders each shot's middle frame.

## The judge

Each shot's middle frame is measured like a frame grab from a film, and the cut is read like an edit:

- the frame is dark: its average light between 1% and 8%, with at least 60% of it black (the wide shot is exempt);
- something in it is sharp, but not too much: one subject, not a screenshot, and not scattered;
- its text is sharp: the take has enough pixels behind each film pixel at the subject;
- something happens in it: a beat falls inside the shot (the close-up after the payoff may hold still);
- consecutive shots differ in scale or diagonal, and two short accents never come back to back;
- there is one wide shot, and it comes in the second half, as the payoff.

The thresholds were measured on a reference launch film, not guessed: its frames average 0.4% to 7% light, with 70% to 98% of the frame black.

## Where the numbers live

Every number behind the look is in `engine/film/grammar.mjs`: the scales, the depth of field, the light, the drift, the shot lengths, the grade, the ending and the judge.
