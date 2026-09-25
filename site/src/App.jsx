import { useEffect, useState } from 'react';
import * as grammar from '../../engine/camera/grammar.mjs';
import { Stage } from './Stage.jsx';
import { NoCursorDemo, LeanDemo, WashDemo, StudioDemo, AgentDemo } from './Demos.jsx';
import { Commands, Tabs, Prompt, ArrowIcon, Mark, CopyButton, Cart } from './parts.jsx';
import { media } from './hooks.js';

const GITHUB = 'https://github.com/RexO77/dolly';
const DOCS = `${GITHUB}/tree/main/docs`;
const NPM = 'https://www.npmjs.com/package/@nischalskanda/dolly';
const PKG = '@nischalskanda/dolly';

const AGENT_INSTALL = `Install Dolly with \`npm install -g ${PKG}\`, then run \`dolly doctor\` and fix anything it reports. Link Dolly's skill so you know when to reach for it: \`ln -s "$(npm root -g)/${PKG}/skill" ~/.claude/skills/dolly\` (or wherever your skills live).`;

const PROMPTS = [
  { title: 'A first clip', text: 'Record a clip of the settings page with Dolly: switch the theme to dark and let the change play. Add the product to my Dolly workspace if it is not there yet, then give me the storyboard command so I can direct it.' },
  { title: 'After a redesign', text: 'The billing page changed. Re-record every Dolly clip that shows it, check that each camera still sits on the change, render them, and show me which delivered files differ before you replace anything.' },
  { title: 'Lean somewhere else', text: 'In shop-first the camera leans in on the whole page. Lean in on the row that changes instead, and keep the wash on that row alone.' },
  { title: 'Cut the wait', text: 'The upload clip spends four seconds on a spinner. Cut the wait out with a crossfade, and keep the moment it finishes.' },
];

const COMMANDS = [
  ['dolly init [project]', 'make this folder a workspace, or add a product to it'],
  ['dolly record <project> <clip>', 'record a take in the real product, and direct it'],
  ['dolly storyboard <project> [clip]', 'open the Studio: watch, direct, save, render'],
  ['dolly render <project> [clip]', 'the clip and its poster, to out/'],
  ['dolly direct <project> [clip]', 'rebuild the camera from the take, without recording'],
  ['dolly poster <project> <clip> --at S', 'a poster from any moment'],
  ['dolly deliver <project> [clip]', 'copy the clip to the folder your site uses'],
  ['dolly inspect <project> [path]', 'what is on a page: its controls and their boxes'],
  ['dolly list [project]', 'every clip, and where it stands'],
  ['dolly doctor', 'check Node, Chrome, ffmpeg and cwebp'],
];

const GRAMMAR = [
  ['How far a lean goes in', `${grammar.LEAN_Z}×`],
  ['A lean or a pull back', `${grammar.SPRING}s, zero bounce`],
  ['Settled before the change', `${grammar.SETTLE}s`],
  ['The shortest wide hold', `${grammar.ESTABLISH}s`],
  ['A hop between neighbours', `${grammar.HOP}s`],
  ['Most of the frame a subject fills', `${Math.round(grammar.FOCUS_FILL * 100)}%`],
  ['The wash', `${Math.round(grammar.WASH_ALPHA * 100)}%, ${grammar.SPOT_RADIUS}px corners`],
];

const DOC_LINKS = [
  ['Scenarios', 'scenarios.md'],
  ['The camera', 'camera.md'],
  ['Workflow', 'workflow.md'],
  ['Workspaces', 'workspaces.md'],
  ['Agents', 'agents.md'],
];

function FilmPic() {
  return (
    <svg viewBox="0 0 160 100" aria-hidden="true">
      <rect x="8" y="8" width="144" height="84" rx="6" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <path d="M8 22h144" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1.5" />
      <circle cx="18" cy="15" r="2.2" fill="currentColor" fillOpacity="0.3" />
      <circle cx="26" cy="15" r="2.2" fill="currentColor" fillOpacity="0.3" />
      <rect x="20" y="32" width="42" height="6" rx="3" fill="currentColor" fillOpacity="0.25" />
      <rect x="20" y="46" width="120" height="8" rx="3" fill="currentColor" fillOpacity="0.12" />
      <rect x="20" y="60" width="120" height="8" rx="3" fill="currentColor" fillOpacity="0.12" />
      <rect x="20" y="74" width="80" height="8" rx="3" fill="currentColor" fillOpacity="0.12" />
      <circle cx="134" cy="35" r="4" fill="var(--wash-ink)" />
      <text x="126" y="38.5" textAnchor="end" fontFamily="var(--mono)" fontSize="9" fill="currentColor" fillOpacity="0.6">REC</text>
    </svg>
  );
}

function DirectPic() {
  return (
    <svg viewBox="0 0 160 100" aria-hidden="true">
      <rect x="8" y="8" width="144" height="84" rx="6" fill="var(--wash)" />
      <rect x="8" y="8" width="144" height="84" rx="6" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <rect x="26" y="40" width="74" height="30" rx="4" fill="var(--card)" />
      <rect x="32" y="47" width="46" height="6" rx="3" fill="currentColor" fillOpacity="0.3" />
      <rect x="32" y="58" width="60" height="6" rx="3" fill="currentColor" fillOpacity="0.15" />
      <rect x="18" y="30" width="96" height="50" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
      <path d="M18 36v-6h6M108 30h6v6M114 74v6h-6M24 80h-6v-6" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function RenderPic() {
  return (
    <svg viewBox="0 0 160 100" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5">
        <rect x="10" y="26" width="84" height="48" rx="4" />
        <path d="M10 36h84M10 64h84M38 36v28M66 36v28" />
      </g>
      <g fill="currentColor" fillOpacity="0.3">
        {[16, 26, 36, 46, 56, 66, 76, 86].map((x) => <rect key={`a${x}`} x={x} y="29.5" width="4" height="3" rx="1" />)}
        {[16, 26, 36, 46, 56, 66, 76, 86].map((x) => <rect key={`b${x}`} x={x} y="67.5" width="4" height="3" rx="1" />)}
      </g>
      <rect x="44" y="44" width="16" height="12" rx="2" fill="var(--wash)" />
      <path d="M100 50h14m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M122 28h18l8 8v36a2 2 0 0 1-2 2h-24a2 2 0 0 1-2-2V30a2 2 0 0 1 2-2z" fill="var(--card)" stroke="currentColor" strokeWidth="1.5" />
      <text x="135" y="58" textAnchor="middle" fontFamily="var(--mono)" fontSize="9" fill="currentColor">mp4</text>
    </svg>
  );
}

/** Body copy with `code` in backticks. */
const withCode = (text) => text.split(/`([^`]+)`/).map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));

const FEATURES = [
  {
    title: 'No cursor. Not even a little one.',
    body: [
      'Dolly plays your product with a hand you never see. All that’s left of it is what it touches: a row lights up, a switch flips, a button dips.',
      'Turn the cursor on and watch where your eye goes. That’s why it’s off.',
    ],
    Demo: NoCursorDemo,
  },
  {
    title: 'Lean in, hold still, pull back.',
    body: [
      'Every clip is shot the same way. Start wide so you know where you are, lean in about a third on a spring that never overshoots, hold dead still while the change plays, then step back so the result sits in context.',
      'That curve is the real one: the same code that renders your clip.',
    ],
    Demo: LeanDemo,
  },
  {
    title: 'A wash, not a ring.',
    body: [
      'To point at something, Dolly lays a warm wash over everything else. The part that matters stays lit, and nothing gets drawn on top of your product.',
      'Rings, arrows and glowing outlines were considered. Briefly. Try the ring.',
    ],
    Demo: WashDemo,
  },
  {
    title: 'Direct it like a film.',
    body: [
      '`dolly storyboard` opens the Studio: your real take through the real camera, laid out as shots. Drag a shot to retime it, pick what it leans on, save.',
      'What you see there is what renders, to the pixel, because it runs the same camera code.',
    ],
    Demo: StudioDemo,
  },
  {
    title: 'Your agent does the boring half.',
    body: [
      'Adding the product, finding the buttons, writing the script, recording the take: an agent can do all of it. Every step is a plain command, so any agent with a shell can drive Dolly.',
      'Then it hands you the Studio, because the camera needs taste.',
    ],
    Demo: AgentDemo,
  },
];

export function App() {
  const [tour, setTour] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch(media('tour.json')).then((r) => r.json()).then(setTour, () => setFailed(true));
  }, []);

  return (
    <div className="page">
      <a className="skip" href="#main">Skip to content</a>
      <header className="top wide">
        <a className="mark" href="#top" aria-label="Dolly, home"><Mark />Dolly</a>
        <nav aria-label="Site">
          <a href="#install">Install</a>
          <a href={DOCS}>Docs</a>
          <a href={GITHUB}>GitHub</a>
        </nav>
      </header>

      <main id="main">
        <section className="hero wide" id="top">
          <h1>Film your product.<br /> Then direct the camera.</h1>
          <div>
            <p className="lede">Dolly records your web app in Chrome with no cursor in sight, then moves a camera over the take: in close where something changes, still while it happens, back out to show the result. You get a clip that’s ready for your site.</p>
            <div className="cta">
              <a className="btn" href="#install">Install Dolly</a>
              <a className="arrow-link" href={DOCS}>Read the docs <ArrowIcon /></a>
            </div>
          </div>
        </section>

        <div className="wide">
          {tour ? <Stage tour={tour} /> : (
            <div className="stage">
              <div className="stage-bar" />
              <div className="frame"><img src={media('take.webp')} alt="Wrenly, a project tracker, as recorded" width="1600" height="1000" /></div>
              {failed && <p className="note">The live clip could not load. <a href={media('directed.mp4')}>Watch the rendered clip</a>.</p>}
            </div>
          )}
        </div>

        <section className="pitch wide" aria-label="Why">
          <p>A screen recording shows everything and points at nothing. <span>Dolly points, then gets out of the way.</span></p>
        </section>

        <section className="features wide" aria-label="How Dolly shoots a clip">
          {FEATURES.map(({ title, body, Demo }) => (
            <article className="feature" key={title}>
              {tour ? <Demo tour={tour} /> : <div className="demo" style={{ aspectRatio: '16 / 11' }} />}
              <div className="feature-text">
                <h3>{title}</h3>
                {body.map((p) => <p key={p}>{withCode(p)}</p>)}
              </div>
            </article>
          ))}
        </section>

        <section className="block wide" id="install" aria-labelledby="install-h">
          <div className="col" style={{ margin: 0 }}>
          <p className="kicker">Install</p>
          <h2 id="install-h">One line, then a checkup.</h2>
          <p className="intro">Dolly is a command line tool. Install it once, globally, with whatever you already use.</p>
          <Tabs
            label="Install with"
            tabs={{
              npm: <Commands lines={[[`npm install -g ${PKG}`]]} label="Install with npm" />,
              pnpm: <Commands lines={[[`pnpm add -g ${PKG}`]]} label="Install with pnpm" />,
              yarn: <Commands lines={[[`yarn global add ${PKG}`, 'Yarn 1; on Yarn 2+, yarn dlx']]} label="Install with yarn" />,
              bun: <Commands lines={[[`bun add -g ${PKG}`]]} label="Install with bun" />,
              agent: (
                <div className="code">
                  <pre className="wrap">{AGENT_INSTALL}</pre>
                  <CopyButton text={AGENT_INSTALL} label="Copy the prompt" />
                </div>
              ),
            }}
          />
          <p className="needs">Then run <code>dolly doctor</code>. It checks for Node 22 or newer, Google Chrome, ffmpeg and cwebp, and prints the exact fix for anything missing (on a Mac, <code>brew install ffmpeg webp</code>). Dolly uses the Chrome you already have. It never downloads a browser.</p>
          </div>
        </section>

        <section className="block wide" id="start" aria-labelledby="start-h">
          <div className="col" style={{ margin: 0 }}>
          <p className="kicker">Quick start</p>
          <h2 id="start-h">Your first clip.</h2>
          <p className="intro">A workspace is a folder for your clips, kept apart from your product. Dolly only ever reads your product’s code.</p>
          <div style={{ marginTop: 28 }}>
            <Commands
              label="Quick start"
              lines={[
                ['mkdir clips && cd clips'],
                ['dolly init', 'this folder is now a workspace'],
                ['dolly init shop --from ~/code/shop', 'add your product'],
                ['dolly record shop shop-first', 'a take, no cursor'],
                ['dolly storyboard shop shop-first', 'watch it, direct it'],
                ['dolly render shop shop-first', 'out/shop/shop-first.mp4'],
              ]}
            />
          </div>
          </div>
        </section>

        <section className="block wide" id="how" aria-labelledby="how-h">
          <div className="col" style={{ margin: 0 }}>
            <p className="kicker">How it works</p>
            <h2 id="how-h">Film, direct, render.</h2>
            <p className="intro">Each step starts from what the last one saved, so you can re-direct or re-render without filming again.</p>
          </div>
          <div className="steps">
            <div className="step">
              <div className="pic"><FilmPic /></div>
              <h3><span>1</span>Film</h3>
              <p>A short script says what the hand does. Dolly plays it in your real product and keeps the take, at retina size.</p>
            </div>
            <div className="step">
              <div className="pic"><DirectPic /></div>
              <h3><span>2</span>Direct</h3>
              <p>The take’s moments become shots: lean in here, hold, pull back. Adjust them in the Studio, or in code.</p>
            </div>
            <div className="step">
              <div className="pic"><RenderPic /></div>
              <h3><span>3</span>Render</h3>
              <p>Every frame goes through the camera into an MP4 and a poster, ready for a README, a case study or a landing page.</p>
            </div>
          </div>
        </section>

        <section className="block wide" id="prompts" aria-labelledby="prompts-h">
          <div className="col" style={{ margin: 0 }}>
            <p className="kicker">Prompts</p>
            <h2 id="prompts-h">Or just ask.</h2>
            <p className="intro">Dolly comes with a skill that tells your agent when to reach for it and how. Paste one of these into a session.</p>
          </div>
          <div className="prompts">
            {PROMPTS.map((p) => <Prompt key={p.title} {...p} />)}
          </div>
        </section>

        <section className="block wide" id="reference" aria-labelledby="ref-h">
          <div className="col" style={{ margin: 0 }}>
            <p className="kicker">Reference</p>
            <h2 id="ref-h">Every command, and the numbers behind the camera.</h2>
            <p className="intro">Clips can be names or globs. Every command works in the nearest workspace, or pass <code>--workspace</code>. <code>dolly help &lt;command&gt;</code> lists its flags.</p>
          </div>
          <div className="ref">
            <div className="table">
              <h3>Commands</h3>
              <dl>
                {COMMANDS.map(([c, d]) => (
                  <div className="tr" key={c}><dt><code>{c}</code></dt><dd>{d}</dd></div>
                ))}
              </dl>
            </div>
            <div className="table grammar">
              <h3>The grammar</h3>
              <dl>
                {GRAMMAR.map(([k, v]) => (
                  <div className="tr" key={k}><dt>{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>
            </div>
          </div>
          <nav className="docs" aria-label="Docs">
            {DOC_LINKS.map(([label, file]) => <a key={file} href={`${GITHUB}/blob/main/docs/${file}`}>{label}</a>)}
          </nav>
        </section>

        <section className="end wide" aria-label="Get started">
          <p className="last">That’s the whole thing. Film it once, direct it as often as you like.</p>
          <div className="cta">
            <a className="btn" href="#install">Install Dolly</a>
            <a className="arrow-link" href={GITHUB}>Star it on GitHub <ArrowIcon /></a>
          </div>
        </section>
      </main>

      <div className="rule wide" aria-hidden="true">
        <div className="rails"><div className="sleepers" /></div>
        <div className="cart"><Cart /></div>
      </div>
      <footer className="foot wide">
        <span>Made by Nischal Skanda</span>
        <nav aria-label="Elsewhere">
          <a href={GITHUB}>GitHub</a>
          <a href={NPM}>npm</a>
          <a href={DOCS}>Docs</a>
          <a href={`${GITHUB}/blob/main/LICENSE`}>MIT license</a>
        </nav>
      </footer>
    </div>
  );
}
