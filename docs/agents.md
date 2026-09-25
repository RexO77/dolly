# Agents

Dolly splits a clip between an agent and a person. The agent does what is code: it adds the product, finds the targets, writes the scenario and records the take. The person does what is judgement: they watch the camera over the real take in the Studio, direct it, and render. Every step the agent takes is a `dolly` command, so any coding agent that can run a shell can use it.

## The skill

`skill/SKILL.md` tells an agent when to reach for Dolly (a case study, README or site needs real product footage; a clip must be re-cut after the product changed; a poster or camera is wrong) and walks it through each case. It calls the CLI and carries no engine code, so it stays true across versions.

Install it wherever your agent loads skills. For Claude Code:

```sh
ln -s "$(npm root -g)/@nischalskanda/dolly/skill" ~/.claude/skills/dolly
```

For an agent that reads `AGENTS.md` instead, a line is enough:

```md
Product clips: use Dolly (`dolly help`). Follow <path to dolly>/skill/SKILL.md.
```

## What the agent does

1. Finds the workspace with `dolly list`, or asks where clips should live and runs `dolly init` there.
2. Runs `dolly doctor` and fixes what it reports.
3. Adds the product with `dolly init <name> --from <repo>`, and checks the port and start command it inferred.
4. Runs `dolly inspect <project> <path>` for the controls and boxes it needs, and looks at the screenshot.
5. Writes the scenario in the storyboard format ([scenarios.md](scenarios.md)).
6. Runs `dolly record <project> <clip>` until the take passes, and `dolly storyboard <project> <clip> --text` to check that every beat lands while the camera holds.
7. Hands you `dolly storyboard <project> <clip>`.
8. Renders and delivers when you ask, and replaces a delivered file only on your word.

## Prompts

Copy one into your agent's session. Each names the outcome; the skill supplies the steps.

**A first clip**
> Record a clip of the settings page with Dolly: switch the theme to dark and let the change play. Add the product to my Dolly workspace if it is not there yet, then give me the storyboard command so I can direct it.

The agent adds the product, inspects the settings page, writes a scenario with one lean on the settings panel, records it, and hands you the Studio.

**Re-cut after the product changed**
> The billing page changed. Re-record every Dolly clip that shows it, check that each camera still sits on the change, render them, and show me which delivered files differ before you replace them.

The agent re-records the clips (the old masters stay in `.history/`), re-inspects anything that moved, renders, and runs `dolly deliver` without `--yes` so you see what would change.

**Fix the poster**
> The poster for `shop-first` shows the menu half open. Make the poster the finished state.

The agent sets `meta.poster` or removes it (the default is the last frame, held wide), renders, and delivers.

**Lean somewhere else**
> In `shop-first`, the camera leans in on the whole page. Lean in on the row that changes instead, and keep the wash on that row alone.

The agent measures a box for the row, points the shot at it, and runs `dolly direct`: no new take.

**Cut the wait**
> The upload clip spends four seconds on a spinner. Cut the wait out with a crossfade, and keep the moment it finishes.

The agent marks beats either side of the wait and adds a `cut` to the clip's `direction`.

**A clip for every feature**
> Make a Dolly clip for each feature on the pricing page, one change per clip, and list them with their storyboards so I can direct them one by one.

## Working beside other sessions

A take is rejected when the product reloads during it, and a hot update is a reload. When another agent is editing the product, record after its edits have landed, or retry with `dolly record <project> <clip> --takes 3`.
