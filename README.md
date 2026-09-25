# Dolly

Film your real product. Then direct the camera.

Dolly records a web product the way a person would use it, minus the cursor, and then points a camera at the take: it holds wide, leans in where the change happens, keeps still while it plays, and pulls back to show the result. Out comes a web-ready MP4 and its poster.

<!-- DEMO PLACEHOLDER: Dolly's launch video goes here, directed in Dolly. It does not exist yet. -->
> **Demo:** Dolly's launch video will go here. It is being directed in Dolly, and it has not been shot yet.

## What it does

1. **Records.** A short script, the scenario, plays your running product in a real Chrome window parked off screen, at a human pace. No cursor, no screen recorder, no retakes by hand: the hand is seeded, so every take repeats.
2. **Directs.** Dolly turns the moments the scenario marked into camera moves. You watch them over the real take in the Studio and adjust anything by eye.
3. **Ships.** One command renders the clip at retina sharpness, another copies it into your site.

That's the whole tool. The camera follows one grammar, so every clip moves the same way.

## Install

| | |
| --- | --- |
| npm | `npm install -g @nischalskanda/dolly` |
| pnpm | `pnpm add -g @nischalskanda/dolly` |
| yarn | `yarn global add @nischalskanda/dolly` (Yarn 1; on Yarn 2+, use `yarn dlx @nischalskanda/dolly`) |
| bun | `bun add -g @nischalskanda/dolly` |

Or try it without installing: `npx @nischalskanda/dolly doctor`.

### What it needs

- **Node 22** or newer
- **Google Chrome**, the one you already have. Dolly never downloads a browser. To use another Chrome binary, set `DOLLY_CHROME` to its path.
- **ffmpeg** (with libx264) and **cwebp**. On macOS: `brew install ffmpeg webp`.
- **A display.** A take plays in a real window off screen. A retina display gives you 2x masters, which keep leans sharp.

`dolly doctor` checks all of it and prints the exact command for anything missing.

## Quick start

```sh
mkdir clips && cd clips
dolly init                                        # this folder is now a workspace
dolly init shop --from ~/code/shop                # add a product: Dolly reads its package.json
dolly inspect shop /settings                      # the page's controls, their boxes, and a screenshot
$EDITOR projects/shop/scenarios/shop-first.mjs    # what the hand does, and where the camera leans
dolly record shop shop-first                      # record a take in the real product
dolly studio shop shop-first                      # watch the camera over it, direct it, render it
dolly deliver shop shop-first                     # copy the clip into your site
```

Dolly starts the product's dev server when it needs it and stops it afterwards. Your clips live in the workspace, beside your products: Dolly only ever reads a product's repo, and writes into your site only when you run `dolly deliver`.

## Two ways to work

### On your own: the Studio

`dolly studio <project> [clip]` opens the Studio at `http://localhost:4800`. It plays the real take through the camera live, with the same code the renderer uses, so what you see is what renders.

- The clip reads as a shot list: establish, lean in, hold, pull back. Each shot shows the real frame it will show. Open one and it plays on repeat, and every change replays it.
- Retime by dragging the edge between two shots on the film strip. Edges snap to the take's beats; hold Shift to drag freely.
- Frame a shot by dragging its frame over the picture, or pick a box the take measured by name.
- If a move runs through a change, or past a beat, a note says so and offers the fix in one click.
- **Save** writes the clip's camera. **Render** makes the clip and shows it beside the preview. A camera you saved stays yours: recording again keeps it.

### With an agent: the CLI and the skill

Every step is a command, so any coding agent that can run a shell can drive Dolly. Scenarios are code, and agents write most of them. `skill/SKILL.md` tells an agent when to reach for Dolly and how to get from "a clip of the settings page" to a take ready for you to direct. For Claude Code:

```sh
ln -s "$(npm root -g)/@nischalskanda/dolly/skill" ~/.claude/skills/dolly
```

The agent records and checks the take; you direct it in the Studio. More in [docs/agents.md](docs/agents.md).

## Prompts to copy

Paste one into your agent's session.

**A first clip**
> Record a clip of the settings page with Dolly: switch the theme to dark and let the change play. Add the product to my Dolly workspace if it is not there yet, then give me the Studio command so I can direct it.

**The product changed**
> The billing page changed. Re-record every Dolly clip that shows it, check that each camera still sits on the change, render them, and show me which delivered files differ before you replace them.

**Fix the poster**
> The poster for `shop-first` shows the menu half open. Make the poster the finished state.

**Lean somewhere else**
> In `shop-first` the camera leans in on the whole page. Lean in on the row that changes instead, and keep the wash on that row alone.

**Cut the wait**
> The upload clip spends four seconds on a spinner. Cut the wait out with a crossfade, and keep the moment it finishes.

## How it fits together

```
 scenario            take                    camera                  clip + poster          your site
 scenarios/*.mjs ─▶  masters/<p>/<clip>.mp4 ─▶ cameras/<clip>       ─▶ out/<p>/<clip>.mp4  ─▶ the folder
 what the hand does  and its .take.json       .camera.json            and -poster.webp       project.json names
               record                   direct   ▲              render                deliver
                                                 │
                                    dolly studio: watch, direct, Save, Render
```

Each stage re-runs from what the last one wrote, so you can re-direct or re-render without recording again. For the whole story in plain words, read [How Dolly works](docs/how-it-works.md).

## Commands

| Command | What it does |
| --- | --- |
| `dolly init [project]` | make a workspace, or add a product to it (`--from`, `--base`, `--port`, `--alias`) |
| `dolly doctor [project]` | check this machine has what Dolly needs |
| `dolly inspect <project> [path]` | list a page's controls and their boxes, with a screenshot |
| `dolly record <project> <clip...>` | record a take and build its camera (`--takes N`, `--render`, `--redirect`, `--query k=v`) |
| `dolly studio <project> [clip]` | open the Studio (`--open`, `--port N`), or print shot lists (`--text`) |
| `dolly render <project> [clip...]` | render clips and their posters into `out/` |
| `dolly deliver <project> [clip...]` | copy renders to the folder they ship from (`--yes` to replace, `--stills`) |
| `dolly list [project]` | show the projects, their clips and where each stands |
| `dolly direct <project> [clip...]` | rebuild cameras from saved takes (`--redirect` for Studio cameras too) |
| `dolly poster <project> <clip> --at S` | take the poster from one moment |
| `dolly stills <project> [name]` | shoot the project's stills |

Clips are names or globs (`'settings-*'`). Every command works in the nearest `dolly.json`, or the one `--workspace DIR` names. `dolly help <command>` shows a command's flags and examples. `dolly storyboard` still works as another name for `dolly studio`.

## The camera grammar

Every clip follows one direction, with its numbers in one place (`engine/camera/grammar.mjs`):

1. **Establish.** Hold wide for at least 0.8s.
2. **Lean in.** Spring to 1.35x on the spot where the change will happen: 1.2s, zero bounce, settled 0.35s before the change starts.
3. **Let it play.** The camera keeps still while the product changes.
4. **Pull back and hold.** Spring back to wide and hold, so the result is seen in context.

The spotlight is a wash: a warm paper colour at 72% over everything but the subject. There is no ring and no cursor. See [docs/camera.md](docs/camera.md).

## Docs

- [How Dolly works](docs/how-it-works.md): the whole idea, in plain words
- [Scenarios](docs/scenarios.md): writing the take: `h`, the hand, `meta`, `direction`
- [The camera](docs/camera.md): the camera file, its keyframes, washes and cuts, and the grammar
- [Workflow](docs/workflow.md): what each stage reads and writes, and re-cutting after a product change
- [Workspaces](docs/workspaces.md): `dolly.json`, `project.json`, hooks and stills
- [Agents](docs/agents.md): the skill, what an agent does, prompts

## From Node

The package exports the same pipeline the CLI runs:

```js
import { loadWorkspace, loadProject, loadClip, record, direct, render } from '@nischalskanda/dolly';

const project = await loadProject(loadWorkspace(), 'shop');
const clip = await loadClip(project, 'shop-first');
await record(project, clip);
await direct(project, clip);
await render(project, clip);
```

## When something goes wrong

Every error says what happened and what to run next. `dolly doctor` is the place to start. Set `DOLLY_DEBUG=1` to see the stack behind an error.

## Develop

```sh
npm install
npm run check    # lint and tests
```

Keep each pull request to one change, and keep `npm run check` green.

## License

MIT
