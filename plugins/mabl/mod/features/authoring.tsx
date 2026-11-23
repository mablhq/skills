import type {MablEntity, SessionSteps, StepEntry} from '../types';
import type {Feature, Ops, PollResult, Settings} from '../core/feature';
import {
  appBaseFromUrl,
  cliArgv,
  didSucceed,
  ENTITY_ID,
  field,
  flag,
  hashOf,
  lastJson,
  list,
  mablCall,
  mablUrl,
  num,
  obj,
  str,
  withWorkspace,
  workspaceFromUrl,
} from '../core/util';
import type {CallRecord, EntityUpdate, Fields} from '../core/util';

export const TERMINAL_STATUSES = new Set([
  'completed',
  'failed',
  'terminated',
  'skipped',
  'merged',
  'accepted',
  'closed',
]);

const NEEDS_ATTENTION = 'needs_attention';
const STATUS_POLL_MS = 20_000;
const GET_AGENT_SESSION = 'get_agent_session';
const SEND_AGENT_MESSAGE = 'send_agent_message';
const AUTHORING_AGENT_TYPES = new Set(['test_authoring', 'flow_authoring']);
// A paused session's question is in its last few messages: the ask, its tool output, the stop event.
const QUESTION_MESSAGE_LIMIT = 10;
const ASK_FOR_HELP = 'execute_ask_for_help';

export type Pause = {
  question: string;
  reClarification?: boolean;
  planDiffSummary?: string;
};

export type AuthoringDetail = {
  steps?: SessionSteps;
  /** Inner step texts of collapsed saved flows by flow id; null when the fetch failed. */
  flowSteps?: Record<string, string[] | null>;
  /** The branch `flowSteps` was read on; another branch refetches them. */
  flowStepsBranch?: string;
  pause?: Pause;
};

const authoringDetail = (detail: unknown): AuthoringDetail =>
  obj(detail) as AuthoringDetail;

export const isRunning = (entity: MablEntity): boolean =>
  entity.kind === 'authoring' &&
  !entity.isLocal &&
  !TERMINAL_STATUSES.has(entity.status ?? '');

const testEntity = (
  testId: string,
  status: string,
  branch: string | undefined,
  url: string | undefined,
): EntityUpdate => ({
  kind: 'test',
  id: testId,
  branch,
  url,
  status: `by authoring ${status}`,
});

/** Updates from the CLI's `agent authoring status` / `answer` output. */
const fromCliStatus = (
  sessionId: string,
  data: Fields,
  text: string,
): EntityUpdate[] => {
  const status =
    field(data, text, 'sessionStatus', 'status') ??
    text.match(/^resumed \(status: (\w+)\)/)?.[1];
  const testId = field(data, text, 'createdTestId', 'test');
  const branch =
    str(data.branchName) ?? text.match(/^branch:\s*"?([^"\n]+)"?/m)?.[1];
  const updates: EntityUpdate[] = [
    {kind: 'authoring', id: sessionId, status, testId, branch},
  ];
  if (testId && status && TERMINAL_STATUSES.has(status)) {
    updates.push(
      testEntity(
        testId,
        status,
        branch,
        field(data, text, 'viewTestUrl', 'view'),
      ),
    );
  }

  return updates;
};

const testUrlFor = (
  entity: Pick<MablEntity, 'url' | 'workspaceId'> | undefined,
  testId: string,
): string | undefined => {
  const base = appBaseFromUrl(entity?.url);
  const workspaceId = entity?.workspaceId ?? workspaceFromUrl(entity?.url);

  return base && workspaceId
    ? `${base}/workspaces/${encodeURIComponent(workspaceId)}/train/tests/${encodeURIComponent(testId)}/current`
    : undefined;
};

/** Updates from `get_agent_session` structured content. */
export const fromSession = (
  sessionId: string,
  data: Fields,
  entity?: Pick<MablEntity, 'url' | 'workspaceId' | 'branch'>,
): EntityUpdate[] => {
  const status = str(data.status);
  const testId = str(obj(data.progress).createdTestId);
  const updates: EntityUpdate[] = [
    {kind: 'authoring', id: sessionId, status, testId},
  ];
  if (testId && status && TERMINAL_STATUSES.has(status)) {
    updates.push(
      testEntity(testId, status, entity?.branch, testUrlFor(entity, testId)),
    );
  }

  return updates;
};

const fromMcp = (
  name: string,
  server: string,
  call: CallRecord,
): EntityUpdate[] => {
  const data = obj(call.structured);
  const {args, text} = call;
  const info = obj(args.testInformation);

  switch (name) {
    case 'mabl_authoring_initiate':
    case 'mabl_authoring_initiate_local':
    case 'mabl_authoring_edit': {
      if (str(data.testType) === 'api' || /^API test "/.test(text)) {
        const testId = field(data, text, 'testId');

        return testId
          ? [
              {
                kind: 'test',
                id: testId,
                name: str(data.testName),
                url: str(data.viewTaskUrl),
                status: 'created',
              },
            ]
          : [];
      }
      const sessionId = field(data, text, 'sessionId', 'Session ID');
      if (!sessionId) {
        return [];
      }
      const isLocal = name === 'mabl_authoring_initiate_local';

      return [
        {
          kind: 'authoring',
          id: sessionId,
          name: str(info.name),
          status: isLocal ? 'local' : 'queued',
          testId: str(info.testId) ?? str(args.testId),
          branch: str(info.branch),
          url: field(data, text, 'viewTaskUrl', 'View task'),
          workspaceId: str(args.workspaceId),
          isLocal,
          mcpServer: isLocal ? undefined : server,
        },
      ];
    }
    case GET_AGENT_SESSION: {
      const sessionId = str(args.sessionId);

      return sessionId && AUTHORING_AGENT_TYPES.has(str(data.agentType) ?? '')
        ? fromSession(sessionId, data)
        : [];
    }
    default:
      return [];
  }
};

const VALUE_FLAGS = new Set([
  '--messages',
  '--file',
  '--idempotency-key',
  '--session-id',
  '--workspace-id',
  '-w',
]);
const ARGUMENT = /'[^']*'|"(?:[^"\\]|\\.)*"|\S+/g;

/** The first positional argument after `agent <command>`, unquoted; flags and their values are skipped. */
export const positionalId = (sub: string): string | undefined => {
  const tokens = sub.match(ARGUMENT) ?? [];
  for (let index = 2; index < tokens.length; index++) {
    const token = tokens[index] ?? '';
    if (token.startsWith('-')) {
      if (VALUE_FLAGS.has(token)) {
        index++;
      }
      continue;
    }
    const id = token.replace(/^(['"])(.*)\1$/, '$2');

    return ENTITY_ID.test(id) ? id : undefined;
  }

  return;
};

const fromCli = (cli: string, sub: string, text: string): EntityUpdate[] => {
  if (/^agent\s+authoring\s+initiate\b/.test(sub)) {
    const sessionId = field({}, text, 'sessionId');
    if (!sessionId) {
      return [];
    }
    const isLocal = field({}, text, 'mode') === 'local';

    return [
      {
        kind: 'authoring',
        id: sessionId,
        status: isLocal ? 'local' : 'queued',
        url: field({}, text, 'viewTaskUrl'),
        testId: sub.match(/\\?"test_id\\?"\s*:\s*\\?"([^"\\]+)/)?.[1],
        isLocal,
        cli,
      },
    ];
  }
  if (/^agent\s+authoring\s+(status|answer)\b/.test(sub)) {
    const sessionId =
      flag(sub, 'session-id') ??
      sub.match(/^agent\s+authoring\s+answer\s+([\w-]+)/)?.[1];

    return sessionId ? fromCliStatus(sessionId, lastJson(text), text) : [];
  }
  const command = sub.match(/^agent\s+(session|message)\b/)?.[1];
  if (command) {
    const data = lastJson(text);
    const outputId = str(data.sessionId);
    const sessionId =
      (outputId && ENTITY_ID.test(outputId) ? outputId : undefined) ??
      flag(sub, 'session-id') ??
      positionalId(sub);
    if (!sessionId) {
      return [];
    }
    if (command === 'message') {
      // The inbox wakes a paused cloud session; a local one, or any other agent's, is left alone.
      return data.delivered === true
        ? [
            {
              kind: 'authoring',
              id: sessionId,
              status: 'queued',
              onlyFromStatuses: [NEEDS_ATTENTION],
            },
          ]
        : [];
    }

    return AUTHORING_AGENT_TYPES.has(str(data.agentType) ?? '')
      ? fromSession(sessionId, data)
      : [];
  }

  return [];
};

export const captureAuthoring = (call: CallRecord): EntityUpdate[] => {
  const parsed = mablCall(call);
  if (!parsed) {
    return [];
  }
  const updates =
    parsed.source === 'mcp'
      ? fromMcp(parsed.name, parsed.server, call)
      : fromCli(parsed.cli, parsed.sub, call.text);

  return updates.map(withWorkspace);
};

const toEntry = (step: Fields): StepEntry[] => {
  const kind = str(step.kind);

  return kind
    ? [
        {
          path: str(step.path) ?? '',
          text: str(step.text) ?? '',
          kind,
          stepId: str(step.stepId),
          flowId: str(step.flowId),
          collapsedStepCount: num(step.collapsedStepCount),
        },
      ]
    : [];
};

/** The steps built so far, from `get_agent_session`'s `progress`. */
export const sessionSteps = (
  progress: unknown,
): {entries: StepEntry[]; stepCount: number} => {
  const data = obj(progress);

  return {
    entries: list(data.steps).flatMap(toEntry),
    stepCount: num(data.stepCount) ?? 0,
  };
};

/** Texts of a collapsed flow's steps from `get_mabl_flow_steps` with `detail: 'compact'`. */
export const flowStepTexts = (structured: unknown): string[] => {
  const steps = obj(structured).steps;

  return Array.isArray(steps)
    ? steps
        .map(obj)
        .map(
          (step) =>
            str(step.description) ??
            str(step.target_description) ??
            str(step.step_type) ??
            'step',
        )
    : [];
};

export const collapsedFlowIds = (entries: readonly StepEntry[]): string[] =>
  entries.flatMap((entry) =>
    entry.kind === 'flow-start' && entry.collapsedStepCount && entry.flowId
      ? [entry.flowId]
      : [],
  );

export type StepLine = {
  depth: number;
  text: string;
  isFetched?: boolean;
  isGroup?: boolean;
};

/** Turns the flat marker list into indented lines; a collapsed flow shows its fetched steps when cached. */
export const stepLines = (
  entries: readonly StepEntry[],
  flowSteps: Readonly<Record<string, string[] | null>>,
): StepLine[] => {
  const lines: StepLine[] = [];
  let depth = 0;
  for (const entry of entries) {
    switch (entry.kind) {
      case 'task-start':
        lines.push({depth, text: `▸ ${entry.text}`, isGroup: true});
        depth += 1;
        break;
      case 'flow-start': {
        const count = entry.collapsedStepCount
          ? ` (${entry.collapsedStepCount} steps)`
          : '';
        lines.push({depth, text: `⤷ ${entry.text}${count}`, isGroup: true});
        depth += 1;
        const inner =
          entry.collapsedStepCount && entry.flowId
            ? flowSteps[entry.flowId]
            : undefined;
        for (const text of inner ?? []) {
          lines.push({depth, text, isFetched: true});
        }
        break;
      }
      case 'task-end':
      case 'flow-end':
        depth = Math.max(0, depth - 1);
        break;
      default:
        lines.push({
          depth,
          text: entry.path ? `${entry.path}  ${entry.text}` : entry.text,
        });
    }
  }

  return lines;
};

/** Keeps `budget` lines: the newest ones while running, else the first ones and a "… N more" line. */
export const clipLines = <T extends {text: string; depth: number}>(
  lines: readonly T[],
  budget: number,
  isLive: boolean,
): (T | StepLine)[] => {
  if (lines.length <= budget) {
    return [...lines];
  }
  const room = Math.max(0, budget - 1);
  const hidden: StepLine = {
    depth: 0,
    text: `… ${lines.length - room} more`,
    isFetched: true,
  };

  return isLive
    ? [hidden, ...lines.slice(lines.length - room)]
    : [...lines.slice(0, room), hidden];
};

/** The pending question in the CLI's `agent authoring status` JSON. */
export const pauseOf = (data: Fields): Pause | undefined => {
  const question = str(data.question);

  return question && str(data.sessionStatus) === NEEDS_ATTENTION
    ? {
        question,
        reClarification: data.reClarification === true,
        planDiffSummary: str(data.planDiffSummary),
      }
    : undefined;
};

type Ask = {toolCallId: string; question: string};

const askOf = (message: Fields): Ask | undefined => {
  if (message.role !== 'model') {
    return;
  }
  const part = list(message.parts).find(
    (candidate) =>
      candidate.type === 'tool_call' && candidate.name === ASK_FOR_HELP,
  );
  const toolCallId = str(part?.id);
  const input = obj(part?.input);

  return toolCallId
    ? {toolCallId, question: str(obj(input.json).question) ?? ''}
    : undefined;
};

/** The newest unanswered ask, else the newest ask: a cloud session closes its ask when it pauses. */
const currentAsk = (messages: readonly Fields[]): Ask | undefined => {
  const answered = new Set(
    messages
      .filter((message) => message.role === 'tool_output')
      .flatMap((message) => list(message.parts))
      .flatMap((part) =>
        part.type === 'tool_output' && str(part.tool_call_id)
          ? [String(part.tool_call_id)]
          : [],
      ),
  );
  const asks = messages.flatMap((message) => askOf(message) ?? []).reverse();

  return asks.find((ask) => !answered.has(ask.toolCallId)) ?? asks[0];
};

/** The question a paused session waits on, from `get_agent_session` read with its last few messages. */
export const pauseFromSession = (data: Fields): Pause | undefined => {
  if (str(data.status) !== NEEDS_ATTENTION) {
    return;
  }
  const question = currentAsk(list(data.messages))?.question;

  return question ? {question} : undefined;
};

/** The detail with this pause, or without one; the same object when nothing changed. */
export const withPause = (
  detail: AuthoringDetail,
  pause: Pause | undefined,
): AuthoringDetail => {
  if (hashOf(detail.pause) === hashOf(pause)) {
    return detail;
  }
  const {pause: _previous, ...rest} = detail;

  return pause ? {...rest, pause} : rest;
};

const changed = (
  before: AuthoringDetail,
  after: AuthoringDetail,
): {detail?: AuthoringDetail} => (after === before ? {} : {detail: after});

type SessionRead = {messageLimit: number; includeProgress?: boolean};

/** One `get_agent_session` read; undefined when it returned an error. */
const readSession = async (
  ops: Ops,
  server: string,
  sessionId: string,
  read: SessionRead,
  isErrorExpected = false,
): Promise<Fields | undefined> => {
  const result = await ops.callTool(
    server,
    GET_AGENT_SESSION,
    {sessionId, ...read},
    isErrorExpected ? {isErrorExpected} : undefined,
  );

  return result.isError ? undefined : obj(result.structured);
};

const pollStatus = async (
  ops: Ops,
  entity: MablEntity,
  detail: AuthoringDetail,
): Promise<PollResult> => {
  if (entity.mcpServer) {
    const server = entity.mcpServer;
    const brief = await readSession(ops, server, entity.id, {messageLimit: 0});
    if (!brief) {
      return {updates: []};
    }
    const status = str(brief.status);
    const isPaused = status === NEEDS_ATTENTION;
    // A pause needs the question; a finished session needs the created test.
    const fullRead: SessionRead | undefined = isPaused
      ? {messageLimit: QUESTION_MESSAGE_LIMIT}
      : TERMINAL_STATUSES.has(status ?? '')
        ? {messageLimit: 0, includeProgress: true}
        : undefined;
    const full = fullRead
      ? await readSession(ops, server, entity.id, fullRead).catch(
          () => undefined,
        )
      : undefined;
    const pause = full
      ? pauseFromSession(full)
      : isPaused
        ? detail.pause
        : undefined;

    return {
      updates: fromSession(entity.id, full ?? brief, entity),
      ...changed(detail, withPause(detail, pause)),
    };
  }
  const argv = [
    ...cliArgv(entity),
    'agent',
    'authoring',
    'status',
    '--session-id',
    entity.id,
  ];
  const {exitCode, stdout} = await ops.run(argv, 30_000);
  if (exitCode !== 0) {
    return {updates: []};
  }
  const data = lastJson(stdout);

  return {
    updates: fromCliStatus(entity.id, data, stdout),
    ...changed(detail, withPause(detail, pauseOf(data))),
  };
};

/** The progress read carries no messages, so a paused session reads its last few for the question. */
const refreshPause = async (
  ops: Ops,
  server: string,
  sessionId: string,
  session: Fields,
  current: Pause | undefined,
): Promise<Pause | undefined> => {
  if (str(session.status) !== NEEDS_ATTENTION) {
    return;
  }
  const recent = await readSession(ops, server, sessionId, {
    messageLimit: QUESTION_MESSAGE_LIMIT,
  }).catch(() => undefined);

  return recent
    ? pauseFromSession({...session, messages: recent.messages})
    : current;
};

/** One `get_agent_session` read with progress; it carries the status too, so it replaces the status poll. */
const pollSteps = async (
  ops: Ops,
  entity: MablEntity,
  detail: AuthoringDetail,
): Promise<PollResult> => {
  const server = ops.serverFor(entity);
  const session = await readSession(
    ops,
    server,
    entity.id,
    {messageLimit: 0, includeProgress: true},
    true,
  );
  if (!session) {
    // The status-only read keeps the tab current when the progress read fails.
    const brief = await readSession(ops, server, entity.id, {
      messageLimit: 0,
    });

    return {updates: brief ? fromSession(entity.id, brief, entity) : []};
  }
  const status = str(session.status);
  const {entries, stepCount} = sessionSteps(session.progress);
  const flowStepsBranch = entity.branch;
  const flowSteps =
    detail.flowStepsBranch === flowStepsBranch ? {...detail.flowSteps} : {};
  for (const flowId of collapsedFlowIds(entries).filter(
    (id) => !(id in flowSteps),
  )) {
    const args = {
      flowId,
      detail: 'compact',
      ...(flowStepsBranch ? {branch: flowStepsBranch} : {}),
    };
    const result = await ops
      .callTool(server, 'get_mabl_flow_steps', args)
      .catch(() => undefined);
    flowSteps[flowId] =
      result && !result.isError ? flowStepTexts(result.structured) : null;
  }
  const steps: SessionSteps = {
    entries,
    stepCount,
    hash: hashOf(entries),
    fetchedAt: await ops.now(),
    isFinal: TERMINAL_STATUSES.has(status ?? ''),
  };
  const isUnchanged =
    detail.steps?.hash === steps.hash &&
    detail.steps.isFinal === steps.isFinal &&
    detail.flowStepsBranch === flowStepsBranch &&
    hashOf(flowSteps) === hashOf(detail.flowSteps ?? {});
  const pause = await refreshPause(
    ops,
    server,
    entity.id,
    session,
    detail.pause,
  );

  return {
    updates: fromSession(entity.id, session, entity),
    ...changed(
      detail,
      withPause(
        isUnchanged ? detail : {...detail, steps, flowSteps, flowStepsBranch},
        pause,
      ),
    ),
  };
};

/** The `send_agent_message` call for a typed answer, or undefined when there is nothing to send. */
export const answerCall = (
  entity: MablEntity,
  pause: Pause | undefined,
  value: string,
  server: string,
): {server: string; args: Record<string, unknown>} | undefined => {
  const message = value.trim();

  return message && pause
    ? {server, args: {sessionId: entity.id, message}}
    : undefined;
};

export const authoringFeature: Feature = {
  kinds: ['authoring'],
  tabKinds: ['authoring'],
  capture: captureAuthoring,
  pollMs: (entity, detail, settings: Settings) => {
    if (entity.isLocal) {
      return undefined;
    }
    if (settings.showSessionSteps) {
      return isRunning(entity) ||
        authoringDetail(detail).steps?.isFinal !== true
        ? settings.stepsPollMs
        : undefined;
    }

    return isRunning(entity) ? STATUS_POLL_MS : undefined;
  },
  poll: (ops, entity, detail, settings) =>
    settings.showSessionSteps
      ? pollSteps(ops, entity, authoringDetail(detail))
      : pollStatus(ops, entity, authoringDetail(detail)),
  isFinished: (entity) => !isRunning(entity),
  announces: (before, after) =>
    after.status !== before?.status &&
    (after.status === NEEDS_ATTENTION ||
      TERMINAL_STATUSES.has(after.status ?? ''))
      ? `mabl authoring ${after.name ?? after.id}: ${after.status}`
      : undefined,
  tabTitle: (entity) => `Authoring ${entity.name ?? entity.id}`,
  render: (
    {Box, Button, Input, Link, Text},
    {entity, detail, rows, settings, actions},
  ) => {
    const {steps, flowSteps = {}, pause} = authoringDetail(detail);
    const question = entity.status === NEEDS_ATTENTION ? pause : undefined;
    const lines = steps
      ? clipLines(
          stepLines(steps.entries, flowSteps),
          Math.max(3, rows - (question ? 10 : 4)),
          isRunning(entity),
        )
      : [];
    const href = mablUrl(entity.url);
    const answer = (value: string): void => {
      const call = answerCall(
        entity,
        question,
        value,
        actions.serverFor(entity),
      );
      if (call) {
        void didSucceed(
          actions.callTool(call.server, SEND_AGENT_MESSAGE, call.args),
        ).then((isSent) => {
          if (!isSent) {
            actions.notify('mabl: could not send the answer; try again.');
          }
          actions.pollNow(entity.id);
        });
      }
    };

    return (
      <Box flexDirection="column">
        <Text bold>
          {entity.name ?? entity.id}
          {entity.status ? ` · ${entity.status}` : ''}
          {steps ? ` · ${steps.stepCount} steps` : ''}
        </Text>
        {href && <Link href={href} label="Open in mabl" />}
        {question && (
          <Box flexDirection="column" marginTop={1} marginBottom={1}>
            <Text bold>
              {question.reClarification ? 'Question (follow-up):' : 'Question:'}
            </Text>
            <Text wrap="wrap">{question.question}</Text>
            {question.planDiffSummary && (
              <Text dimColor wrap="wrap">
                Plan change: {question.planDiffSummary}
              </Text>
            )}
            {Input && (
              <Input
                key={`answer-${entity.id}-${hashOf(question.question)}`}
                label="Your answer"
                submitLabel="Send"
                onSubmit={answer}
              />
            )}
            <Button
              key={`ask-claude-${entity.id}`}
              label="Ask Claude"
              onPress={() =>
                actions.fillPrompt(
                  `Read the open question on mabl test authoring session ${entity.id} with ${GET_AGENT_SESSION}, then answer it with ${SEND_AGENT_MESSAGE}. My guidance: `,
                )
              }
            />
          </Box>
        )}
        {!settings.showSessionSteps && (
          <Text dimColor>
            Turn on "Show mabl results in side panel" in /config to see the
            steps.
          </Text>
        )}
        {settings.showSessionSteps && !steps && (
          <Text dimColor>Waiting for the first steps…</Text>
        )}
        {steps && steps.entries.length === 0 && (
          <Text dimColor>No steps yet.</Text>
        )}
        {lines.map((line) => (
          <Text
            dimColor={'isFetched' in line && line.isFetched}
            bold={'isGroup' in line && line.isGroup}
          >
            {'  '.repeat(line.depth)}
            {line.text}
          </Text>
        ))}
      </Box>
    );
  },
};
