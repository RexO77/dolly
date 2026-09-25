---
name: dolly
description: Record, re-cut and fix real product clips with Dolly (the `dolly` CLI). Use when a case study, README or site needs footage of a real web product; when a clip must be re-cut because the product changed; or when a clip's poster or camera is wrong.
---

# Dolly

Dolly records a web product in an off-screen Chrome with no cursor while a scenario plays it at a human pace (the **take**), then directs a camera over the take and renders an MP4 and a poster. Your part is the scenario and the take. The person's part is directing: they watch the camera over the real take in the Studio (`dolly storyboard`) and render there.

Everything goes through the `dolly` CLI. `dolly help <command>` is the source of truth for flags. The full reference is in Dolly's `docs/`, one folder up from this file: `scenarios.md` (the `h` API, `direction`), `camera.md` (the spec and the grammar), `workflow.md` (what each stage writes where). Read `scenarios.md` before writing your first scenario.

## A new clip

1. **Find the workspace.** Run `dolly list` from the folder the person keeps clips in (or pass `--workspace DIR`). When there is none, ask where clips should live, and make one there with `dolly init`: a folder beside the products, never inside a product's repo. Done when `dolly list` prints without an error.
2. **Check the machine.** `dolly doctor`. Done when every line reads `ok`; a project that is `down` but has a start command is fine, Dolly starts it.
3. **Add the product** if `dolly list` does not show it: `dolly init <name> --from <product repo>`. Read the table it prints. Done when its port and start command match how the product really serves (check the product's dev config when the reason says "default").
4. **Find the targets.** `dolly inspect <project> <path>` lists the page's controls with their boxes and writes a screenshot (look at it). Done when you have a selector or exact label for every control the hand touches and every region the camera leans in on.
5. **Write the scenario** in `projects/<project>/scenarios/<clip>.mjs`, starting from the one `dolly init` wrote, in the storyboard format: doc comment, STORYBOARD shot list, `TIMING`, config objects, the take, a declarative `direction`. Done when `dolly list <project>` shows the clip with `scenario` and every time in the STORYBOARD comment agrees with `TIMING` and the grammar.
6. **Record.** `dolly record <project> <clip>`. Done when it prints `recorded` and `directed`, and every warning is fixed or explained to the person.
7. **Check the camera.** `dolly storyboard <project> <clip> --text`. Done when every beat lands during a hold and the last hold is at least 0.8s.
8. **Hand it over.** Give the person `dolly storyboard <project> <clip>`: it serves the Studio until ctrl-c, so it is theirs to run. They direct, Save and Render there.
9. **Render and deliver** when the person asks: `dolly render <project> <clip>`, then `dolly deliver <project> <clip>`. Delivered files are shipped: when deliver lists files it kept, show them to the person, and pass `--yes` only on their word.

## Writing the scenario

- A scenario reaches the product only through `h`. It imports nothing from Dolly; the grammar's numbers are on `h.grammar`.
- Mark a **beat** (`h.beat`) at every moment the camera cares about, and measure a **box** (`h.box`, `h.boxCss`) for every region it leans in on, where the region ends up.
- Time the hand so what it lights up lands after the lean has settled: a lean takes `h.grammar.SPRING` (1.2s) and rests `h.grammar.SETTLE` (0.35s) before the change. The first lean cannot start before `h.grammar.ESTABLISH` (0.8s).
- Use `h.hand({ seed })` for glides, dwells and presses, and give it a fixed seed so a retake repeats.
- Run the take on through the pull back (`h.until(done + hold + h.grammar.SPRING)`); `meta.tailMs` then holds the finished state.
- Direct with `direction.shots`. Add `sync` on the first beat whose box visibly changes, so the camera sits on the picture. Reach for `camera(take, tools)` only for a move the shots cannot express.
- Keep the grammar: establish wide, lean in to 1.35 on a zero-bounce spring, let the change play with the camera still, pull back and hold. The spotlight is the wash alone.

## A product change

1. `dolly list <project>` and pick the clips the change touches.
2. `dolly record <project> <clip...>`. Old masters are kept in `masters/<project>/.history/`; each camera is rebuilt from the new take.
3. Re-run `dolly inspect` for any target that moved, fix the scenario, and record again until the take passes.
4. Check each with `dolly storyboard <project> <clip> --text`, then hand the person the Studio, render and deliver as in steps 8 and 9 above.

## A wrong poster

The poster is the clip's last frame (the finished state, held wide) unless the scenario's `meta.poster` names a time. For a lasting fix, set `meta.poster` (seconds on the clip's clock) and `dolly render`. For a one-off, `dolly poster <project> <clip> --at S`. Then `dolly deliver`.

## A wrong camera

Change the scenario's `direction` (another box, another beat, a `cut` for a wait) and run `dolly direct <project> <clip>`: no new take needed. A camera the person saved in the Studio is kept by `dolly record` and `dolly direct`; rebuild it with `--redirect` only when they ask, since it discards their direction.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| `FAIL` in `dolly doctor` | run the `fix:` it prints under that line, then `dolly doctor` again |
| `nothing answers at <base>` | the product has no start command: start its dev server, or add `start` to `project.json` |
| `dev server exited` or `did not answer` | read `.dolly/<project>/<project>-server.log`; usually the port is taken or the product does not build |
| `the product reloaded during the take` | a hot update reset the app: files in the product changed while recording (another session editing it, a formatter, a build). Record once edits have stopped; `--takes 3` retries |
| `not found: ...` or `no button: ...` | look at `.dolly/<project>/<clip>-failed.png`, then `dolly inspect` again for the real label or selector |
| `the sync box "..." never changes` | the box does not cover what changes; measure the region that changes, or sync on another beat |
| `record a longer tail` | raise `meta.tailMs`, or run the take on longer with `h.until` |
| `the display's pixel ratio is 1, not 2` | the master will be 1x and leans will be soft; record on a retina display |
