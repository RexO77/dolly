# Workspaces

A workspace is the folder where your clips live, apart from Dolly and apart from your products. `dolly init` makes one. There's almost nothing to it: a small `dolly.json`, and a folder per product.

```
clips/
  dolly.json
  projects/<product>/     project.json, scenarios/, cameras/, project.mjs, stills.mjs   (keep in git)
  masters/<product>/      raw takes and their take files, .history/                     (large, gitignored)
  out/<product>/          rendered clips, posters, stills/                              (gitignored)
  .dolly/                 scratch: frames, proxies, logs                                (gitignored)
```

Keep `projects/` in git: it is everything needed to record, direct and render again. Masters are large and can be recorded again, so they are ignored, but keep them on disk: they let a camera be re-directed without re-recording.

Dolly finds the workspace from the current folder upwards (the nearest `dolly.json`), from `DOLLY_WORKSPACE`, or from `--workspace DIR`.

## dolly.json

```json
{ "projects": "projects", "masters": "masters", "out": "out" }
```

Each key moves a folder, relative to the workspace: `projects`, `masters`, `out`, and `tmp` (`.dolly`). `--masters DIR` and `--out DIR` move them for one run.

## Adding a product

```sh
dolly init shop --from ~/code/shop
```

Dolly reads the product's `package.json` (it never writes to the product's repo) and prints what it inferred and why:

- **the script**: `dev`, else `start`, `develop` or `serve`;
- **the framework**: Vite, Next.js, Astro, SvelteKit or Create React App, from what the script runs and then from the dependencies;
- **the package manager**: from the lockfile (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`), looking up to the git root, then `packageManager`, then npm;
- **the port**: `--port`, else the port in `--base`, the script's own `--port`, the framework config's `port` (`vite.config.*`, `astro.config.*`), or the framework's default (Vite and SvelteKit 5173, Next.js and Create React App 3000, Astro 4321). A port another project in the workspace uses moves to the next free one, since Dolly records whatever answers at a project's `base`;
- **the start command**, pinning that port: `npm run dev -- --port 5173 --strictPort` for Vite, `--port N` for Next.js and Astro, `PORT=N BROWSER=none` for Create React App, with the product's package manager.

It also picks a short **alias** any command accepts in the project's place: the initials of a hyphenated name (`field-notes` is `fn`), or the first three letters of a one-word name longer than four letters. `--alias` sets your own.

On a terminal it asks for anything it cannot infer; otherwise pass it as a flag. Without `--from`, pass `--base URL` for a product that already runs somewhere, and Dolly will not start it. Then it writes `project.json`, a first scenario from the template (it never replaces one that is already there), and an empty `cameras/`.

## project.json

```json
{
  "name": "field-notes",
  "alias": "fn",
  "base": "http://localhost:5183",
  "start": { "cwd": "~/code/field-notes", "cmd": "npm run dev -- --port 5183 --strictPort" },
  "viewport": { "width": 1280, "height": 800, "dpr": 2 },
  "query": { "demo": "1" },
  "preset": "web-1920",
  "deliver": {
    "default": "~/code/site/public/media/field-notes",
    "lab": "~/code/site/public/media/field-notes/lab"
  }
}
```

| Key | What it is |
| --- | --- |
| `name` | the project's name; the folder name when missing |
| `alias` | a short name any command accepts in its place (`dolly record fn ...`) |
| `base` | where the product answers; required |
| `start` | `{cwd, cmd}`: how to start the dev server when nothing answers at `base`. Without it, start the product yourself |
| `viewport` | `{width, height, dpr}`, 1440x900 at 2 by default |
| `query` | query parameters on every clip's URL, before any hash route |
| `preset` | the delivery preset: `web-1920` |
| `deliver` | named folders a clip's render is copied to; a clip picks one with `meta.deliver` |

Paths may start with `~`. Dolly writes into a `deliver` folder only through `dolly deliver`, and replaces a file there only with `--yes`.

## project.mjs

Optional hooks for every clip in the project.

```js
/* Before every take, after the page loads and before the scenario's setup. */
export async function prepare(h, meta) {
  await h.page.evaluate(() => localStorage.setItem('shortcuts-hint-dismissed', '1'));
  await h.page.reload({ waitUntil: 'networkidle' });
}
```

## stills.mjs

Stills are screenshots, for a page where a still says it better than a clip. `dolly stills <p> [name]` shoots one per shot, from the same off-screen window a take uses, to `out/<p>/stills/<name>.webp`. A batch fails when two shots come out byte-identical: two pages rendering the same thing is a mistake to fix.

```js
export const shots = [
  { name: 'library', url: '/', wait: 1500, element: 'main' },
  { name: 'pricing', url: '/pricing', query: { plan: 'pro' }, deliver: 'press' },
];
export const css = '.cookie-banner { display: none !important; }'; // hidden before every shot
export const deliver = 'default';                                  // where a shot without its own deliver goes
export async function init(page, { query }) {}                     // once, before the first shot
export async function before(page, shot, { url, query }) {}        // each shot, after it loads
```

| Shot key | What it does |
| --- | --- |
| `name` | the file name, and what `dolly stills <p> <name>` matches |
| `url` | the page, against the project's `base` (`'/'`) |
| `query` | query parameters, merged over the project's |
| `wait` | milliseconds to wait after `before`, before the shot (1500) |
| `element` | a selector: shoot only that element |
| `deliver` | the project's deliver folder for this shot, else the module's `deliver`, else `default` |

`dolly deliver <p> --stills` copies each still to its folder. It checks every folder first, so a folder `project.json` does not name stops the delivery before anything is copied.
