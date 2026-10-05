import {atom, read, update} from 'claude-code';
import type {
  EngineInterface as Engine,
  McpContentBlock,
  McpToolResult,
  Register,
} from 'claude-code';

import type {MablEntities, MablEntity} from './types';
import type {
  Actions,
  Els,
  Feature,
  Ops,
  Settings,
  ToolResult,
} from './core/feature';
import {
  KIND_LABEL,
  contextNote,
  entityLines,
  isMablTool,
  mergeEntities,
  structuredOf,
  tabIdFor,
  type CallRecord,
  type EntityUpdate,
} from './core/util';
import {basicFeature} from './features/basic';
import {branchesFeature} from './features/branches';
import {debuggerFeature} from './features/debugger';
import {HISTORY_KEY, mergeHistory, recentItems} from './features/history';
import {impactFeature} from './features/impact';
import {runsFeature} from './features/runs';
import {authoringFeature} from './features/authoring';

const OVERVIEW = 'mabl-overview';
const TICK_MS = 3_000;
const CALL_TIMEOUT_MS = 60_000;
const TAB_TITLE_MAX = 40;
const FEATURES: readonly Feature[] = [
  authoringFeature,
  basicFeature,
  runsFeature,
  debuggerFeature,
  impactFeature,
  branchesFeature,
];

const entities = atom(
  {plugin: 'mabl', key: 'entities'} as const,
  {} as MablEntities,
);
const details = atom(
  {plugin: 'mabl', key: 'details'} as const,
  {} as Record<string, unknown>,
);
const lastPoll = atom(
  {plugin: 'mabl', key: 'lastPoll'} as const,
  null as {at: number; error?: string} | null,
);

const featureOf = (entity: Pick<MablEntity, 'kind'>): Feature =>
  FEATURES.find((feature) => feature.kinds.includes(entity.kind)) ??
  basicFeature;

const hasTab = (entity: Pick<MablEntity, 'kind'>): boolean =>
  featureOf(entity).tabKinds.includes(entity.kind);

const openTab = async ($: Engine, entity: MablEntity): Promise<void> => {
  await $.ui.open({
    id: tabIdFor(entity),
    title: featureOf(entity).tabTitle(entity).slice(0, TAB_TITLE_MAX),
  });
};

const resultFields = (result: unknown): unknown =>
  result !== null && typeof result === 'object'
    ? (result as {structuredContent?: unknown}).structuredContent
    : undefined;

const toolResult = (result: McpToolResult): ToolResult => ({
  isError: result.isError,
  structured: structuredOf(result),
  text: result.content
    .map((block: McpContentBlock) => block.text ?? '')
    .join('\n'),
});

const summarize = (
  all: MablEntities,
  allDetails: Record<string, unknown>,
): string | undefined => {
  const items = Object.values(all).filter(
    (entity) => !entity.parentId || !all[entity.parentId],
  );
  if (items.length === 0) {
    return undefined;
  }
  const kinds = [...new Set(items.map((entity) => entity.kind))];
  const parts = kinds.map((kind) => {
    const ofKind = items.filter((entity) => entity.kind === kind);
    const active = ofKind.filter(
      (entity) =>
        !featureOf(entity).isFinished(entity, allDetails[entity.id], all),
    ).length;

    return `${KIND_LABEL[kind]} ${ofKind.length}${active > 0 && hasTab({kind}) ? ` (${active} running)` : ''}`;
  });

  return ['mabl', ...parts].join(' · ');
};

let settings: Settings = {showSessionSteps: false, stepsPollMs: 15_000};
let home = '';
let isPolling = false;
let needsReplay = false;
const nextPollAt = new Map<string, number>();

const opsFor = (
  $: Engine,
  onToolError: (message: string) => void = () => undefined,
): Ops => ({
  callTool: async (server, tool, args, options) => {
    const result = toolResult(await $.mcp.call(server, tool, args));
    if (result.isError && !options?.isErrorExpected) {
      onToolError(`${tool}: ${result.text}`);
    }

    return result;
  },
  run: async (argv, timeoutMs = 30_000) => {
    const {exitCode, stdout, stderr} = await $.process.run(argv, {timeoutMs});

    return {exitCode, stdout, stderr};
  },
  mtime: async (path) =>
    (await $.fs.stat(path).catch(() => undefined))?.mtimeMs,
  read: async (path) => $.fs.read(path).catch(() => undefined),
  home,
  now: () => $.clock.now(),
});

const isOpenable = (url: string): boolean => /^https:\/\/[!-~]+$/.test(url);

const openUrl = async ($: Engine, url: string): Promise<void> => {
  if (!isOpenable(url)) {
    return;
  }
  const opened = await $.process
    .run(['open', url], {timeoutMs: 10_000})
    .catch(() => undefined);
  if (opened?.exitCode !== 0) {
    await $.process
      .run(['xdg-open', url], {timeoutMs: 10_000})
      .catch(() => $.ui.toast(`Could not open ${url}`));
  }
};

const withTimeout = <T,>($: Engine, work: Promise<T>): Promise<T> =>
  Promise.race([
    work,
    $.clock.sleep(CALL_TIMEOUT_MS).then(() => {
      throw new Error(`no answer in ${CALL_TIMEOUT_MS / 1000}s`);
    }),
  ]);

const apply = async (
  $: Engine,
  updates: readonly EntityUpdate[],
): Promise<void> => {
  if (updates.length === 0) {
    return;
  }
  const now = await $.clock.now();
  let before: MablEntities = {};
  let after: MablEntities = {};
  await update($, entities, (current) => {
    before = current;
    after = mergeEntities(current, updates, now);

    return after;
  });
  for (const id of new Set(updates.map((change) => change.id))) {
    const entity = after[id];
    if (!entity) {
      continue;
    }
    const message = featureOf(entity).announces?.(before[id], entity);
    if (message) {
      $.ui.toast(message);
    }
    if (!before[id]) {
      nextPollAt.set(id, 0);
      if (hasTab(entity) && !entity.parentId) {
        void openTab($, entity);
      }
    }
  }
  await $.store.set(
    HISTORY_KEY,
    mergeHistory(await $.store.get(HISTORY_KEY), after, now),
  );
};

const captureAll = async ($: Engine, call: CallRecord): Promise<void> => {
  await apply(
    $,
    FEATURES.flatMap((feature) => feature.capture(call)),
  );
};

const setDetail = async (
  $: Engine,
  id: string,
  detail: unknown,
): Promise<void> => {
  await update($, details, (current) => ({...current, [id]: detail}));
};

const actionsFor = ($: Engine): Actions => ({
  fillPrompt: (text) => void $.prompt.fill({text}),
  callTool: async (server, tool, args) => {
    const result = toolResult(await $.mcp.call(server, tool, args));
    if (!result.isError) {
      await captureAll($, {
        tool: `mcp__${server}__${tool}`,
        args,
        text: result.text,
        structured: result.structured,
      });
    }

    return result;
  },
  track: (changes) => void apply($, changes),
  pollNow: (id) => void nextPollAt.set(id, 0),
  openTab: (entity) => void openTab($, entity),
  openUrl: (url) => void openUrl($, url),
  updateDetail: (entityId, change) =>
    void update($, details, (current) => ({
      ...current,
      [entityId]: change(current[entityId]),
    })),
});

const poll = async ($: Engine): Promise<void> => {
  if (isPolling) {
    return;
  }
  isPolling = true;
  try {
    const all = await read($, entities);
    const allDetails = await read($, details);
    const now = await $.clock.now();
    let error: string | undefined;
    const ops = opsFor($, (message) => {
      error = message.slice(0, 120);
    });
    let isAnyPolled = false;
    for (const entity of Object.values(all)) {
      const feature = featureOf(entity);
      const waitMs = feature.poll
        ? feature.pollMs(entity, allDetails[entity.id], settings)
        : undefined;
      if (
        !feature.poll ||
        waitMs === undefined ||
        (nextPollAt.get(entity.id) ?? 0) > now
      ) {
        continue;
      }
      nextPollAt.set(entity.id, now + waitMs);
      isAnyPolled = true;
      try {
        const result = await withTimeout(
          $,
          feature.poll(ops, entity, allDetails[entity.id], settings),
        );
        await apply($, result.updates);
        if (result.detail !== undefined) {
          await setDetail($, entity.id, result.detail);
        }
      } catch (failure) {
        error = `${entity.id}: ${String(failure).slice(0, 120)}`;
      }
    }
    if (isAnyPolled) {
      const at = await $.clock.now();
      await update($, lastPoll, () => ({at, error}));
    }
  } finally {
    isPolling = false;
  }
};

const dropEntities = async (
  $: Engine,
  keep: (entity: MablEntity) => boolean,
): Promise<void> => {
  const dropped = Object.values(await read($, entities)).filter(
    (entity) => !keep(entity),
  );
  const droppedIds = new Set(dropped.map((entity) => entity.id));
  for (const entity of dropped.filter(hasTab)) {
    await $.ui.close({id: tabIdFor(entity)});
  }
  const isKept = ([id]: [string, unknown]): boolean => !droppedIds.has(id);
  await update($, entities, (current) =>
    Object.fromEntries(Object.entries(current).filter(isKept)),
  );
  await update($, details, (current) =>
    Object.fromEntries(Object.entries(current).filter(isKept)),
  );
};

const clearFinished = async ($: Engine): Promise<void> => {
  const all = await read($, entities);
  const allDetails = await read($, details);
  await dropEntities(
    $,
    (entity) =>
      !featureOf(entity).isFinished(entity, allDetails[entity.id], all),
  );
};

const clearAll = async ($: Engine): Promise<void> => {
  await dropEntities($, () => false);
  await update($, lastPoll, () => null);
};

export const register: Register = (on, options) => {
  settings = {
    showSessionSteps: options.showSessionSteps === true,
    stepsPollMs: Number(options.stepsPollSeconds ?? 15) * 1000,
  };

  on('session.start', async ($, e, next) => {
    home = (await $.env.get('HOME')) ?? '';
    await $.command.register({
      name: 'mabl',
      description: 'Show the mabl items this session touched',
    });
    $.clock.every(TICK_MS, () => void poll($));

    return next(e);
  });

  on('command.run', {command: 'mabl'}, async ($) => {
    await $.ui.open({id: OVERVIEW, title: 'mabl'});
    const items = Object.values(await read($, entities));

    return {
      text:
        items.length === 0
          ? 'No mabl items yet.'
          : `${items.length} mabl items; the mabl tab lists them.`,
    };
  });

  on('tool.call', async ($, e, next) => {
    if (!isMablTool(e.tool)) {
      return next(e);
    }
    const ran = await next(e);
    if (ran.deny !== undefined || ran.isError) {
      return ran;
    }
    try {
      const {tool, tool_use_id: _id, agentId: _agent, ...args} = e;
      await captureAll($, {
        tool,
        args,
        text: ran.text ?? '',
        structured: resultFields(ran.result),
      });
    } catch (error) {
      $.ui.status(`mabl: ${String(error).slice(0, 60)}`);
    }

    return ran;
  });

  on('session.compact', async ($, e, next) => {
    const compacted = await next(e);
    if (
      !e.agentId &&
      e.trigger !== 'precompute' &&
      compacted.skip === undefined
    ) {
      needsReplay = true;
    }

    return compacted;
  });

  on('prompt.submit', async ($, e, next) => {
    const all = await read($, entities);
    const items = Object.values(all).filter(
      (entity) => !entity.parentId || !all[entity.parentId],
    );
    if (needsReplay && items.length > 0) {
      needsReplay = false;
      await $.session.append({
        message: {
          type: 'user',
          content: [{type: 'text', text: contextNote(items)}],
        },
      });
    }

    return next(e);
  });

  on('ui.render', {component: 'AbovePrompt'}, async ($, e, next) => {
    const summary = summarize(await read($, entities), await read($, details));
    if (e.props.hasSurvey || !summary) {
      return next(e);
    }
    const {Box, Button, Text} = $.ui.resolve(e);

    return (
      <Box>
        <Text dimColor>{summary} </Text>
        <Button
          key="mabl-open"
          label="Details"
          onPress={() => $.ui.open({id: OVERVIEW, title: 'mabl'})}
        />
      </Box>
    );
  });

  on('ui.render', {component: 'Pane'}, async ($, e, next) => {
    if (!e.requestId.startsWith('mabl-')) {
      return next(e);
    }
    const els: Els = $.ui.resolve(e);
    const all = await read($, entities);
    const allDetails = await read($, details);
    const rows = e.viewport?.rows ?? 24;
    const columns = e.viewport?.columns ?? 100;

    if (e.requestId !== OVERVIEW) {
      const entity = Object.values(all).find(
        (candidate) => tabIdFor(candidate) === e.requestId,
      );
      if (!entity) {
        return <els.Text dimColor>This item was cleared.</els.Text>;
      }

      return featureOf(entity).render(els, {
        entity,
        detail: allDetails[entity.id],
        entities: all,
        rows,
        columns,
        settings,
        actions: actionsFor($),
      });
    }

    const {Box, Button, Text} = els;
    const items = Object.values(all)
      .filter((entity) => !entity.parentId || !all[entity.parentId])
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const finishedCount = items.filter((entity) =>
      featureOf(entity).isFinished(entity, allDetails[entity.id], all),
    ).length;
    const recent = recentItems(await $.store.get(HISTORY_KEY), all);
    const polled = await read($, lastPoll);

    return (
      <Box flexDirection="column">
        {items.length === 0 && <Text dimColor>No mabl items yet.</Text>}
        {items.length > 0 && (
          <Box marginBottom={1} gap={1}>
            {finishedCount > 0 && (
              <Button
                key="mabl-clear-finished"
                label={`Clear finished (${finishedCount})`}
                onPress={() => clearFinished($)}
              />
            )}
            <Button
              key="mabl-clear-all"
              label={`Clear all (${items.length})`}
              onPress={() => clearAll($)}
            />
          </Box>
        )}
        {items.map((entity) => {
          const lines = entityLines(entity);

          return (
            <Box flexDirection="column" marginBottom={1}>
              <Text bold>{lines.title}</Text>
              {lines.name && <Text>{lines.name}</Text>}
              <Text dimColor>{lines.detail}</Text>
              <Box gap={1}>
                {hasTab(entity) && (
                  <Button
                    key={`open-${tabIdFor(entity)}`}
                    label="Open tab"
                    onPress={() => openTab($, entity)}
                  />
                )}
                {entity.url && (
                  <Button
                    key={`url-${tabIdFor(entity)}`}
                    label="Open in mabl"
                    onPress={() => openUrl($, entity.url ?? '')}
                  />
                )}
              </Box>
            </Box>
          );
        })}
        {recent.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Recent (from earlier sessions)</Text>
            {recent
              .slice(0, Math.max(3, rows - items.length * 5 - 6))
              .map((item) => (
                <Box gap={1}>
                  <Text dimColor>
                    {KIND_LABEL[item.kind]} · {item.name ?? item.id}
                    {item.status ? ` · ${item.status}` : ''}
                  </Text>
                  {item.url && (
                    <Button
                      key={`recent-${item.kind}-${item.id}`}
                      label="Open"
                      onPress={() => openUrl($, item.url ?? '')}
                    />
                  )}
                </Box>
              ))}
          </Box>
        )}
        {polled && (
          <Text dimColor>
            {polled.error
              ? `Last check failed: ${polled.error}`
              : `Checked at ${new Date(polled.at).toLocaleTimeString()}`}
          </Text>
        )}
      </Box>
    );
  });
};
