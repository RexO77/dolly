# Workflow

A clip goes through five stages. Each one re-runs from what the last one wrote, so you can re-direct a camera or re-render a clip without recording again.

| Stage | Command | Reads | Writes |
| --- | --- | --- | --- |
| record | `dolly record <p> <clip...>` | the scenario, the running product | `masters/<p>/<clip>.mp4` and `<clip>.take.json`, then the camera file |
| direct | `dolly direct <p> [clip...]` | the take, the scenario's `direction` or `camera` | `projects/<p>/cameras/<clip>.camera.json` |
| studio | `dolly studio <p> [clip]` | the master, the take, the camera file | the camera file (Save), the render (Render) |
| render | `dolly render <p> [clip...]` | the master, the camera file | `out/<p>/<clip>.mp4` and `out/<p>/<clip>-poster.webp` |
| deliver | `dolly deliver <p> [clip...]` | `out/<p>/` | the folder the project's `deliver` names |

`dolly list` shows where every clip stands: whether it has a scenario and a take, where its camera comes from (its scenario, the Studio, a camera file of its own, or none, in which case it renders wide), and whether its render is older than its master or camera (`RENDER OUT OF DATE`).

## Record

```sh
dolly record shop shop-first
dolly record shop 'settings-*' --takes 3
```

If nothing answers at the project's `base`, Dolly starts the dev server from its `start` command, and stops it when the run ends (ctrl-c included). It opens a real Chrome window off screen at the viewport's size, loads `meta.url`, waits for fonts, runs the project's `prepare` hook and the scenario's `setup`, parks the mouse, then films while the take plays and for `meta.tailMs` after it. The master is the page's own pixels at the display's pixel ratio: 2880x1800 for a 1440x900 viewport on a retina display, at 30fps.

A take is rejected when the scenario throws, or when the page reloads or hot-updates during it: a reset take must never ship. Dolly notices a full page load, and the hot-update messages Vite, Next.js and webpack log in the page; other dev servers may reload silently, so leave the product's files alone while a take records. `--takes N` gives each clip up to N tries in all (the default is the scenario's `meta.takes`, else 1). When a take fails, Dolly keeps a screenshot of the moment at `.dolly/<p>/<clip>-failed.png`.

After a take, Dolly builds the camera straight away. `--render` renders too; by default it stops so you can check the camera first:

```
  next: dolly studio shop shop-first
```

When you record several clips, a clip that fails is reported and the rest still record.

Masters are never deleted. A new take moves the previous master and its take file to `masters/<p>/.history/<clip>.<time>.mp4` and `.take.json`.

**The take file** holds what the scenario measured, on the master's clock: its `beats`, `boxes` and `notes`, with the URL, the viewport, the pixel ratio, and the master's size, frame rate and length.

## Direct

`dolly direct <p> [clip...]` rebuilds camera files from the saved takes, without recording. Run it after you change a scenario's `direction` or `camera`.

A camera saved in the Studio is kept: `dolly record` and `dolly direct` leave it alone and say so. `--redirect` rebuilds it from the scenario, which throws away what was directed in the Studio. To keep a Studio change for good, carry it back into the scenario's `direction`, or remove `direction` so the camera file becomes the clip's own.

## The Studio

```sh
dolly studio shop shop-first          # at http://localhost:4800
dolly studio shop shop-first --open   # and open it in your browser
dolly studio shop --text              # every clip's shot list, printed
```

The Studio plays the master through its camera live. The camera reads as a shot list; open a shot and it plays on repeat, and each change replays it. Retime on the film strip, frame on the picture or on a measured box, and set the zoom and the curve. Notes flag what breaks the grammar or goes soft, each with a fix. **Save** writes the camera file, marked as saved in the Studio; **Render** renders the clip and shows it beside the preview. The Studio writes nothing else.

`--text` prints the same shot list, with the take's beats on the same timeline:

```
   0.00  camera  hold wide                   1.00s
   1.00  camera  lean in on panel, z 1.35    spring 1.20s
   2.25  beat    change
```

`dolly storyboard` is another name for `dolly studio`.

## Render

```sh
dolly render shop shop-first
dolly render shop                         # every recorded clip
```

Every frame of the master goes through the camera and into the encoder. The project's preset sets the delivery: `web-1920` is 1920 wide at CRF 20, with a 1440-wide WebP poster. A clip's `meta.output` overrides any of it. The poster is the last frame (the finished state, held wide), or the frame `meta.poster` seconds in.

## Poster

```sh
dolly poster shop shop-first --at 3.2
```

Writes only the poster, from one moment of the clip, without rendering again. The next render puts it back on the last frame; for a poster that lasts, set `meta.poster` in the scenario.

## Deliver

```sh
dolly deliver shop shop-first
dolly deliver shop shop-first --yes       # replace delivered files that differ
```

Copies the clip and its poster to the project's `deliver` folder for the clip (`meta.deliver`, `default` unless set). A file already there is shipped, so one that differs is kept and listed until you pass `--yes`. `--stills` delivers the project's stills instead, each to its own folder.

## Re-cutting after a product change

1. `dolly list <p>` to see the clips.
2. Record the clips the change touches again: `dolly record <p> <clip...>`. The old masters go to `.history/`, and each camera is rebuilt from the new take's beats and boxes, except cameras saved in the Studio, which are kept (add `--redirect` to rebuild those too, then direct them again).
3. Read the warnings, then open `dolly studio <p> <clip>` to check the camera still sits on the change. A box measured from the old layout, or a beat that moved, shows up here.
4. `dolly render <p> <clip...>`.
5. `dolly deliver <p> <clip...>`. It lists the delivered files that differ; `--yes` replaces them.

## Scratch

`.dolly/<p>/` holds what Dolly can rebuild: frames during a take, the Studio's scrubbing copies of masters, the last `dolly inspect` screenshot, failure screenshots, and the dev server's log (`<p>-server.log`). It is safe to delete.
