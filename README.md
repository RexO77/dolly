# Dolly

Film your real product, then direct the camera.

Dolly records a web product in an off-screen Chrome at retina resolution, with no cursor, while a scripted hand plays it at a human pace. Afterwards it directs a camera over the take: it holds wide, leans in where the change happens, stays still while the change plays, and pulls back to hold on the result. You get a web-ready MP4 and its poster.

<!-- DEMO PLACEHOLDER: Dolly's launch video goes here, directed in Dolly. It does not exist yet. -->
> **Demo:** the launch video will go here. It will be directed in Dolly, and it has not been shot yet.

## Install

| | |
| --- | --- |
| npm | `npm install -g @nischalskanda/dolly` |
| pnpm | `pnpm add -g @nischalskanda/dolly` |
| yarn | `yarn global add @nischalskanda/dolly` (Yarn 1; with Yarn 2+, `yarn dlx @nischalskanda/dolly`) |
| bun | `bun add -g @nischalskanda/dolly` |

Or run it once without installing it: `npx @nischalskanda/dolly doctor`.

Dolly needs Node 22+, ffmpeg (with libx264), cwebp and Google Chrome. It never downloads a browser: it uses your installed Chrome, or the binary `DOLLY_CHROME` names. `dolly doctor` checks each one and prints the fix for anything missing (on macOS: `brew install ffmpeg webp`). A take runs in a real Chrome window parked off screen, so record on a machine with a display. A retina display gives you 2x masters.

## Quick start

```sh
mkdir clips && cd clips
dolly init                                   # this folder becomes a workspace
dolly init shop --from ~/code/shop           # add a product: reads its package.json, writes project.json and a first scenario
dolly inspect shop /settings                 # the page's controls with their boxes, and a screenshot
$EDITOR projects/shop/scenarios/shop-first.mjs   # what the hand does, and where the camera leans
dolly record shop shop-first                 # a take in the real product, and its camera
dolly storyboard shop shop-first             # watch the camera over the take, direct it, render it
dolly render shop shop-first                 # or render from the command line: out/shop/shop-first.mp4 and its poster
dolly deliver shop shop-first                # copy the clip into the folder project.json names
```

Dolly starts the product's dev server when it needs it and stops it afterwards. A workspace lives beside your products, never inside one: Dolly only reads a product's repo.

## For humans: the Studio

`dolly storyboard <project> [clip]` opens the Studio at `http://localhost:4800`. It plays the real take through the camera live, running the same camera code the renderer uses, so what you see is what renders.

- The clip reads as a shot list: numbered shots (establish, lean in, hold, pull back), each with the real frame it will show. Open a shot and it plays on repeat; every change you make replays it.
- Retime on the film strip under the picture: drag the edge between two shots. Edges snap to the take's beats, and to the point a lean has settled before each one; hold Shift to drag freely.
- Frame a shot by dragging its framing over the whole screen (**Framing**), or pick a box the take measured by name. Zoom turns like a lens ring, with a detent at the lean.
- Beneath the strip, what the product is doing, read off the take. A move that runs through a change, or past a beat, gets a note with a fix: one click settles the lean before it, or holds the pull back until it is done.
- **Save** writes the clip's camera file. **Render** makes the clip and its poster, then shows it beside the preview to compare.
- A camera you saved in the Studio is kept when the clip is recorded again; `dolly record` and `dolly direct` rebuild it only with `--redirect`.

`dolly storyboard <project> <clip> --text` prints the same storyboard as a shot list.

## For agents: the CLI and the skill

Every step is a command, and the commands are what an agent uses. Scenarios are code, and agents write most of them. `skill/SKILL.md` tells an agent when to reach for Dolly and how to go from "a clip of the settings page" to a take ready for you to direct. Install it the way your agent loads skills, for example:

```sh
ln -s "$(npm root -g)/@nischalskanda/dolly/skill" ~/.claude/skills/dolly
```

The agent records and checks the take. You direct it in the Studio. See [docs/agents.md](docs/agents.md).

## Prompts

Copy one into your agent's session.

**A first clip**
> Record a clip of the settings page with Dolly: switch the theme to dark and let the change play. Add the product to my Dolly workspace if it is not there yet, then give me the storyboard command so I can direct it.

**Re-cut after the product changed**
> The billing page changed. Re-record every Dolly clip that shows it, check that each camera still sits on the change, render them, and show me which delivered files differ before you replace them.

**Fix the poster**
> The poster for `shop-first` shows the menu half open. Make the poster the finished state.

**Lean somewhere else**
> In `shop-first`, the camera leans in on the whole page. Lean in on the row that changes instead, and keep the wash on that row alone.

**Cut the wait**
> The upload clip spends four seconds on a spinner. Cut the wait out with a crossfade, and keep the moment it finishes.

## How it works

```
 scenario            take                  camera                clip + poster          your site
 scenarios/*.mjs ─▶  masters/<p>/<clip>  ─▶ cameras/<clip>     ─▶ out/<p>/<clip>.mp4  ─▶ the folder in
 what the hand does   .mp4, .take.json      .camera.json          <clip>-poster.webp     project.json "deliver"
                record                 direct   ▲            render                deliver
                                                │
                                   dolly storyboard: watch, direct, Save, Render
```

A **scenario** is a module: `meta`, an optional `setup`, a default function that plays the product through `h`, and a `direction` for the camera. **Record** runs it and keeps the raw take (the master) with its beats and boxes. **Direct** turns the beats and boxes into a camera spec. **Render** runs every frame of the master through that camera. **Deliver** copies the result where it ships. Each stage re-runs from what the last one wrote, so you can re-direct or re-render without recording again.

## Commands

| Command | Does |
| --- | --- |
| `dolly init [project]` | make this folder a workspace, or add a product (`--from`, `--base`, `--port`, `--alias`) |
| `dolly list [project]` | projects, their clips, and where each stands |
| `dolly record <project> <clip...>` | record a take and rebuild its camera (`--render`, `--takes N`, `--query k=v`) |
| `dolly storyboard <project> [clip]` | the Studio (`--port N`, `--open`, `--text`) |
| `dolly direct <project> [clip...]` | rebuild camera files from the saved takes (`--redirect` to rebuild Studio cameras too) |
| `dolly render <project> [clip...]` | master through camera, to `out/`: the clip and its poster |
| `dolly poster <project> <clip> --at S` | the poster from S seconds into the clip |
| `dolly deliver <project> [clip...]` | copy renders to the project's deliver folder (`--yes` to replace, `--stills`) |
| `dolly stills <project> [filter]` | shoot the project's stills |
| `dolly inspect <project> [path]` | a page's controls with their boxes, and a screenshot |
| `dolly doctor [project]` | check Node, Chrome, ffmpeg, cwebp and the dev servers |

Clips are names or globs (`'sb-feat-*'`). Every command runs against the nearest `dolly.json`, or `--workspace DIR`. `dolly help <command>` lists a command's flags.

## The camera grammar

One grammar for every clip, with its numbers in one place (`engine/camera/grammar.mjs`):

1. **Establish.** Hold wide for at least 0.8s.
2. **Lean in.** Spring to 1.35 on the spot where the change will happen: 1.2s, zero bounce. Settle 0.35s before the change starts.
3. **Let it play.** The camera stays still while the product changes.
4. **Pull back and hold.** Spring back to wide and hold, so the finished state is seen in context.

Two nearby subjects get a 0.6s hop instead of a pull back and a new lean. The spotlight is a wash: the page's warm ground at 72% over everything but the subject, corners rounded to 6px. There is no ring and no cursor. A focus box fills at most 92% of the frame. See [docs/camera.md](docs/camera.md).

## Docs

- [Scenarios](docs/scenarios.md): the `h` API, the hand, `meta`, `setup`, `direction`, `camera(take, tools)`
- [The camera](docs/camera.md): the spec format, keyframes, washes, cuts, the grammar
- [Workflow](docs/workflow.md): record, storyboard, render, poster, deliver, re-cutting after a product change
- [Workspaces](docs/workspaces.md): `dolly.json`, `project.json`, hooks, stills
- [Agents](docs/agents.md): the skill, the agent's workflow, prompts

## Develop

```sh
npm install
npm run check    # lint and tests
```

Keep each pull request to one change, and keep `npm run check` green.

## License

MIT
