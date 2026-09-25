import { useEffect, useState } from 'react';
import { Stage } from './Stage.jsx';
import { Commands, Tabs, Prompt, Mark, CopyButton, Reel } from './parts.jsx';
import { media, storedTheme } from './hooks.js';

const GITHUB = 'https://github.com/RexO77/dolly';
const DOCS = `${import.meta.env.BASE_URL}docs/`;
const PKG = '@nischalskanda/dolly';
const INSTALL = `npm install -g ${PKG}`;

const PROMPT = 'Record a clip of the settings page with Dolly: switch the theme to dark and let the change play. Add the product to my Dolly workspace if it is not there yet, then give me the Studio command so I can direct it.';

const STEPS = [
  { title: 'Film', file: 'raw.webp', alt: 'A frame of the raw take: Wrenly, the whole screen, an issue just marked done', text: 'Dolly plays your product in Chrome from a short script. No cursor.' },
  { title: 'Direct', file: 'studio-shot.webp', alt: 'The same moment in the Studio, with the lean on the issue open', text: 'Watch the take in the Studio and tell the camera where to look.' },
  { title: 'Render', file: 'finished.webp', alt: 'The same frame as rendered: leaned in on the issue, the rest under a warm wash', text: 'Get an MP4 and a poster, ready for your site.' },
];

function InstallChip() {
  return (
    <div className="chip">
      <code><span className="p">$ </span>{INSTALL}</code>
      <CopyButton text={INSTALL} label="Copy the install command" />
    </div>
  );
}

export function App() {
  const [tour, setTour] = useState(null);
  const [failed, setFailed] = useState(false);
  const theme = storedTheme();
  useEffect(() => {
    fetch(media('tour.json')).then((r) => r.json()).then(setTour, () => setFailed(true));
  }, []);

  return (
    <div className="page">
      <a className="skip" href="#main">Skip to content</a>
      <header className="top">
        <div className="wrap top-inner">
          <a className="mark" href="#top" aria-label="Dolly, home"><Mark theme={theme} />Dolly</a>
          <nav aria-label="Site">
            <a href={DOCS}>Docs</a>
            <a href={GITHUB}>GitHub</a>
          </nav>
          <a className="btn btn-primary btn-small" href="#install">Install</a>
        </div>
      </header>

      <main id="main">
        <section className="hero wrap" id="top" aria-labelledby="hero-h">
          <h1 id="hero-h">Film your product.<br /> Then direct the camera.</h1>
          <p className="lede">Dolly records your web app with no cursor, then moves a camera over the take: in where it changes, still while it plays, back out for the result.</p>
          <InstallChip />
        </section>

        <div className="wrap">
          {tour ? <Stage tour={tour} /> : (
            <div className="stage">
              <div className="viewport"><div className="frame"><img className="poster" src={media('take.webp')} alt="Wrenly, a project tracker, as recorded" width="1600" height="1000" /></div></div>
              {failed && <p className="note">The live clip could not load. <a href={media('directed.mp4')}>Watch the rendered clip</a>.</p>}
            </div>
          )}
        </div>

        <section className="block wrap" aria-labelledby="how-h">
          <h2 id="how-h" className="section-title">Film it, direct it, render it.</h2>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li className="step" key={s.title}>
                <div className="screen">
                  <img src={media(s.file)} alt={s.alt} width="1440" height="900" loading="lazy" />
                </div>
                <h3><span>{i + 1}</span>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="block wrap" id="install" aria-labelledby="install-h">
          <h2 id="install-h" className="section-title">Install it, then make your first clip.</h2>
          <div className="start">
            <div className="card">
              <Tabs
                label="Install with"
                tabs={{
                  npm: <Commands lines={[[INSTALL]]} label="Install with npm" />,
                  pnpm: <Commands lines={[[`pnpm add -g ${PKG}`]]} label="Install with pnpm" />,
                  yarn: <Commands lines={[[`yarn global add ${PKG}`]]} label="Install with yarn" />,
                  bun: <Commands lines={[[`bun add -g ${PKG}`]]} label="Install with bun" />,
                }}
              />
              <p className="needs">Needs Node 22, Chrome, ffmpeg and cwebp. <code>dolly doctor</code> checks.</p>
            </div>
            <div className="card">
              <Commands
                label="Your first clip"
                lines={[
                  ['dolly init'],
                  ['dolly init shop --from ~/code/shop'],
                  ['dolly record shop first'],
                  ['dolly studio shop first'],
                ]}
              />
              <p className="needs">The <a href={DOCS}>docs</a> have the rest.</p>
            </div>
          </div>
        </section>

        <section className="block wrap agents" aria-labelledby="agents-h">
          <div>
            <h2 id="agents-h" className="section-title">Or ask your agent.</h2>
            <p className="intro">Dolly ships with a skill, so any coding agent can film the take and hand you the Studio.</p>
          </div>
          <Prompt title="Paste this into a session" text={PROMPT} />
        </section>

        <section className="end wrap" aria-label="Get started">
          <p className="last">Film it once. Direct it as often as you like.</p>
          <a className="btn btn-primary" href="#install">Install Dolly</a>
        </section>
      </main>

      <div className="wrap">
        <Reel frames={(tour?.storyboard ?? []).map((s) => media(s.file))} />
      </div>
      <footer className="foot wrap">
        <span>Made by Nischal Skanda. MIT license.</span>
        <nav aria-label="Elsewhere">
          <a href={DOCS}>Docs</a>
          <a href={GITHUB}>GitHub</a>
          <a href="https://www.npmjs.com/package/@nischalskanda/dolly">npm</a>
        </nav>
      </footer>
    </div>
  );
}
