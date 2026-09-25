/**
 * The docs, prerendered: each page in pages.mjs becomes a real
 * docs/<slug>/index.html, so a deep link survives a refresh on GitHub
 * Pages. The words are the repo's markdown, rendered here at build time
 * with its code highlighted, its links pointed at the site (between docs)
 * or at GitHub (to code), and placeholders where a live visual mounts.
 * The CLI reference is built from cli/commands/*.mjs, the data `dolly help`
 * prints.
 *
 * In dev, a middleware renders the same pages on request.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Marked } from 'marked';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import xml from 'highlight.js/lib/languages/xml';
import markdown from 'highlight.js/lib/languages/markdown';
import { PAGES, REPO, BRANCH } from './pages.mjs';

hljs.registerLanguage('js', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('md', markdown);

const GITHUB = `https://github.com/${REPO}`;
const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plain = (html) => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
/** GitHub's heading anchors: lower case, spaces to hyphens, punctuation dropped. */
export const slugify = (text) => plain(text).toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');

const ICON_COPY = '<svg class="cp" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="7" height="7" rx="1.5"/><path d="M10.5 3.5H5A1.5 1.5 0 0 0 3.5 5v5.5"/></svg>';
const ICON_OK = '<svg class="ok" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5"/></svg>';
const ICON_ARROW = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8h9M9 4.5 12.5 8 9 11.5"/></svg>';
const ICON_BACK = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 8h-9M7 4.5 3.5 8 7 11.5"/></svg>';

export function codeBlock(text, lang) {
  const language = lang === 'sh' || lang === 'bash' || lang === 'shell' ? 'sh' : lang;
  const body = language && hljs.getLanguage(language) ? hljs.highlight(text, { language }).value : escape(text);
  return `<div class="code doc-code"><pre tabindex="0"><code class="hljs${language ? ` lang-${language}` : ''}">${body}</code></pre><button type="button" class="copy" aria-label="Copy the code" data-copy><span class="icons" aria-hidden="true">${ICON_COPY}${ICON_OK}</span></button></div>\n`;
}

/* ── Sources ── */

function tokensOf(root, file) {
  return new Marked().lexer(readFileSync(join(root, file), 'utf8'));
}

/** The tokens of one section (its heading and everything under it), or of the intro under the title. */
function section(tokens, name) {
  if (name === '_intro') {
    const h1 = tokens.findIndex((t) => t.type === 'heading' && t.depth === 1);
    const end = tokens.findIndex((t, i) => i > h1 && t.type === 'heading');
    return tokens.slice(h1 + 1, end).filter((t) => t.type === 'paragraph' || t.type === 'space');
  }
  const i = tokens.findIndex((t) => t.type === 'heading' && t.text === name);
  if (i < 0) throw new Error(`docs: no section "${name}"`);
  const depth = tokens[i].depth;
  const end = tokens.findIndex((t, j) => j > i && t.type === 'heading' && t.depth <= depth);
  return tokens.slice(i, end < 0 ? undefined : end);
}

/** A page's tokens, each taken from its file with its headings brought to one level: a section's own heading becomes h2. */
function pageTokens(root, page) {
  const out = [];
  let title = page.title;
  for (const src of page.source) {
    const all = tokensOf(root, src.file);
    if (!src.sections) {
      const h1 = all.find((t) => t.type === 'heading' && t.depth === 1);
      title ??= h1?.text;
      out.push(...all.filter((t) => t !== h1).map((t) => ({ ...t, from: src.file })));
      continue;
    }
    for (const name of src.sections) {
      const part = section(all, name);
      const top = part.find((t) => t.type === 'heading')?.depth ?? 2;
      out.push(...part.map((t) => (t.type === 'heading' ? { ...t, depth: Math.max(2, t.depth - (top - 2)), from: src.file } : { ...t, from: src.file })));
    }
  }
  return { title, tokens: out };
}

/* ── Visuals ── */

const visualDiv = (name) => ({ type: 'html', raw: '', text: `<div class="doc-visual" data-visual="${name}"></div>\n`, block: true });

/** Put each visual beside the section it explains. */
function placeVisuals(tokens, visuals = {}) {
  const want = Object.entries(visuals).map(([key, v]) => {
    const spec = typeof v === 'string' || Array.isArray(v) ? { visual: v } : v;
    const names = [spec.visual].flat();
    return { key, names, replace: spec.replace };
  });
  const out = [...tokens];
  const slugs = out.map((t) => (t.type === 'heading' ? slugify(t.text) : null));
  const insert = (at, names) => {
    out.splice(at, 0, ...names.map(visualDiv));
    slugs.splice(at, 0, ...names.map(() => null));
  };
  for (const { key, names, replace } of want) {
    if (key === '_top') {
      const first = out.findIndex((t) => t.type === 'heading');
      insert(first < 0 ? out.length : first, names);
      continue;
    }
    const atEnd = key.endsWith('$');
    const slug = atEnd ? key.slice(0, -1) : key;
    const h = slugs.indexOf(slug);
    if (h < 0) throw new Error(`docs: no heading "${slug}" for the visual ${names}`);
    const depth = out[h].depth;
    let end = out.findIndex((t, i) => i > h && t.type === 'heading' && t.depth <= depth);
    if (end < 0) end = out.length;
    if (replace) {
      const code = out.findIndex((t, i) => i > h && i < end && t.type === 'code');
      if (code < 0) throw new Error(`docs: no code block to replace under "${slug}"`);
      out.splice(code, 1, ...names.map(visualDiv));
      slugs.splice(code, 1, ...names.map(() => null));
    } else if (atEnd) {
      insert(end, names);
    } else {
      const first = out.findIndex((t, i) => i > h && t.type !== 'space');
      insert(first < 0 || first >= end ? end : first + 1, names);
    }
  }
  return out;
}

/* ── Rendering ── */

/** Where a link in `from` should go: a docs page on the site, or the file on GitHub. */
function linkFor(root, base, from, href) {
  if (/^[a-z]+:/i.test(href) || href.startsWith('#')) return href;
  const [path, hash] = href.split('#');
  const target = normalize(join(dirname(from), path)).replace(/\\/g, '/');
  const anchor = hash ? `#${hash}` : '';
  const page = PAGES.find((p) => p.source?.some((s) => s.file === target && !s.sections));
  if (page) return `${base}docs/${page.slug ? `${page.slug}/` : ''}${anchor}`;
  if (target === 'README.md') return `${base}docs/${anchor}`;
  const kind = existsSync(join(root, target)) && statSync(join(root, target)).isDirectory() ? 'tree' : 'blob';
  return `${GITHUB}/${kind}/${BRANCH}/${target}${anchor}`;
}

function render(root, base, tokens) {
  const toc = [];
  const used = new Map();
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens: inner, depth, text }) {
        let id = slugify(text);
        const n = used.get(id) ?? 0;
        used.set(id, n + 1);
        if (n) id = `${id}-${n}`;
        const html = this.parser.parseInline(inner);
        if (depth <= 3) toc.push({ id, depth, text: plain(html) });
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to this section">#</a>${html}</h${depth}>\n`;
      },
      code({ text, lang }) {
        return codeBlock(text, (lang || '').trim());
      },
      table(token) {
        const cells = (row) => row.map((c) => `<${c.header ? 'th' : 'td'}${c.align ? ` style="text-align:${c.align}"` : ''}>${this.parser.parseInline(c.tokens)}</${c.header ? 'th' : 'td'}>`).join('');
        /* A table whose header cells are all empty (a list laid out as rows) gets no header row. */
        const head = token.header.some((c) => c.text.trim()) ? `<thead><tr>${cells(token.header)}</tr></thead>` : '';
        return `<div class="table-wrap"><table>${head}<tbody>${token.rows.map((r) => `<tr>${cells(r)}</tr>`).join('')}</tbody></table></div>\n`;
      },
      html({ text }) {
        /* Only the visuals' placeholders; the markdown's own HTML (the README's badge picture) is for GitHub. */
        return text.includes('doc-visual') ? text : '';
      },
    },
  });
  /* Point every link where it belongs, from the file its block came from. */
  const walk = (t, from) => {
    if (!t || typeof t !== 'object') return;
    if (t.type === 'link') t.href = linkFor(root, base, from, t.href);
    for (const key of ['tokens', 'items', 'rows', 'header']) {
      const v = t[key];
      if (Array.isArray(v)) v.forEach((c) => (Array.isArray(c) ? c.forEach((cc) => walk(cc, from)) : walk(c, from)));
    }
  };
  for (const t of tokens) walk(t, t.from);
  const list = Object.assign([...tokens], { links: {} });
  return { html: marked.parser(list), toc };
}

/* ── The CLI reference, from the commands ── */

async function cliTokens(root) {
  const dir = join(root, 'cli/commands');
  const commands = Object.fromEntries(await Promise.all(readdirSync(dir).filter((f) => f.endsWith('.mjs')).map(async (f) => [f.slice(0, -4), await import(pathToFileURL(join(dir, f)).href)])));
  const help = execFileSync(process.execPath, ['bin/dolly.mjs', '--help'], { cwd: root, encoding: 'utf8' });
  const groups = [];
  for (const block of help.split(/\n\s*\n/)) {
    const [title, ...lines] = block.split('\n');
    const names = lines.map((l) => /^ {2}dolly (\S+)/.exec(l)?.[1]).filter((n) => n && commands[n]);
    if (names.length) groups.push({ title, names });
  }
  const global = /Every command takes\n([\s\S]+?)\n\n/.exec(help)?.[1].split('\n').map((l) => /^ {2}(\S+(?: [A-Z]+)?) {2,}(.+)$/.exec(l)).filter(Boolean) ?? [];
  /* The help's words are plain text: keep a <project> from reading as an HTML tag. */
  const safe = (text) => text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const para = (text) => text.split(/\n\s*\n/).map((p) => safe(p.replace(/\s*\n\s*/g, ' ').trim()));
  let md = 'Every command, as `dolly help <command>` prints it. Clips can be names or globs, like `\'settings-*\'`.\n\n';
  if (global.length) md += `Every command takes:\n\n| Flag | What it does |\n| --- | --- |\n${global.map(([, f, d]) => `| \`${f}\` | ${safe(d)} |`).join('\n')}\n\n`;
  for (const g of groups) {
    md += `## ${g.title}\n\n`;
    for (const name of g.names) {
      const c = commands[name];
      md += `### dolly ${name}\n\n\`\`\`sh\ndolly ${c.usage}\n\`\`\`\n\n${safe(c.summary)}.\n\n`;
      if (c.details) md += `${para(c.details).join('\n\n')}\n\n`;
      if (c.flags?.length) md += `| Flag | What it does |\n| --- | --- |\n${c.flags.map(([f, d]) => `| \`${f}\` | ${safe(d).replace(/\|/g, '\\|')} |`).join('\n')}\n\n`;
      if (c.examples?.length) md += `\`\`\`sh\n${c.examples.join('\n')}\n\`\`\`\n\n`;
      if (c.aliases?.length) md += `Also runs as ${c.aliases.map((a) => `\`dolly ${a}\``).join(', ')}.\n\n`;
    }
  }
  return new Marked().lexer(md).map((t) => ({ ...t, from: 'cli/commands/index.md' }));
}

/* ── Pages ── */

export const urlOf = (base, page) => `${base}docs/${page.slug ? `${page.slug}/` : ''}`;

function sidebar(base, current) {
  const groups = [...new Set(PAGES.map((p) => p.group))];
  return groups.map((g) => `<div class="side-group"><p class="side-title">${escape(g)}</p><ul>${PAGES.filter((p) => p.group === g).map((p) => {
    const here = p === current;
    const kids = p.children ? `<ul class="side-kids">${p.children.map(([id, label]) => `<li><a href="${urlOf(base, p)}#${id}">${escape(label)}</a></li>`).join('')}</ul>` : '';
    return `<li><a href="${urlOf(base, p)}"${here ? ' aria-current="page"' : ''}>${escape(p.nav)}</a>${kids}</li>`;
  }).join('')}</ul></div>`).join('');
}

function tocHtml(toc) {
  const items = toc.filter((t) => t.depth === 2 || t.depth === 3);
  if (items.length < 2) return '';
  return `<p class="toc-title">On this page</p><ul>${items.map((t) => `<li class="d${t.depth}"><a href="#${t.id}">${escape(t.text)}</a></li>`).join('')}</ul>`;
}

/** Every page, rendered: [{page, url, title, description, html (the main column), toc, sidebar, search}]. */
export async function buildDocs(root, base) {
  const out = [];
  for (const page of PAGES) {
    let title;
    let tokens;
    if (page.cli) {
      title = page.title;
      tokens = await cliTokens(root);
    } else {
      ({ title, tokens } = pageTokens(root, page));
    }
    tokens = placeVisuals(tokens, page.visuals);
    const { html, toc } = render(root, base, tokens);
    const lead = plain((/<p>([\s\S]*?)<\/p>/.exec(html) ?? [])[1] ?? '');
    const description = page.description ?? (lead.length > 180 ? `${lead.slice(0, lead.lastIndexOf(' ', 170))}…` : lead);
    out.push({ page, url: urlOf(base, page), title, description, html, toc });
  }
  return out.map((d, i) => {
    const prev = out[i - 1];
    const next = out[i + 1];
    const file = d.page.edit ?? d.page.source?.[0]?.file;
    const isDir = d.page.cli;
    const links = [
      `<a href="${GITHUB}/${isDir ? 'tree' : 'edit'}/${BRANCH}/${file}">Edit on GitHub</a>`,
      isDir ? '' : `<a href="${GITHUB}/blob/${BRANCH}/${file}?plain=1">View the markdown</a>`,
    ].filter(Boolean).join('');
    const pager = `<nav class="pager" aria-label="Pages">${prev ? `<a class="prev" href="${prev.url}"><span>${ICON_BACK} Previous</span><b>${escape(prev.page.nav)}</b></a>` : '<span></span>'}${next ? `<a class="next" href="${next.url}"><span>Next ${ICON_ARROW}</span><b>${escape(next.page.nav)}</b></a>` : '<span></span>'}</nav>`;
    const main = `<p class="kicker">${escape(d.page.group)}</p><h1>${escape(d.title)}</h1><div class="doc-links">${links}</div><article class="prose">${d.html}</article>${pager}`;
    return { ...d, main, toc: tocHtml(d.toc), headings: d.toc, sidebar: sidebar(base, d.page) };
  });
}

/** What the search looks through: every page and every heading on it. */
export function searchIndex(docs) {
  return docs.map((d) => {
    /* Each heading carries the start of its section, so a word in the text finds the heading above it. */
    const sectionText = (id) => {
      const at = d.html.indexOf(`id="${id}"`);
      if (at < 0) return '';
      const rest = d.html.slice(d.html.indexOf('>', at) + 1);
      const end = rest.search(/<h[1-6] id=/);
      return plain(end < 0 ? rest : rest.slice(0, end)).replace(/\s+/g, ' ').replace(/^#/, '').trim().slice(0, 600);
    };
    return { title: d.title, nav: d.page.nav, url: d.url, text: d.description, headings: d.headings.map((h) => ({ text: h.text, url: `${d.url}#${h.id}`, body: sectionText(h.id) })) };
  });
}

/** A page: the built template with the page's words filled in. */
export function fill(template, d, base) {
  const docTitle = d.page.slug ? `${d.title}: Dolly docs` : 'Dolly docs';
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${escape(docTitle)}</title>`)
    .replace('<!--docs-meta-->', `<meta name="description" content="${escape(d.description)}"><meta property="og:title" content="${escape(docTitle)}"><meta property="og:description" content="${escape(d.description)}"><link rel="canonical" href="https://rexo77.github.io${d.url}">`)
    .replaceAll('<!--base-->', base)
    .replace('<!--docs-sidebar-->', d.sidebar)
    .replace('<!--docs-main-->', d.main)
    .replace('<!--docs-toc-->', d.toc);
}

/**
 * The Vite plugin. `site/docs.html` is the template, built like any page;
 * then each docs page is written from it to docs/<slug>/index.html, with
 * docs/search.json beside them. In dev the same pages render on request.
 */
export function docsPlugin(root) {
  let base = '/';
  const template = join(root, 'site/docs.html');
  return {
    name: 'dolly-docs',
    enforce: 'post',
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      server.watcher.add([join(root, 'docs'), join(root, 'README.md'), join(root, 'cli/commands')]);
      server.middlewares.use(async (req, res, next) => {
        const url = req.url.split('?')[0];
        if (!url.startsWith(`${base}docs`)) return next();
        try {
          const docs = await buildDocs(root, base);
          if (url === `${base}docs/search.json`) {
            res.setHeader('content-type', 'application/json');
            return res.end(JSON.stringify(searchIndex(docs)));
          }
          const want = url.endsWith('/') ? url : `${url}/`;
          const d = docs.find((x) => x.url === want);
          if (!d) return next();
          const html = await server.transformIndexHtml(url, fill(readFileSync(template, 'utf8'), d, base));
          res.setHeader('content-type', 'text/html');
          return res.end(html);
        } catch (e) {
          return next(e);
        }
      });
    },
    async generateBundle(_options, bundle) {
      const key = Object.keys(bundle).find((k) => k.endsWith('docs.html'));
      if (!key) return;
      const built = bundle[key].source;
      delete bundle[key];
      const docs = await buildDocs(root, base);
      for (const d of docs) {
        this.emitFile({ type: 'asset', fileName: `${d.url.slice(base.length)}index.html`, source: fill(built, d, base) });
      }
      this.emitFile({ type: 'asset', fileName: 'docs/search.json', source: JSON.stringify(searchIndex(docs)) });
    },
  };
}
