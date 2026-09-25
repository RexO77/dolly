# Workflow

A clip goes through five stages. Each re-runs from what the last one wrote, so a camera can be re-directed or a clip re-rendered without recording again.

| Stage | Command | Reads | Writes |
| --- | --- | --- | --- |
| record | `dolly record <p> <clip...>` | the scenario, the running product | `masters/<p>/<clip>.mp4` and `<clip>.take.json`, then the camera file |
| direct | `dolly direct <p> [clip...]` | the take, the scenario's `direction` or `camera` | `projects/<p>/cameras/<clip>.camera.json` |
| storyboard | `dolly storyboard <p> [clip]` | the master, the take, the camera file | the camera file (Save), the render (Render) |
| render | `dolly render <p> [clip...]` | the master, the camera file | `out/<p>/<clip>.mp4` and `out/<p>/<clip>-poster.webp` |
| deliver | `dolly deliver <p> [clip...]` | `out/<p>/` | the folder the project's `deliver` names |

`dolly list` shows where every clip stands: whether it has a scenario, a master and a render, whether it is directed or has a hand-made camera, and whether the render is older than its master or camera (`STALE render`).

## Record

```sh
dolly record shop shop-first
dolly record sb 'sb-feat-*' --takes 3
```

Dolly starts the product's dev server from the project's `start` command if nothing answers at `base`, and stops it when the run ends. It opens a real Chrome window off screen at the viewport's size, loads `meta.url`, waits for fonts, runs the project's `prepare` hook and the scenario's `setup`, parks the mouse, then captures while the take plays and for `meta.tailMs` after it. The master is the page's own pixels at the display's pixel ratio: 2880x1800 for a 1440x900 viewport on a retina display, at 30fps.

A take is rejected, and retried up to `--takes N` times, when the scenario throws or when the page reloads during it. A hot reload resets the app, and a reset take must never ship. On a failure Dolly keeps a screenshot of the screen at `.dolly/<p>/<clip>-failed.png`.

After a take, Dolly directs it straight away. `--render` renders too; the default is to review it first:

```
  next: dolly storyboard shop shop-first
```

Masters are never deleted. A new take moves the previous master and its take file to `masters/<p>/.history/<clip>.<time>.mp4` and `.take.json`.

**The take file** holds what the scenario measured, on the master's clock: its `beats`, `boxes` and `notes`, with the URL, viewport, pixel ratio and the master's size, frame rate and length.

## Direct

`dolly direct <p> [clip...]` rebuilds camera files from the saved takes, without recording. Run it after changing a scenario's `direction` or `camera`.

A scenario that exports `direction` or `camera` owns its camera file: recording and `dolly direct` rewrite it. Camera edits saved in the Studio for such a clip last until its next take. To keep them, carry the change back into the scenario's `direction`, or remove `direction` so the camera file becomes the clip's own (`dolly list` then shows it as a hand camera).

## Storyboard

```sh
dolly storyboard shop shop-first          # the Studio, at http://localhost:4800
dolly storyboard shop shop-first --open   # and open it
dolly storyboard shop --text              # every clip's shot list, printed
```

The Studio plays the master through its camera live. The camera reads as a shot list; open a shot and it plays on repeat, and each change replays it. Retime on the film strip (drag the edge between shots; edges snap to beats), frame on the picture (**Framing**) or on a measured box, set the zoom on the lens ring and the curve by name or by hand. Notes flag what breaks the grammar or goes soft, each with a fix. **Save** writes the camera file, marked as directed in the Studio; **Render** renders the clip and shows it beside the preview. The Studio writes nothing else.

A camera saved in the Studio survives the next take: `dolly record` and `dolly direct` keep it and say so, and rebuild it from the scenario only with `--redirect`.

`--text` prints the same storyboard:

```
   0.00  camera  hold wide                   1.00s
   1.00  camera  lean in on trail, z 1.385   spring 1.20s
   2.25  beat    data-science
```

## Render

```sh
dolly render shop shop-first
dolly render shop                         # every recorded clip
```

Every frame of the master goes through the camera and into the encoder. The project's preset sets the delivery: `web-1920` is 1920 wide at CRF 20, with a 1440-wide WebP poster. A clip's `meta.output` overrides any of it. The poster is the last frame (the finished state, held wide), or `meta.poster` seconds in.

## Poster

```sh
dolly poster shop shop-first --at 3.2
```

Writes only the poster, from one moment of the clip, without re-rendering. For a poster that should survive the next render, set `meta.poster` in the scenario instead.

## Deliver

```sh
dolly deliver shop shop-first
dolly deliver shop shop-first --yes       # replace delivered files that differ
```

Copies the clip and its poster to the project's `deliver` folder for the clip (`meta.deliver`, `default` unless set). Files already there are shipped, so one that differs is kept and listed until you pass `--yes`. `--stills` delivers the project's stills instead.

## Re-cutting after a product change

1. `dolly list <p>` to see the clips.
2. Re-record the clips the change touches: `dolly record <p> <clip...>`. The old masters go to `.history/`, and each camera is rebuilt from the new take's beats and boxes, except cameras directed in the Studio, which are kept (add `--redirect` to rebuild those too, then re-direct them).
3. Read the warnings, then `dolly storyboard <p> <clip>` to check the camera still sits on the change. A box measured from the old layout, or a beat that moved, shows here.
4. `dolly render <p> <clip...>`.
5. `dolly deliver <p> <clip...>`. It lists the delivered files that differ; `--yes` replaces them.

Leave the product's files alone while a take records: a hot reload rejects the take.

## Scratch

`.dolly/<p>/` holds what Dolly rebuilds: frames during a take, the Studio's scrubbing proxies, the last `dolly inspect` screenshot, failure screenshots, and the dev server's log (`<p>-server.log`). It is safe to delete.
