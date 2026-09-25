# Dolly: plan

Updated 2026-09-25. Dolly started as the recording scripts behind a set of case-study clips. It is now a public tool: `@nischalskanda/dolly`, MIT, with its own launch video directed in Dolly.

## Decisions

- **Name:** `@nischalskanda/dolly` on npm; the command is `dolly`. (`dolly` itself is taken.)
- **Public, MIT.** The repo, README, docs and site are written for strangers.
- **Workspaces:** a user's clips live in one workspace folder (`dolly.json`), never in this repo. The owner's is `~/Programming/dolly-clips`.
- **The Studio is where a person directs** (visual: timeline, sliders, curve editors, Save, Render); **the CLI is the engine** for recording, rendering, delivering, and for agents. Scenarios (what the hand does) stay code, usually written by an agent.
- **Interface Craft for the whole tool:** the storyboard pattern for motion, live controls tuned by eye, a Design Critique pass before anything visual ships. Dolly's UI is its own; it borrows no other tool's components or look.
- **The demo is Dolly's launch video, made with Dolly:** the Studio is a web app, so Dolly records itself.
- **Public history starts clean:** the scripts Dolly was ported from are not in this repo's history.

## Where it stands

Done and verified:
- [x] The camera in JS. The resampler matches Pillow byte for byte (`test/resample.test.mjs`); the `rec-walk` render is byte-identical to `camera.py`; spotlight clips score SSIM 0.9993 or better (worst frame 0.997). About 2x faster, on worker threads.
- [x] The recording engine on Playwright with the CDP screencast at device pixels, one input module, frame-based re-timing in JS (no Python), config-driven projects.
- [x] Workspaces, one module per CLI command, tests (`npm run check`).
- [x] A first storyboard page (vanilla): the master through the camera live, storyboard strip of real frames, timeline, inspector, Save and Render. Seeks in 20 to 28ms via full-resolution proxies.

- [x] Recording end to end on the new engine: `rec-walk` recorded a 2880x1800, 30fps master (the legacy size and rate), directed from its beats within 0.06s of the legacy camera.
- [x] The Studio in React and Motion on the shot-list direction, served prebuilt; its clip model is tested (`test/studio-model.test.mjs`).
- [x] Studio cameras are kept by `dolly record` and `dolly direct` unless `--redirect`.

## Workstreams

### 1. Studio
Decided 2026-09-25 from three live prototypes on real takes (studio/proto, deleted once the Studio ships):
- **Direction: Shot list.** The clip reads as numbered shots, each with the real frame it will show, its timing and its curve; the picture and a film strip sit beside it.
- **Visual language (updated 2026-09-25):** Night, picked from three live directions in the spirit of rows.gg: dark first, paper and ink tones with depth from tone steps, Hanken Grotesk and DM Mono bundled, the wash as the one accent. The first light, neutral version read as "too bland and too white". Dolly's own components, never a copy of another tool's UI.
- **Carried over from the rejected directions:** framing a shot by dragging its frame on the picture (Viewfinder); the activity signal read off the master (all three).
- **Rejected:** Viewfinder (the most distinctive, but exact values hide in a card); Edit bay (precise, but reads as a generic editor). The first prototype's paper, serif and terracotta read as a template.
- **Functionality:** retime on the film strip and per-shot span bars, snapping to beats; shot verbs (lean in here, hold, pull back, remove) instead of keyframes; lean on a box the take measured, by name; a one-click fix beside every grammar warning; Studio-directed cameras protected from re-direct; render, then compare with the preview.
- **Added 2026-09-25:** a home screen of every clip with its state and next step; a lens barrel for zoom (rolls, ticks, a detent at the lean, amber past the sharp limit); quiet Web Audio sounds for every action, behind a speaker toggle; the preview crossfades across cuts like the render; the camera keeps the synced beats so snaps land on what is on screen; the Frame (the clip as a flat card on a background that grows to fill it on a lean).
- **Rejected 2026-09-25:** a 3D tilt of the clip with perspective. It did not hold up in use; the flat Frame replaced it.
- Built in React and Motion (Vite), shipped prebuilt as `studio/dist`.
- Checks: [ ] a clip directed from scratch in the Studio renders to what the preview showed; [ ] a person who has never used it retimes a shot and reframes one without being told how; [x] Design Critique pass done and its fixes applied (on each of the three directions).

### 2. Scenario ports
Every legacy scenario into `~/Programming/dolly-clips/projects/*/scenarios/`, in the storyboard format: a shot-list comment at the top, a `TIMING` block for clip-clock moments, reaches as data.
- Checks: [x] every legacy clip has a scenario that loads (38, each dry-run against a fake page); [x] `rec-walk` records a new master of the same size and frame rate as the legacy one; [x] `legacy/` deleted.
- Still to record for real: every clip except `rec-walk`. The products may have moved since the legacy takes; expect some selectors to need a touch.

### 3. Packaging and install
- One line to install with npm, pnpm, yarn or bun, globally or per workspace; `npx @nischalskanda/dolly` works.
- `dolly doctor` names the exact fix for anything missing (`brew install ffmpeg webp`, Chrome).
- CI: lint, tests, `npm pack` contents, install and `dolly --help` on Node 22 and 24 with each package manager.
- Checks: [ ] a fresh machine gets from nothing to `dolly doctor` all green following the README alone. (Verified locally from the packed tarball with npm, pnpm, yarn 1 and 4, and bun; CI green on GitHub.) Not yet published to npm.

### 4. Onboarding
- `dolly init` makes a workspace, and `dolly init <project>` adds a product: it reads the product's package.json for its dev script and port, and writes `project.json` and a first scenario in the storyboard format.
- README: one-line pitch, the demo, Install (npm | pnpm | yarn | bun), Quick start, Human and Agent paths, Prompts to copy, reference.
- `docs/`: scenario API (`h`), camera spec, direction, the grammar, the Studio.
- `skill/SKILL.md`, symlinked to `~/.claude/skills/dolly`, so any agent session knows when and how to use Dolly.
- Checks: [ ] a fresh session in another repo, asked for "a clip of the settings page", gets to a directed clip in the Studio unaided.

### 5. Launch video and site (after 1 to 4)
- `examples/launch/`: a workspace that records the Studio directing a clip; the film is Dolly's launch video.
- A site whose hero is a live clip you direct by dragging; install per package manager; prompts for agents. Built in `site/` from `examples/demo` (Wrenly, a fictional tracker), Night like the Studio; deploys to GitHub Pages once Pages is switched on in the repo's settings.
- Checks: [ ] the site is live at rexo77.github.io/dolly; [ ] the launch video is shot.

### Later
- Moment-anchored cameras (`{at: "click-1"}`), a jank and layout-shift gate on record, posters from `settle`.
- A mobile delivery preset and `<source media>` pairing for homepage autoplay.
- Whether the Remotion hero-film repos consume Dolly's masters.
