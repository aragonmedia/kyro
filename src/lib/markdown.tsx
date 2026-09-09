/**
 * Kyro — Minimal markdown renderer
 *
 * Just enough to render the legal documents faithfully: headings, paragraphs,
 * lists, tables, blockquotes, rules, bold, inline code and links. Deliberately
 * not a general-purpose markdown library — pulling one in for two documents
 * would add a dependency and a bundle for no gain.
 *
 * Everything renders through the app's theme tokens so the pages work in light
 * and dark without a second pass.
 */

import type { ReactNode } from 'react';

/** Inline formatting: **bold**, `code`, [text](url). */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-i${i++}`;

    if (tok.startsWith('**')) {
      out.push(<strong key={key} className="font-semibold text-heading">{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith('`')) {
      out.push(
        <code key={key} className="px-1.5 py-0.5 rounded bg-surface-2 border border-line text-[0.9em] text-heading font-mono">
          {tok.slice(1, -1)}
        </code>
      );
    } else {
      const split = tok.indexOf('](');
      const label = tok.slice(1, split);
      const href = tok.slice(split + 2, -1);
      out.push(
        <a key={key} href={href} className="text-purple-400 hover:text-purple-300 underline underline-offset-2">
          {label}
        </a>
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function splitRow(line: string): string[] {
  return line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
}

export function Markdown({ source }: { source: string }) {
  const lines = source.split('\n');
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let key = 0;

  const flushPara = () => {
    if (!para.length) return;
    const text = para.join(' ');
    blocks.push(<p key={`p${key++}`} className="text-body leading-relaxed mb-4">{inline(text, `p${key}`)}</p>);
    para = [];
  };

  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`u${key++}`} className="list-disc pl-6 mb-5 space-y-2 marker:text-faint">
        {list.map((item, i) => (
          <li key={i} className="text-body leading-relaxed">{inline(item, `u${key}-${i}`)}</li>
        ))}
      </ul>
    );
    list = [];
  };

  const flushAll = () => { flushPara(); flushList(); };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();

    if (!t) { flushAll(); continue; }

    // Table: a header row followed by a --- separator row.
    if (t.startsWith('|') && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
      flushAll();
      const head = splitRow(t);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        rows.push(splitRow(lines[j].trim()));
        j++;
      }
      i = j - 1;
      blocks.push(
        <div key={`t${key++}`} className="overflow-x-auto mb-6 rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {head.map((h, hi) => (
                  <th key={hi} className="text-left font-semibold text-muted bg-surface-2 px-4 py-3 whitespace-nowrap border-b border-line">
                    {inline(h, `th${hi}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b border-line last:border-0">
                  {r.map((c, ci) => (
                    <td key={ci} className="px-4 py-3 align-top text-body">{inline(c, `td${ri}-${ci}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (t === '---') { flushAll(); blocks.push(<hr key={`h${key++}`} className="border-line my-10" />); continue; }

    if (t.startsWith('### ')) {
      flushAll();
      blocks.push(<h3 key={`h3${key++}`} className="text-lg font-bold text-heading mt-8 mb-3">{inline(t.slice(4), `h3${key}`)}</h3>);
      continue;
    }
    if (t.startsWith('## ')) {
      flushAll();
      blocks.push(<h2 key={`h2${key++}`} className="text-2xl font-bold text-heading mt-12 mb-4 scroll-mt-24">{inline(t.slice(3), `h2${key}`)}</h2>);
      continue;
    }
    if (t.startsWith('# ')) {
      flushAll();
      blocks.push(<h1 key={`h1${key++}`} className="text-3xl md:text-4xl font-bold text-heading mb-6">{inline(t.slice(2), `h1${key}`)}</h1>);
      continue;
    }

    if (t.startsWith('> ')) {
      flushAll();
      blocks.push(
        <blockquote key={`q${key++}`} className="border-l-2 border-purple-500 pl-4 py-1 mb-5 text-body italic">
          {inline(t.slice(2), `q${key}`)}
        </blockquote>
      );
      continue;
    }

    if (/^[-*] /.test(t)) { flushPara(); list.push(t.slice(2)); continue; }

    flushList();
    para.push(t);
  }

  flushAll();
  return <div className="max-w-none">{blocks}</div>;
}
