// A listed skill is held at its size; a skill not
// listed gets DEFAULT_LINE_CEILING. An entry moves down with its skill and never
// up, so a skill that shrinks fails until its entry is lowered to match.
export const DEFAULT_LINE_CEILING = 500;

export const LINE_CEILINGS = {
  'mabl-debug': 504,
  'mabl-init': 260,
  'mabl-test-authoring': 551,
  'mabl-test-coverage-design': 654,
  'mabl-test-edit': 338,
  'mabl-test-edit-verify': 442,
  'mabl-test-run': 570,
  'mabl-version-compare': 812,
};

const CEILINGS_FILE = '.github/scripts/lib/line-ceiling.mjs';

// Same count as `wc -l`: newline characters.
export const countLines = (text) => (text.match(/\n/g) ?? []).length;

// Returns an error message, or null when the skill sits at its ceiling (or,
// unlisted, at or under the default).
export function checkLineCount(skill, lines, ceilings = LINE_CEILINGS) {
  const skillPath = `plugins/mabl/skills/${skill}/SKILL.md`;
  const remedy = 'move detail into references/ instead';
  if (!Object.hasOwn(ceilings, skill)) {
    if (lines <= DEFAULT_LINE_CEILING) return null;
    return `${skillPath}: ${lines} lines, over the default ceiling of ${DEFAULT_LINE_CEILING} — ${remedy}.`;
  }
  const ceiling = ceilings[skill];
  if (lines > ceiling) {
    return `${skillPath}: ${lines} lines, over its ceiling of ${ceiling} — ${remedy}. The ceiling in ${CEILINGS_FILE} can be lowered but not raised.`;
  }
  if (lines < ceiling) {
    return `${skillPath}: ${lines} lines, under its ceiling of ${ceiling}; lower the entry in ${CEILINGS_FILE} to ${lines}.`;
  }
  return null;
}

// Entries whose skill folder no longer exists.
export function staleCeilings(skills, ceilings = LINE_CEILINGS) {
  const present = new Set(skills);
  return Object.keys(ceilings)
    .filter((skill) => !present.has(skill))
    .map((skill) => `${CEILINGS_FILE}: no skill named "${skill}"; remove the entry, or rename it with the skill.`);
}
