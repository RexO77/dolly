# CLAUDE.md

Dolly records a real web product in a real Chrome window parked off screen, with no cursor, then directs a camera over the take (lean in, hold, pull back, a wash spotlight) and renders a web-ready clip. It is published as `@nischalskanda/dolly` (MIT, public), and the command is `dolly`.

`PLAN.md` holds the current plan, its workstreams and their acceptance checks. Tick a check there when it passes.

## Layout

- `engine/` the engine: recording (`record`, `capture`, `browser`, `input` for `h`, `hand`, `motion`), directing (`direct`, `retime`, `camera/`), rendering (`render`, `ffmpeg`), files and delivery (`files`), the Studio's server (`studio.mjs`). `engine/index.mjs` is the documented public API.
- `engine/camera/` the camera: `math.mjs` (where the view is at any time), `grammar.mjs` (the grammar's numbers, the frame's too), `card.mjs` (where the frame's card sits: flat, no perspective), `compose.mjs` (the card on its background), `resample.mjs` (Pillow-exact Lanczos), `frame.mjs` (one delivered frame). Pure modules: the Studio runs `math.mjs`, `grammar.mjs` and `card.mjs` in the browser.
- `cli/` the `dolly` command: `index.mjs` dispatches, one module per command in `cli/commands/` exporting `usage`, `summary`, optional `flags`, `details`, `examples` and `aliases`, and a default function.
- `studio/` the Studio (`dolly studio`, alias `storyboard`): React and Motion, built with Vite into `studio/dist` (shipped; run `npm run build:studio`). `src/model/` is framework-free (the clip, its edits, verbs and fixes; the transport and drawing) and imports the engine's camera modules directly; `src/ui/` holds Dolly's controls (the lens barrel, `sound.js` for the Studio's Web Audio sounds); `src/parts/` the screen; `src/styles/tokens.css` the visual system. Work on it live with `dolly studio <p> --dev`.
- `site/` the landing page (Vite, built to `site/dist`, deployed to GitHub Pages), and `examples/demo/` a workspace with Wrenly, a fictional product the site's clips are recorded from.
- The scripts Dolly was ported from are not part of this repo.

## Workspaces

A user's clips never live in this repo. They live in a workspace: a folder with a `dolly.json`, found from the current folder upwards (or `--workspace`, or `DOLLY_WORKSPACE`), holding `projects/<product>/` (`project.json`, `scenarios/`, `cameras/`), `masters/`, `out/` and `.dolly/` scratch. The owner's own workspace is `~/Programming/dolly-clips`.

## Ground rules

- The camera grammar is the owner's direction, not a default: establish wide, lean in to about 1.35 on a zero-bounce spring, settle, let the change play with the camera still, pull back and hold. No cursor. A wash-only spotlight, never a ring. Its numbers live only in `engine/camera/grammar.mjs`.
- The preview must match the render. Anything the Studio shows about the camera comes from `engine/camera/math.mjs`, the module the renderer uses. The resampler is byte-identical to Pillow (so the render of `rec-walk` matches the legacy `camera.py` byte for byte); keep it that way (`test/resample.test.mjs` checks the resampler against a Pillow fixture).
- The Studio's look is Night (chosen 2026-09-25, in the spirit of rows.gg): dark first whatever the system says, paper and ink tones with depth from tone steps, Hanken Grotesk and DM Mono bundled, the footage lighting the room, the wash as the accent. Colour only where it means something: the wash and notes. Light is a choice the person makes.
- Masters are never deleted. A new take moves the previous master into `masters/<product>/.history/`.
- Nothing writes into a product repo or a site except `dolly deliver`, into the folder a project names, and it never replaces a differing file without `--yes`.
- Scenarios import nothing: everything they need is on `h` (`h.sleep`, `h.ease`, `h.seeded`, `h.grammar`), so they run from any workspace.
- Dolly uses the installed Google Chrome (`channel: 'chrome'`, or `DOLLY_CHROME`) and never downloads a browser.
- Commit messages and PRs are written in the owner's voice, with no model attribution of any kind.
- No em-dashes in anything authored here (copy, comments, docs). Use a colon, a period or a comma.
- The Studio and the site follow Interface Craft: the storyboard pattern for motion, live controls, and a Design Critique pass before anything visual ships. Dolly's UI is its own: never copy another tool's components or look (the owner does not want Dolly read as a copy).

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `RexO77/dolly`, through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the root, made when a term or decision is settled. See `docs/agents/domain.md`. (`docs/agents.md`, beside that folder, is the guide for agents using Dolly, not these skills.)
