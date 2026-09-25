/**
 * The docs, in reading order. Every page is built from the repo's own
 * markdown, so GitHub and the site read the same words; the CLI reference
 * is built from the commands themselves.
 *
 *   source    the markdown: a file, or sections picked out of several
 *   visuals   live pieces mounted beside the text, keyed by the heading they
 *             follow: `slug` puts it after the section's first block,
 *             `slug$` at the section's end, `_top` before the first heading;
 *             `replace: true` shows it in place of the section's first code
 *             block (a plain-text drawing of the same thing)
 *   children  a page's sections listed under it in the sidebar
 */
export const REPO = 'RexO77/dolly';
export const BRANCH = 'main';

export const PAGES = [
  {
    slug: '',
    nav: 'Start here',
    group: 'Get started',
    title: 'Start here',
    description: 'Install Dolly, check your machine, and make your first clip: a real product filmed with no cursor, directed by a camera.',
    source: [{ file: 'README.md', sections: ['_intro', 'What it does', 'Install', 'Quick start'] }],
    edit: 'README.md',
    visuals: { 'what-it-does$': 'pipeline' },
    children: [['install', 'Install'], ['quick-start', 'Quick start']],
  },
  {
    slug: 'how-it-works',
    nav: 'How it works',
    group: 'Guides',
    source: [{ file: 'docs/how-it-works.md' }],
    visuals: {
      'what-dolly-is': { visual: 'pipeline', replace: true },
      'how-dolly-finds-the-moments$': 'activity',
      'the-camera-grammar': { visual: 'grammar', replace: true },
      'the-wash': 'wash',
      'the-studio': 'studio-editor',
      'why-it-stays-sharp': 'sharp',
    },
  },
  {
    slug: 'studio',
    nav: 'The Studio',
    group: 'Guides',
    title: 'The Studio',
    description: 'The Studio plays your real take through the real camera. Retime shots, frame them, roll the zoom, fix what the notes flag, then Save and Render.',
    source: [
      { file: 'README.md', sections: ['On your own: the Studio'] },
      { file: 'docs/workflow.md', sections: ['The Studio'] },
    ],
    edit: 'README.md',
    visuals: {
      'on-your-own-the-studio': 'studio-editor',
      'on-your-own-the-studio$': ['lens', 'notes', 'snap', 'sounds'],
      'the-studio$': 'studio-home',
    },
  },
  { slug: 'scenarios', nav: 'Scenarios', group: 'Guides', source: [{ file: 'docs/scenarios.md' }] },
  {
    slug: 'camera',
    nav: 'The camera',
    group: 'Guides',
    source: [{ file: 'docs/camera.md' }],
    visuals: { 'spots': 'wash', 'the-grammar': 'grammar', 'sharpness': 'sharp', 'frame': 'frame' },
    children: [['the-grammar', 'The grammar'], ['spots', 'Washes'], ['frame', 'The Frame']],
  },
  { slug: 'workspaces', nav: 'Workspaces', group: 'Guides', source: [{ file: 'docs/workspaces.md' }] },
  { slug: 'workflow', nav: 'Workflow', group: 'Guides', source: [{ file: 'docs/workflow.md' }], visuals: { _top: 'pipeline' } },
  { slug: 'agents', nav: 'Agents', group: 'Guides', source: [{ file: 'docs/agents.md' }], visuals: { 'what-the-agent-does$': 'agent' } },
  {
    slug: 'cli',
    nav: 'CLI reference',
    group: 'Reference',
    title: 'CLI reference',
    description: 'Every dolly command: what it does, its flags and examples, from the commands themselves.',
    cli: true,
    edit: 'cli/commands',
  },
];
