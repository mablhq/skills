// The frontmatter reader for validate-skills.mjs. Its own module so the folding
// rules — the part with real edge cases, and the part the description budget is
// measured against — can be unit-tested without running the validator.

// A `#` starts a comment when it follows whitespace, so a loader drops the rest
// of the line. Plain scalars only: inside quotes and inside a block scalar the
// `#` is literal content.
const stripComment = (line) => line.replace(/\s+#.*$/, '');

// Fold a block scalar's lines the way its indicator says. `|` keeps every line
// break; `>` folds a single break between two non-empty lines to a space and a
// run of n breaks to n-1 newlines. Getting this wrong is length-neutral for one
// break, so the budget check won't notice — but any consumer reading the text
// gets YAML-incorrect content.
const foldBlock = (lines, folded) => {
  if (!folded) return lines.join('\n');
  const out = [];
  let blanks = 0;
  for (const line of lines) {
    if (line === '') { blanks += 1; continue; }
    if (out.length) out.push(blanks === 0 ? ' ' : '\n'.repeat(blanks));
    out.push(line);
    blanks = 0;
  }
  return out.join('');
};

// Chomping decides the trailing newlines: `-` strips them, `+` keeps them all,
// and the default — clip — keeps exactly one. Clip is what every skill uses, so
// dropping that newline measured every block-scalar description one short.
const chomp = (value, indicator) => {
  if (indicator === '+') return value;
  const stripped = value.replace(/\n+$/, '');
  return indicator === '-' || stripped === '' ? stripped : `${stripped}\n`;
};

// Reader for the flat `key: value` and block-scalar shape a SKILL.md uses, so
// this script stays dependency-free like its siblings. Returns the top-level
// keys in source order, each key's resolved string value, and the body after
// the closing delimiter.
export function parseFrontmatter(raw) {
  // Strip the CR a CRLF checkout leaves on every line — git's default on
  // Windows, and CLAUDE.md tells contributors to run this locally. \r is a line
  // terminator to a JS regex, so the key pattern below stops matching and every
  // key reads as absent: a valid file reports as having no name at all.
  const lines = raw.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
  if (lines[0]?.trim() !== '---') return null;
  // A flush-left `---` ends a block scalar before it closes the document, which
  // is what a loader does too — block content has to be indented past its key —
  // so this blind scan agrees with YAML rather than truncating early.
  const closing = lines.findIndex((line, index) => index > 0 && /^---\s*$/.test(line));
  if (closing === -1) return null;

  const keys = [];
  const values = {};
  for (let i = 1; i < closing; i++) {
    // Continuation lines of a block scalar are indented, so they never match
    // this anchored pattern — the block-scalar branch below consumes them.
    const match = /^([A-Za-z0-9_-]+):(.*)$/.exec(lines[i]);
    if (!match) continue;
    const [, key, rest] = match;
    keys.push(key);
    const inline = rest.trim();
    const blockHeader = /^([|>])([-+]?)\d*\s*(?:#.*)?$/.exec(inline);

    if (blockHeader) {
      const [, style, indicator] = blockHeader;
      const block = [];
      let end = i + 1;
      for (; end < closing; end++) {
        if (lines[end].trim() === '' || /^\s/.test(lines[end])) block.push(lines[end].trim());
        else break;
      }
      values[key] = chomp(foldBlock(block, style === '>'), indicator);
      i = end - 1;
    } else if (inline === '') {
      // A nested mapping or list. Its indented lines belong to this key, so
      // consume them — none of the checked keys use that shape.
      values[key] = '';
      let end = i + 1;
      for (; end < closing; end++) {
        if (lines[end].trim() === '' || /^\s/.test(lines[end])) continue;
        break;
      }
      i = end - 1;
    } else {
      // A plain or quoted scalar can continue onto indented lines, which a YAML
      // loader folds into the value with single spaces. Fold them the same way —
      // measuring only the first line would silently pass a description far
      // over budget, which is the shape a contributor who doesn't know about
      // `|` writes most naturally.
      const quoted = /^(['"])([\s\S]*)\1\s*(?:#.*)?$/.exec(inline);
      const parts = [quoted ? quoted[2] : stripComment(inline)];
      let end = i + 1;
      for (; end < closing; end++) {
        const line = lines[end];
        if (/^\s+\S/.test(line)) {
          // A loader folds a continuation in with one space — except straight
          // after a paragraph break, which already supplied the newline.
          const text = quoted ? line.trim() : stripComment(line.trim());
          parts.push(parts.at(-1) === '\n' ? text : ` ${text}`);
        } else if (line.trim() === '') {
          // A blank line inside a plain scalar is a paragraph break the loader
          // folds to a newline, NOT the end of the value. Stopping at one hands
          // every paragraph after the first an unmeasured free ride. The run
          // has to be scanned whole: a double-spaced break is still one scalar,
          // so a lookahead of exactly one line ends the value just as wrongly.
          let next = end + 1;
          while (next < closing && lines[next].trim() === '') next++;
          if (next >= closing || !/^\s+\S/.test(lines[next])) break;
          parts.push('\n');
        } else break;
      }
      i = end - 1;
      const joined = parts.join('');
      // Strip quotes only as a matching pair. Stripping each end independently
      // ate the closing quote off any description ending in a quoted word,
      // which shortens the very string the 1024 budget is measured against.
      values[key] = quoted || !/^(['"])[\s\S]*\1$/.test(joined) ? joined : joined.slice(1, -1);
    }
  }

  const body = lines.slice(closing + 1).join('\n');
  return { keys, values, body };
}
