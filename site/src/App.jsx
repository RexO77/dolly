import { useEffect, useState } from 'react';
import help from 'virtual:dolly-help';
import * as grammar from '../../engine/camera/grammar.mjs';
import { Stage } from './Stage.jsx';
import { NoCursorDemo, LeanDemo, WashDemo, FrameDemo, AgentDemo } from './Demos.jsx';
import { EditorFigure, HomeFigure, LensDemo, NotesDemo, SnapDemo, SoundsDemo, Rest } from './StudioDemos.jsx';
import { Commands, Tabs, Prompt, ArrowIcon, Mark, CopyButton, Reel, SoundToggle, ThemeToggle, withCode } from './parts.jsx';
import { media, useTheme } from './hooks.js';

const GITHUB = 'https://github.com/RexO77/dolly';
const DOCS = `${GITHUB}/tree/main/docs`;
const NPM = 'https://www.npmjs.com/package/@nischalskanda/dolly';
const PKG = '@nischalskanda/dolly';

const AGENT_INSTALL = `Install Dolly with \`npm install -g ${PKG}\`, then run \`dolly doctor\` and fix anything it reports. Link Dolly's skill so you know when to reach for it: \`ln -s "$(npm root -g)/${PKG}/skill" ~/.claude/skills/dolly\` (or wherever your skills live).`;

const PROMPTS = [
  { title: 'A first clip', text: 'Record a clip of the settings page with Dolly: switch the theme to dark and let the change play. Add the product to my Dolly workspace if it is not there yet, then give me the Studio command so I can direct it.' },
  { title: 'The product changed', text: 'The billing page changed. Re-record every Dolly clip that shows it, check that each camera still sits on the change, render them, and show me which delivered files differ before you replace them.' },
  { title: 'Lean somewhere else', text: 'In shop-first the camera leans in on the whole page. Lean in on the row that changes instead, and keep the wash on that row alone.' },
  { title: 'Cut the wait', text: 'The upload clip spends four seconds on a spinner. Cut the wait out with a crossfade, and keep the moment it finishes.' },
];

const GRAMMAR = [
  ['How far a lean goes in', `${grammar.LEAN_Z}×`],
  ['A lean or a pull back', `${grammar.SPRING}s, zero bounce`],
  ['Settled before the change', `${grammar.SETTLE}s`],
  ['The shortest wide hold', `${grammar.ESTABLISH}s`],
  ['A hop between neighbours', `${grammar.HOP}s`],
  ['Most of the frame a subject fills', `${Math.round(grammar.FOCUS_FILL * 100)}%`],
  ['The wash', `${Math.round(grammar.WASH_ALPHA * 100)}%, ${grammar.SPOT_RADIUS}px corners`],
  ['A framed card, while wide', `${Math.round(grammar.CARD_INSET * 100)}% of the clip`],
];

const DOC_LINKS = [
  ['How Dolly works', 'how-it-works.md'],
  ['Scenarios', 'scenarios.md'],
  ['The camera', 'camera.md'],
  ['Workflow', 'workflow.md'],
  ['Workspaces', 'workspaces.md'],
  ['Agents', 'agents.md'],
];

const STEPS = [
  { n: 1, title: 'Film', file: 'raw.webp', cap: 'The take, as recorded', alt: 'A frame of the raw take: Wrenly, whole screen, an issue just marked done', text: 'A short script says what an unseen hand does. Dolly plays it in your real product, in Chrome, and keeps the take at retina size.' },
  { n: 2, title: 'Direct', file: 'studio-shot.webp', cap: 'The same moment, in the Studio', alt: 'The Studio with the lean on the issue open, the playhead in the hold', text: 'The take’s moments become shots: lean in here, hold, pull back. Change any of them in the Studio, by eye, or leave them be.' },
  { n: 3, title: 'Render', file: 'finished.webp', cap: 'The clip: leaned in, the wash on', alt: 'The same frame as rendered: leaned in on the issue, everything else under the warm wash', text: 'Every frame goes through the camera into an MP4 and a poster, ready for a README, a case study or a landing page.' },
];

/** A section's head: the kicker and title on the left, what it is about on the right. */
function Head({ id, kicker, title, children }) {
  return (
    <header className="head">
      <div>
        <p className="kicker">{kicker}</p>
        <h2 id={id}>{title}</h2>
      </div>
      {children && <p className="intro">{children}</p>}
    </header>
  );
}

/** One idea and its demo: the words top-aligned on the left, the demo on the right. */
function Row({ title, body, children }) {
  return (
    <article className="row">
      <div className="row-text">
        <h3>{title}</h3>
        {body.map((p) => <p key={p}>{withCode(p)}</p>)}
      </div>
      <div className="row-demo">{children}</div>
    </article>
  );
}

const placeholder = <div className="demo"><div className="screen"><div className="shot-frame" /></div></div>;

export function App() {
  const [tour, setTour] = useState(null);
  const [failed, setFailed] = useState(false);
  const [theme, setTheme] = useTheme();
  useEffect(() => {
    fetch(media('tour.json')).then((r) => r.json()).then(setTour, () => setFailed(true));
  }, []);
  /* The sharpest a lean can go: the master's pixels per delivered pixel. */
  const sharpMax = tour ? tour.master.width / tour.output.width : 1.5;
  const withTour = (render) => (tour ? render(tour) : placeholder);

  return (
    <div className="page">
      <a className="skip" href="#main">Skip to content</a>
      <header className="top">
        <div className="wrap top-inner">
          <a className="mark" href="#top" aria-label="Dolly, home"><Mark theme={theme} />Dolly</a>
          <nav aria-label="Site">
            <a href="#how">How it works</a>
            <a href="#studio">Studio</a>
            <a href="#start">Install</a>
            <a href={DOCS}>Docs</a>
          </nav>
          <div className="top-tools">
            <SoundToggle />
            <ThemeToggle theme={theme} onChange={setTheme} />
            <a className="icon-btn" href={GITHUB} aria-label="Dolly on GitHub" title="GitHub">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 .2a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.93-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.67.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.83-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.52.56.83 1.28.83 2.15 0 3.07-1.87 3.75-3.66 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 .2Z" /></svg>
            </a>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="hero wrap" id="top" aria-labelledby="hero-h">
          <h1 id="hero-h">Film your product.<br /> Then direct the camera.</h1>
          <div className="hero-side">
            <p className="lede">Dolly records your web app in Chrome with no cursor in sight, then moves a camera over the take: in close where something changes, still while it happens, back out to show the result. You get a clip that’s ready for your site.</p>
            <div className="cta">
              <a className="btn btn-primary" href="#start">Install Dolly</a>
              <a className="arrow-link" href={DOCS}>Read the docs <ArrowIcon /></a>
            </div>
          </div>
        </section>

        <div className="wrap">
          {tour ? <Stage tour={tour} sharpMax={sharpMax} /> : (
            <div className="stage">
              <div className="stage-bar" />
              <div className="viewport"><div className="frame"><img className="poster" src={media('take.webp')} alt="Wrenly, a project tracker, as recorded" width="1600" height="1000" /></div></div>
              {failed && <p className="note">The live clip could not load. <a href={media('directed.mp4')}>Watch the rendered clip</a>.</p>}
            </div>
          )}
        </div>

        <section className="block wrap" id="how" aria-labelledby="how-h">
          <Head id="how-h" kicker="How it works" title="Film it, direct it, render it.">
            A screen recording shows everything and points at nothing. Dolly points, then gets out of the way. Each step starts from what the last one saved, so you can direct again or render again without filming again.
          </Head>
          <ol className="steps">
            {STEPS.map((s) => (
              <li className="step" key={s.n}>
                <figure>
                  <div className="screen">
                    <img src={media(s.file)} alt={s.alt} width="1440" height="900" loading="lazy" />
                  </div>
                  <figcaption className="mono">{s.cap}</figcaption>
                </figure>
                <h3><span>{s.n}</span>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="block wrap" id="camera" aria-labelledby="camera-h">
          <Head id="camera-h" kicker="The camera" title="One way of moving. Every clip.">
            Dolly’s camera keeps a few plain rules, so every clip looks shot by the same steady hand. You can change anything. You rarely need to.
          </Head>
          <div className="rows">
            <Row title="No cursor. Not even a little one." body={['Dolly plays your product with a hand you never see. All that’s left of it is what it touches: a row lights up, a switch flips, a button dips.', 'Turn the cursor on and watch where your eye goes. That’s why it’s off.']}>
              <NoCursorDemo />
            </Row>
            <Row title="Lean in, hold still, pull back." body={['Start wide so you know where you are. Lean in about a third, on a spring that never overshoots. Hold dead still while the change plays, then step back so the result sits in context.', 'That curve is the real one: the same code that renders your clip.']}>
              {withTour((t) => <LeanDemo tour={t} />)}
            </Row>
            <Row title="A wash, not a ring." body={['To point at something, Dolly lays a warm wash over everything else. The part that matters stays lit, and nothing gets drawn on top of your product.', 'Rings, arrows and glowing outlines were considered. Briefly. Try the ring.']}>
              {withTour((t) => <WashDemo tour={t} />)}
            </Row>
            <Row title="Or frame it on a background." body={['Show the clip as a card on a background, with or without a plain browser window around it. While the camera is wide the card sits back; as it leans in, the card grows to fill the screen, so the lean feels like walking up to it.', 'Four backgrounds come with it: dusk, ink, paper and wash. It is off unless you ask.']}>
              {withTour((t) => <FrameDemo tour={t} />)}
            </Row>
          </div>
        </section>

        <section className="block wrap" id="studio" aria-labelledby="studio-h">
          <Head id="studio-h" kicker="The Studio" title="Direct it by eye.">
            {withCode('`dolly studio` opens the Studio in your browser. It plays your real take through the real camera, with the code that renders it, so what you see is what you get.')}
          </Head>
          <EditorFigure />
          <div className="rows">
            <Row title="Every clip, and what to do next." body={['The Studio opens on your clips. Each one says where it stands in plain words, and shows the one next step: a button when it happens here, or the exact command, with Copy, when it happens in your terminal.', 'The first time, a short intro explains the three steps. Then it gets out of the way.']}>
              <HomeFigure />
            </Row>
            <Row title="The zoom is a lens you roll." body={['Not a slider: a lens barrel, seen side on. The marks crowd and fade as the ring curves away and the grip rolls underneath. It clicks into 1× and into the 1.35 lean, and a flick keeps it turning.', 'Past 1.50× the take runs out of real pixels, so the marks turn amber. This is the Studio’s own control. Roll it.']}>
              {withTour((t) => <LensDemo tour={t} sharpMax={sharpMax} />)}
            </Row>
            <Row title="Notes that fix themselves." body={['When a shot breaks a rule, the Studio says so in a sentence and offers the fix as one button. It never changes your shot behind your back.', 'This lean runs into the change and leans closer than the take is sharp. Press the fixes and watch the curve.']}>
              {withTour((t) => <NotesDemo tour={t} sharpMax={sharpMax} />)}
            </Row>
            <Row title="Snaps to the moment." body={['Drag the edge between two shots and it snaps onto the moments the take marked: a menu opening, an option picked, a status changing. The moment lights up, and you hear it land.']}>
              {withTour((t) => <SnapDemo tour={t} />)}
            </Row>
            <Row title="Every action has a sound." body={['Quiet, short, and made on the spot with Web Audio: a tick for each mark on the lens, a click into the lean, a snap onto a beat, a latch when you save, two soft bells when a render finishes.', 'One button turns them off in the Studio. Here they stay off until you turn them on.']}>
              <SoundsDemo />
            </Row>
          </div>
          <Rest />
        </section>

        <section className="block wrap" id="agents" aria-labelledby="agents-h">
          <div className="rows">
            <Row title={<span id="agents-h">Your agent does the boring half.</span>} body={['Adding the product, finding the buttons, writing the script, recording the take: an agent can do all of it. Every step is a plain command, so any agent with a shell can drive Dolly.', 'Then it hands you the Studio, because the camera needs taste.']}>
              <AgentDemo />
            </Row>
          </div>
        </section>

        <section className="block wrap" id="start" aria-labelledby="start-h">
          <Head id="start-h" kicker="Get started" title="One line to install. A few more to your first clip.">
            Dolly is a command line tool. It uses the Chrome you already have and never downloads a browser.
          </Head>
          <div className="start">
            <div className="card">
              <h3>Install</h3>
              <Tabs
                label="Install with"
                tabs={{
                  npm: <Commands lines={[[`npm install -g ${PKG}`]]} label="Install with npm" />,
                  pnpm: <Commands lines={[[`pnpm add -g ${PKG}`]]} label="Install with pnpm" />,
                  yarn: <Commands lines={[[`yarn global add ${PKG}`]]} label="Install with yarn" />,
                  bun: <Commands lines={[[`bun add -g ${PKG}`]]} label="Install with bun" />,
                  agent: (
                    <div className="code">
                      <pre className="wrap-text">{AGENT_INSTALL}</pre>
                      <CopyButton text={AGENT_INSTALL} label="Copy the prompt" />
                    </div>
                  ),
                }}
              />
              <p className="needs">Then run <code>dolly doctor</code>. It checks for Node 22 or newer, Google Chrome, ffmpeg and cwebp, and prints the exact fix for anything missing. On a Mac that is usually <code>brew install ffmpeg webp</code>.</p>
            </div>
            <div className="card">
              <h3>Your first clip</h3>
              <Commands
                label="Your first clip"
                lines={[
                  ['mkdir clips && cd clips'],
                  ['dolly init', 'this folder is a workspace'],
                  ['dolly init shop --from ~/code/shop', 'add your product'],
                  ['dolly record shop shop-first', 'a take, no cursor'],
                  ['dolly studio shop shop-first', 'direct it, render it'],
                  ['dolly deliver shop shop-first', 'into your site'],
                ]}
              />
              <p className="needs">A workspace is a folder for your clips, kept apart from your product. Dolly only ever reads your product’s code, and <code>dolly init</code> writes a first scenario for you to edit.</p>
            </div>
          </div>
        </section>

        <section className="block wrap" id="prompts" aria-labelledby="prompts-h">
          <Head id="prompts-h" kicker="Prompts" title="Or just ask.">
            Dolly comes with a skill that tells your agent when to reach for it and how. Paste one of these into a session.
          </Head>
          <div className="prompts">
            {PROMPTS.map((p) => <Prompt key={p.title} {...p} />)}
          </div>
        </section>

        <section className="block wrap" id="reference" aria-labelledby="ref-h">
          <Head id="ref-h" kicker="Reference" title="Every command, and the numbers behind the camera.">
            Clips can be names or globs. Every command works in the nearest workspace, or pass <code>--workspace</code>. <code>dolly help &lt;command&gt;</code> lists a command’s flags.
          </Head>
          <div className="ref">
            <div className="table">
              {help.map((g) => (
                <div className="group" key={g.title}>
                  <h3>{g.title}</h3>
                  <dl>
                    {g.rows.map(([c, d]) => (
                      <div className="tr" key={c}><dt><code>{c}</code></dt><dd>{d}</dd></div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
            <div className="table grammar">
              <div className="group">
                <h3>The grammar</h3>
                <dl>
                  {GRAMMAR.map(([k, v]) => (
                    <div className="tr" key={k}><dt>{k}</dt><dd>{v}</dd></div>
                  ))}
                </dl>
              </div>
              <nav className="docs" aria-label="Docs">
                <h3>Docs</h3>
                {DOC_LINKS.map(([label, file]) => <a key={file} href={`${GITHUB}/blob/main/docs/${file}`}>{label}<ArrowIcon /></a>)}
              </nav>
            </div>
          </div>
        </section>

        <section className="end wrap" aria-label="Get started">
          <div>
            <p className="last">That’s the whole thing. Film it once, direct it as often as you like.</p>
            <div className="cta">
              <a className="btn btn-primary" href="#start">Install Dolly</a>
              <a className="arrow-link" href={GITHUB}>Star it on GitHub <ArrowIcon /></a>
            </div>
          </div>
          <div className="end-cmd">
            <Commands lines={[[`npm install -g ${PKG}`], ['dolly doctor']]} label="Install Dolly" />
            <p className="dim">Node 22 or newer, Google Chrome, ffmpeg and cwebp. MIT licensed, and free.</p>
          </div>
        </section>
      </main>

      <div className="wrap">
        <Reel frames={(tour?.storyboard ?? []).map((s) => media(s.file))} />
      </div>
      <footer className="foot wrap">
        <span>Made by Nischal Skanda. MIT license.</span>
        <nav aria-label="Elsewhere">
          <a href={GITHUB}>GitHub</a>
          <a href={NPM}>npm</a>
          <a href={DOCS}>Docs</a>
          <a href={`${GITHUB}/blob/main/LICENSE`}>License</a>
        </nav>
      </footer>
    </div>
  );
}
