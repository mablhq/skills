// Claude Code names a plugin's MCP server `plugin:<plugin>:<server>`, so its
// tools resolve as `mcp__plugin_<plugin>_<server>__<tool>`; a server the user
// configured by hand resolves as `mcp__<server>__<tool>`, and suppresses the
// plugin copy. A skill works under both only if it lists each tool both ways.
export const splitAllowedTools = (value) =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

// Returns one message per entry whose other form is missing.
export function unpairedMcpEntries(entries, servers, plugin = 'mabl') {
  const listed = new Set(entries);
  const errors = [];
  for (const server of servers) {
    const direct = `mcp__${server}__`;
    const viaPlugin = `mcp__plugin_${plugin}_${server}__`;
    for (const entry of entries) {
      let counterpart = null;
      if (entry.startsWith(viaPlugin)) counterpart = direct + entry.slice(viaPlugin.length);
      else if (entry.startsWith(direct)) counterpart = viaPlugin + entry.slice(direct.length);
      if (counterpart && !listed.has(counterpart)) {
        errors.push(`"${entry}" has no matching "${counterpart}"`);
      }
    }
  }
  return errors;
}
