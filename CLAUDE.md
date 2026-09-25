# CLAUDE.md

Dolly records a real web product in headless-looking Chrome with no cursor, then directs a camera over the take (lean in, hold, pull back, a wash spotlight) and renders a web-ready clip. It is published as `@nischalskanda/dolly` (MIT, public), and the command is `dolly`.

`PLAN.md` holds the current plan, its workstreams and their acceptance checks. Tick a check there when it passes.

## Layout

- `engine/` the engine: recording (`record`, `capture`, `browser`, `input`), directing (`direct`, `retime`, `camera/`), rendering (`render`, `ffmpeg`), the storyboard server (`studio.mjs`).
- `engine/camera/` the camera: `math.mjs` (where the view is at any time), `grammar.mjs` (the grammar's numbers), `resample.mjs` (Pillow-exact Lanczos), `frame.mjs`. Pure modules: the Studio runs `math.mjs` and `grammar.mjs` in the browser.
- `cli/` the `dolly` command: `index.mjs` dispatches, one module per command in `cli/commands/` exporting `usage`, `summary`, optional `flags`, and a default function.
- `studio/` the Studio (`dolly storyboard`): React and Motion, built with Vite into `studio/dist` (shipped; run `npm run build:studio`). `src/model/` is framework-free (the clip, its edits, verbs and fixes; the transport and drawing) and imports the engine's camera modules directly; `src/ui/` holds Dolly's controls; `src/parts/` the screen; `src/styles/tokens.css` the visual system. Work on it live with `dolly storyboard <p> --dev`.
- The scripts Dolly was ported from are not part of this repo.

## Workspaces

A user's clips never live in this repo. They live in a workspace: a folder with a `dolly.json`, found from the current folder upwards (or `--workspace`, or `DOLLY_WORKSPACE`), holding `projects/<product>/` (`project.json`, `scenarios/`, `cameras/`), `masters/`, `out/` and `.dolly/` scratch. The owner's own workspace is `~/Programming/dolly-clips`.

## Ground rules

- The camera grammar is the owner's direction, not a default: establish wide, lean in to about 1.35 on a zero-bounce spring, settle, let the change play with the camera still, pull back and hold. No cursor. A wash-only spotlight, never a ring. Its numbers live only in `engine/camera/grammar.mjs`.
- The preview must match the render. Anything the Studio shows about the camera comes from `engine/camera/math.mjs`, the module the renderer uses. The resampler is byte-identical to Pillow (so the render of `rec-walk` matches the legacy `camera.py` byte for byte); keep it that way (`test/resample.test.mjs` checks the resampler against a Pillow fixture).
- The Studio's look: neutral and monochrome, alpha-layered surfaces from `tokens.css`, 13px at weight 500, values in the system monospace, colour only for the wash and for notes that need the person. Light and dark follow the system.
- Masters are never deleted. A new take moves the previous master into `masters/<product>/.history/`.
- Nothing writes into a product repo or a site except `dolly deliver`, into the folder a project names, and it never replaces a differing file without `--yes`.
- Scenarios import nothing: everything they need is on `h` (`h.sleep`, `h.ease`, `h.seeded`, `h.grammar`), so they run from any workspace.
- Dolly uses the installed Google Chrome (`channel: 'chrome'`, or `DOLLY_CHROME`) and never downloads a browser.
- Commit messages and PRs are written in the owner's voice, with no model attribution of any kind.
- No em-dashes in anything authored here (copy, comments, docs). Use a colon, a period or a comma.
- The Studio and the site follow Interface Craft: the storyboard pattern for motion, live controls, and a Design Critique pass before anything visual ships. Dolly's UI is its own: never copy another tool's components or look (the owner does not want Dolly read as a copy).
