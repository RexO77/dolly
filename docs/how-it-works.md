# How Dolly works

This page follows one clip from nothing to a video playing on a website. No video or browser know-how needed. If you can read a recipe, you can read this.

## What Dolly is

Dolly makes short, sharp videos of a real web product. It plays your product the way a person would, minus the mouse pointer, then moves a camera over the recording to lean in on the part that changes.

It does three things:

| | What happens |
| --- | --- |
| **Film** | Dolly opens your product in Chrome and records it while a script clicks and types. |
| **Direct** | Dolly decides where the camera looks and when: wide, lean in, hold still, pull back. |
| **Render** | Dolly turns the recording and the camera into a video file and a still image for your site. |

Each step saves a file, and the next step starts from that file. So you can change the camera without recording again, or render again without touching anything else.

```
  your product --record--> master --direct--> camera --render--> clip --deliver--> your site
                           (raw video)        (where to look)    (.mp4 + poster)
```

## Two folders: the tool and your workspace

One you install and forget, one you keep.

**The tool** is Dolly itself. You install it once (`npm install -g @nischalskanda/dolly`) and never put anything in it.

**Your workspace** is a folder you choose, where your clips live. It sits beside your products, never inside one. Dolly only ever reads your product's code; it never writes into it.

```
clips/                               your workspace
  dolly.json                         marks this folder as a workspace
  projects/
    shop/                            one folder per product (keep this in git)
      project.json                   where the product runs, how to start it
      scenarios/shop-first.mjs       the script for one clip
      cameras/shop-first.camera.json the camera for that clip
  masters/
    shop/
      shop-first.mp4                 the raw recording (large)
      shop-first.take.json           what was measured during it
      .history/                      older recordings, never deleted
  out/
    shop/
      shop-first.mp4                 the finished clip
      shop-first-poster.webp         its still image
  .dolly/                            scratch space Dolly can rebuild
```

| Folder | What it holds | Keep it? |
| --- | --- | --- |
| `projects/` | everything needed to make the clips again: settings, scripts, cameras | yes, in git |
| `masters/` | raw recordings, big files | on disk (git ignores them) |
| `out/` | finished videos and posters | rebuilt any time |
| `.dolly/` | temporary frames, logs, preview files | safe to delete |

Dolly finds your workspace by looking for `dolly.json` in the folder you are in, then in each folder above it.

## Starting up

### Make a workspace

```sh
mkdir clips && cd clips
dolly init
```

This writes `dolly.json`, an empty `projects/` folder and a `.gitignore` that leaves out the large files.

### Add a product

```sh
dolly init shop --from ~/code/shop
```

Dolly reads the product's `package.json` to work out how it runs: which script starts it (`dev`, or else `start`, `develop` or `serve`), which framework it uses (Vite, Next.js, Astro, SvelteKit or Create React App), which package manager (from the lockfile) and which port it serves on. It prints what it found and why, and asks on the terminal for anything it cannot tell.

Then it writes `projects/shop/project.json`, a first script to edit, and an empty `cameras/` folder. The important parts of `project.json` are:

```json
{
  "name": "shop",
  "base": "http://localhost:5173",
  "start": { "cwd": "~/code/shop", "cmd": "npm run dev -- --port 5173 --strictPort" },
  "viewport": { "width": 1440, "height": 900, "dpr": 2 },
  "deliver": { "default": "~/code/site/public/media/shop" }
}
```

| Key | In plain words |
| --- | --- |
| `base` | the address where the product answers |
| `start` | the folder and the command that start it. If nothing answers at `base`, Dolly runs this, and stops it again when it is done. Leave it out and you start the product yourself. |
| `viewport` | the size of the browser window, in normal (CSS) pixels. `dpr: 2` means a retina screen, where each normal pixel is 2 by 2 real pixels. |
| `deliver` | the folder on your site where finished clips are copied. `dolly init` leaves this empty; fill it in before you deliver. |

### Check the machine

```sh
dolly doctor
```

Dolly needs Node 22 or newer, ffmpeg (a video tool) built with H.264 support, cwebp (makes WebP images) and Google Chrome. `doctor` checks each one and prints the exact command to fix anything missing, for example `brew install ffmpeg webp` on a Mac. It also says whether each product is running. Dolly uses the Chrome you already have and never downloads a browser.

## A scenario: the script for one clip

A scenario is a small file that says what an invisible hand does in your product. Think of it as stage directions. The file name is the clip's name: `scenarios/shop-first.mjs` makes the clip `shop-first`. Everything the script needs arrives on `h` (short for helpers), so it needs no setup of its own.

It has two parts that run at different times:

| Part | When it runs | Filmed? | Use it to |
| --- | --- | --- | --- |
| `setup(h)` | after the page loads, before recording starts | no | get the page ready: close a banner, wait for data |
| the take (the default export) | while recording | yes | the thing the clip shows: glide, click, type |

While the take plays, the script leaves two kinds of markers for the camera:

- **Beats** are named moments: `h.beat('change')` means "the change starts now". The camera is timed from beats.
- **Boxes** are named areas on screen: `h.box('panel', 'main')` measures where the `main` element is. The camera leans in on boxes.

Here is a small scenario. It opens the settings page, presses "Dark", and asks for one lean in on the part that changes:

```js
export const meta = { url: '/settings' };            // the page to open

export default async function scenario(h) {
  await h.until(2.0);                                // wait until 2.0 seconds into the clip
  await h.click('text=Dark');                        // the hand glides to "Dark" and presses it
  h.beat('change');                                  // a beat: the change starts now
  await h.until(4.0);
  h.beat('done');                                    // a beat: the change has finished
  await h.box('panel', 'main');                      // a box: the area to lean in on
  await h.until(6.1);                                // keep filming through the pull back
}

export const direction = { shots: [{ box: 'panel', from: 'change', to: 'done' }] };
```

`direction` is the camera, said as shots: "lean in on `panel` from beat `change` to beat `done`". Dolly turns that into exact camera moves later. Times like `2.0` are seconds on the clip's own clock, from its first frame.

`dolly init` writes a fuller starting script from `templates/scenario.mjs`, with comments that lay it out like a shot list. `dolly inspect shop /settings` lists the buttons and areas on a page, with their positions and a screenshot, so you know what to name. The full list of helpers is in [scenarios.md](scenarios.md).

## Recording

```sh
dolly record shop shop-first
```

This is what happens, in order:

1. **Start the product.** If nothing answers at `base`, Dolly runs the `start` command and waits for it. It stops it again at the end.
2. **Open Chrome.** Dolly opens a real Chrome window with a fresh, empty profile and places it off the edge of your screen, so you never see it. It needs a real display to do this (a retina display gives the sharpest result).
3. **Load the page.** It opens the scenario's page, sizes the window so the page is exactly the viewport, and waits for fonts to load.
4. **Get ready.** It runs the project's `prepare` hook if there is one, then the scenario's `setup`. Then it moves the invisible mouse into the bottom-right corner so nothing is left hovering.
5. **Record.** It asks Chrome for a picture of the page every time the page repaints, at the screen's full pixel count. On a retina screen a 1440 by 900 page comes out 2880 by 1800. These pictures show only the page, so the mouse pointer is never in them.
6. **Play the take.** It waits the lead time (0.7 seconds of stillness by default), plays the take, then keeps recording for the tail (1.4 seconds by default) so the clip ends on a still frame.
7. **Stitch.** It joins the pictures into one video at a steady 30 frames per second. This video is the **master**.
8. **Direct.** It builds the camera straight away (see below), and tells you the next command: `dolly studio shop shop-first`.

You never see the window. That is the point.

The hand is invisible, but it is real. Dolly sends real mouse moves and clicks, so hovers and presses look the way they do for a person. Glides curve gently and land softly, and a still hand drifts by a pixel. `h.hand({ seed })` makes the hand's small random wobbles repeat exactly on every take.

**What gets saved:**

| File | What it is |
| --- | --- |
| `masters/shop/shop-first.mp4` | the master: the raw recording at full size |
| `masters/shop/shop-first.take.json` | the take file: every beat and box, plus the page address, window size and the master's size, frame rate and length |

**Nothing is thrown away.** If a master already exists, Dolly first moves it and its take file into `masters/shop/.history/`, with the time in the file name.

**A bad take is refused.** If the script fails, or the product reloads while recording (for example, because someone saved a file and the dev server refreshed the page), the take is rejected. `--takes 3` lets Dolly try up to three times. When a take fails, Dolly saves a screenshot at `.dolly/shop/shop-first-failed.png` so you can see what was on screen.

## How Dolly finds the moments

Scripts are punctual. Screens are not always. The camera has to be still while the product changes, so Dolly needs to know exactly when the change shows on screen. It gets there in three layers.

**1. Beats from the script.** Each `h.beat()` records the time on the master's clock. This is usually right to within a frame or two.

**2. Beats checked against the picture.** Sometimes the screen changes a little after the script says so: an animation starts late, or the script only notices a change after it happened. The scenario can ask Dolly to look at the real pictures and fix the times:

- `sync: { beat: 'change', box: 'panel' }` finds the first frame after the beat where the `panel` area really changes, and moves every beat by the same amount.
- `resync` does the same for single beats, one at a time.

To decide what "really changes" means, Dolly shrinks every frame to a small grey picture and compares each one with the one before. If the pixels inside the box differ by more than a small amount on average, that is the change.

**3. Cutting out waits.** A spinner that runs for four seconds is dull. `cut` removes the stretch between two beats and blends across the join with a short crossfade (a quarter of a second by default). Beats after the cut move earlier to match.

```
  script says:        beat "change" at 2.71s
  picture says:       the panel first changes at 2.77s
  sync:               every beat moves 0.06s later
```

The Studio uses the same idea to draw an **activity line**: how much each frame differs from the one before, across the whole clip. Peaks are where the product moves. If a camera move crosses a peak, the Studio warns you.

## Directing

```sh
dolly direct shop shop-first
```

Directing turns the beats and boxes into a camera. `dolly record` does it for you after every take. Run `dolly direct` on its own after you change a scenario's `direction`: no new recording needed.

### The camera grammar

Every clip follows the same direction. It is deliberately plain, so your product gets the attention. Its numbers live in one file, `engine/camera/grammar.mjs`.

```
  wide ...... lean in ......... hold still ........... pull back ...... wide
  |establish| |1.2s spring|   |settled 0.35s before|  |1.2s spring|   |hold|
                              |the change, which   |
                              |plays here          |
```

1. **Establish.** Start wide and hold for at least 0.8 seconds, so the viewer sees where they are.
2. **Lean in.** Move in to about 1.35 times, centred on the box where the change will happen. The move takes 1.2 seconds and follows a spring with no bounce: quick at first, then a long, soft stop that never overshoots.
3. **Settle.** Arrive 0.35 seconds before the change starts, so the camera is already still.
4. **Let it play.** The camera does not move while the product changes.
5. **Pull back and hold.** Once the change is done (plus a short hold, 0.9 seconds by default), spring back out to wide and stay there, so the finished result is seen in context.

Why 1.35: closer than that, text starts to go soft and the viewer loses the context around the change. If a box is too big to fit at 1.35, the camera leans in less, so the box never fills more than 92% of the frame. If two shots are too close together to pull back and lean in again, the camera hops straight across instead, in at least 0.6 seconds.

### The wash

A wash is Dolly's spotlight, the kind that never shouts. It lays a soft warm tint (an off-white, `rgb(245, 239, 230)`, at 72% strength) over everything except the box that matters, with gently rounded corners. The box stays clear, so the eye goes there. The wash fades in just before the lean settles and fades out as the camera pulls back.

It is never a ring or an outline drawn around the box, and there is never a mouse pointer. The only sign of the hand is what it changes.

### The camera file

Directing writes `projects/shop/cameras/shop-first.camera.json`. It is a list of **keyframes**: points in time with a view. Between two keyframes the camera moves smoothly; two identical ones in a row make a hold.

```json
{
  "camera": [
    { "t": 0,     "wide": true },
    { "t": 1.17,  "wide": true },
    { "t": 2.37,  "focus": { "x": 0.3, "y": 0.2, "w": 0.45, "h": 0.5 } },
    { "t": 4.9,   "focus": { "x": 0.3, "y": 0.2, "w": 0.45, "h": 0.5 } },
    { "t": 6.1,   "wide": true },
    { "t": 7.5,   "wide": true }
  ],
  "spots": [
    { "x": 0.3, "y": 0.2, "w": 0.45, "h": 0.5, "in": 2.22, "out": 4.9, "fade": 0.45 }
  ]
}
```

Every position and size is a share of the screen (0.5 is halfway). Every time is in seconds. `spots` are the washes. The full format is in [camera.md](camera.md).

## The Studio

```sh
dolly studio shop shop-first
```

This opens the Studio in your browser at `http://localhost:4800`. It stays open until you press ctrl-c in the terminal. The Studio is where a person gets a say: you watch the camera over the real recording and adjust it by eye.

### What you see

| Area | What it shows |
| --- | --- |
| **The picture** | the clip as it will ship, playing live. Switch to **Framing** to see the whole screen with the camera's frame drawn on it, or to **Rendered** to watch the real rendered file beside it. |
| **The film strip** | the clip's shots laid out in time, with the beats, the activity line and the washes underneath |
| **The controls under the picture** | play, step one frame, slow motion (half and quarter speed), and a sharpness reading |
| **The shot list** | numbered shots (establish, lean in, hold, pull back), each with a real frame from the clip |

### What you can change

Open a shot and it plays on repeat. Every change you make replays it, so you see the effect at once.

| You want to change | How |
| --- | --- |
| when a shot starts and ends | drag the edge between two shots on the film strip. Edges snap to beats, and to the moment a lean should have settled before each beat. Hold Shift to drag freely. Or type the start and length. |
| what it frames | pick a box the take measured, by name, or **Adjust on the picture** and drag the frame yourself |
| how far it zooms | turn the zoom ring. It clicks into place at 1.35. |
| how it moves | Spring (the default), Smooth, or **Shape it** to draw your own curve |
| the shots themselves | **Lean in at** or **Pull back at** the playhead, or **Remove this move** |
| the washes | **Add a wash here**, choose its box, and set when it fades in and out |

### Notes with one-click fixes

The Studio reads the recording and the camera together and writes notes when something breaks the grammar. Each note comes with a button that fixes it:

| Note | Fix |
| --- | --- |
| Still moving when a beat happens | **Settle before** that beat, or for a pull back, **Pull back after** it |
| The product is changing during this move | **Settle before the change**, or **Pull back once it is still** |
| Soft: the lean goes closer than the master has pixels for | **Cap the lean** at the sharpest zoom the master allows |

It also warns when the final wide hold is shorter than 0.8 seconds.

### Save and Render

**Save** (⌘S or Ctrl+S) writes the camera file and marks it as directed in the Studio. From then on, `dolly record` and `dolly direct` keep your camera instead of rebuilding it from the script. Add `--redirect` only when you want the script's camera back. Undo and redo work as you expect.

**Render** saves, makes the real clip, then shows it next to the preview so you can compare.

### Why the preview matches the render

No guessing. The Studio runs the same camera code the renderer runs (`engine/camera/math.mjs`) to work out, for every moment, where the camera points, how far it zooms and how strong each wash is. So the moves, timing and framing you see are the ones you get. The final pixels are scaled by the renderer rather than the browser, so the rendered file can be a touch crisper than the preview.

## Rendering

```sh
dolly render shop shop-first
```

For every frame of the master, the renderer:

1. works out where the camera is at that moment,
2. crops the master to that view,
3. scales the crop down to the delivery size (1920 pixels wide by default) with a high-quality filter,
4. lays the wash over it,
5. hands the frame to the video encoder.

The result is `out/shop/shop-first.mp4`: an H.264 video with no sound, set up to start playing before it has fully downloaded. The poster, `out/shop/shop-first-poster.webp`, is a 1440-wide still image. By default it is the last frame: the finished result, held wide. Set `meta.poster` in the scenario to pick another moment, or run `dolly poster shop shop-first --at 3.2` for a one-off.

### Why it stays sharp

The master is recorded at twice the pixels of the page. A lean in crops it, but there are still more real pixels than the delivered video needs:

```
  master                        2880 px wide
  lean in at 1.35 crops it to   2133 px wide
  the delivered clip is         1920 px wide
```

2133 is more than 1920, so every delivered pixel comes from real recorded pixels, and nothing is blown up. This is why Dolly records on a retina display. On a normal display the master is only 1440 wide and a lean goes soft; the Studio shows this as "Soft here" under the picture.

## Delivering and playing it on a site

```sh
dolly deliver shop shop-first
```

This copies the clip and its poster into the folder `project.json` names under `deliver`. Dolly never writes into your site any other way.

Files already in that folder may be live on your site, so Dolly is polite about it. An identical file is left alone. A different file is **kept** and listed, not replaced, until you run the command again with `--yes`.

Then put the clip on a page:

```html
<video
  src="/media/shop/shop-first.mp4"
  poster="/media/shop/shop-first-poster.webp"
  width="1920" height="1200"
  autoplay muted loop playsinline>
</video>
```

| Attribute | Why |
| --- | --- |
| `autoplay` | starts on its own |
| `muted` | browsers only autoplay silent video, and Dolly's clips have no sound anyway |
| `loop` | plays again from the start |
| `playsinline` | plays in the page on phones instead of going full screen |
| `poster` | shows the finished state before the video loads |
| `width`, `height` | reserves the right space so the page does not jump; the clip's height follows the master's shape (1920 by 1200 for a 1440 by 900 page) |

## Agents

Let the agent do the typing. You do the looking. Dolly is built so an AI coding agent can do the fiddly parts for you. Every step is a `dolly` command, so any agent that can run a terminal can use it.

`skill/SKILL.md` is a short guide the agent reads. It tells the agent when to reach for Dolly (a README, case study or site needs real product footage; a clip must be redone because the product changed; a poster or camera is wrong) and the steps for each. To install it for Claude Code:

```sh
ln -s "$(npm root -g)/@nischalskanda/dolly/skill" ~/.claude/skills/dolly
```

Then you can ask in plain words, for example: "Record a clip of the settings page with Dolly: switch the theme to dark and let the change play."

The work splits like this:

```
  the agent (code)                           you (judgement)
  ------------------------------------       -------------------------------
  find or make the workspace
  dolly doctor, and fix what it reports
  dolly init: add the product
  dolly inspect: find buttons and areas
  write the scenario
  dolly record, until the take passes
  dolly studio --text: check beats      -->  dolly studio: watch, adjust,
                                             Save, Render
  dolly render and dolly deliver        <--  when you say so
  (replaces a delivered file only on your word)
```

`dolly studio shop shop-first --text` prints the camera as a shot list with the beats on the same timeline, so the agent can check that every beat lands while the camera is still. More in [agents.md](agents.md).

## Cheat sheet

| Command | What it does | When to use it |
| --- | --- | --- |
| `dolly init` | makes the current folder a workspace | once, in the folder for your clips |
| `dolly init <product> --from <repo>` | adds a product: writes `project.json` and a first scenario | once per product |
| `dolly doctor` | checks Node, Chrome, ffmpeg, cwebp and your products | first, and whenever something will not run |
| `dolly inspect <product> [page]` | lists a page's buttons and areas with their positions, plus a screenshot | before writing a scenario |
| `dolly list [product]` | shows every clip and where it stands (recorded, rendered, out of date) | to see what needs doing |
| `dolly record <product> <clip>` | records a take and builds its camera | after writing or changing a scenario, or when the product changed |
| `dolly studio <product> [clip]` | opens the Studio to watch, adjust, Save and Render | to direct a clip by eye |
| `dolly studio <product> <clip> --text` | prints the camera as a shot list | a quick check in the terminal |
| `dolly direct <product> [clip]` | rebuilds the camera from the saved take | after changing a scenario's `direction` |
| `dolly render <product> [clip]` | makes the final video and poster in `out/` | when the camera is right |
| `dolly poster <product> <clip> --at S` | remakes only the poster, from S seconds in | when the poster shows the wrong moment |
| `dolly deliver <product> [clip]` | copies the clip and poster to your site's folder (`--yes` to replace) | when it is ready to ship |
| `dolly stills <product>` | takes still screenshots listed in the project's `stills.mjs` | for images, not video |
| `dolly help <command>` | lists a command's options | any time |
