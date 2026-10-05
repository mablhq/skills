import type { MablEntity, SessionSteps, StepEntry } from '../types'
import type { Feature, Ops, PollResult, Settings } from '../core/feature'
import { cliArgv, field, flag, hashOf, mablCall, mcpServerFor, num, obj, parseJson, str, withWorkspace } from '../core/util'
import type { CallRecord, EntityUpdate, Fields } from '../core/util'

export const TERMINAL_STATUSES = new Set(['completed', 'failed', 'terminated', 'skipped', 'merged', 'accepted', 'closed'])

const NEEDS_ATTENTION = 'needs_attention'
const STATUS_POLL_MS = 20_000
const MAX_STEP_PAGES = 10

/** The question a paused session waits on; `loopNumber` is what `mabl_authoring_answer` must echo. */
export type Pause = { question: string; loopNumber?: number; reClarification?: boolean; planDiffSummary?: string }

export type AuthoringDetail = {
  steps?: SessionSteps
  /** Inner step texts of collapsed saved flows by flow id; null when the fetch failed. */
  flowSteps?: Record<string, string[] | null>
  /** The branch `flowSteps` was read on; another branch refetches them. */
  flowStepsBranch?: string
  pause?: Pause
}

const authoringDetail = (detail: unknown): AuthoringDetail => obj(detail) as AuthoringDetail

export const isRunning = (entity: MablEntity): boolean =>
  entity.kind === 'authoring' && !entity.isLocal && !TERMINAL_STATUSES.has(entity.status ?? '')

/** The JSON object a CLI command printed, else an empty object. */
const jsonFields = (text: string): Fields => obj(parseJson(text))

const fromStatus = (sessionId: string, data: Fields, text: string): EntityUpdate[] => {
  const status = field(data, text, 'sessionStatus', 'status') ?? text.match(/^resumed \(status: (\w+)\)/)?.[1]
  const testId = field(data, text, 'createdTestId', 'test')
  const branch = str(data.branchName) ?? text.match(/^branch:\s*"?([^"\n]+)"?/m)?.[1]
  const testUrl = field(data, text, 'viewTestUrl', 'view')
  const updates: EntityUpdate[] = [{ kind: 'authoring', id: sessionId, status, testId, branch }]
  if (testId && status && TERMINAL_STATUSES.has(status)) {
    updates.push({ kind: 'test', id: testId, branch, url: testUrl, status: `by authoring ${status}` })
  }

  return updates
}

const fromMcp = (name: string, server: string, call: CallRecord): EntityUpdate[] => {
  const data = obj(call.structured)
  const { args, text } = call
  const info = obj(args.testInformation)

  switch (name) {
    case 'mabl_authoring_initiate':
    case 'mabl_authoring_initiate_local':
    case 'mabl_authoring_edit':
    case 'mabl_authoring_merge': {
      if (str(data.testType) === 'api' || /^API test "/.test(text)) {
        const testId = field(data, text, 'testId')

        return testId ? [{ kind: 'test', id: testId, name: str(data.testName), url: str(data.viewTaskUrl), status: 'created' }] : []
      }
      const sessionId = field(data, text, 'sessionId', 'Session ID')
      if (!sessionId) {
        return []
      }
      const isLocal = name === 'mabl_authoring_initiate_local'

      return [
        {
          kind: 'authoring',
          id: sessionId,
          name: str(info.name) ?? (name === 'mabl_authoring_merge' ? 'merge' : undefined),
          status: isLocal ? 'local' : 'queued',
          testId: str(info.testId) ?? str(args.testId),
          branch: str(info.branch) ?? str(args.sourceBranch),
          url: field(data, text, 'viewTaskUrl', 'View task'),
          workspaceId: str(args.workspaceId),
          isLocal,
          mcpServer: isLocal ? undefined : server,
        },
      ]
    }
    case 'mabl_authoring_status':
    case 'mabl_authoring_answer': {
      const sessionId = str(args.sessionId)

      return sessionId ? fromStatus(sessionId, data, text) : []
    }
    default:
      return []
  }
}

const fromCli = (cli: string, sub: string, text: string): EntityUpdate[] => {
  if (/^agent\s+authoring\s+initiate\b/.test(sub)) {
    const sessionId = field({}, text, 'sessionId')
    if (!sessionId) {
      return []
    }
    const isLocal = field({}, text, 'mode') === 'local'

    return [
      {
        kind: 'authoring',
        id: sessionId,
        status: isLocal ? 'local' : 'queued',
        url: field({}, text, 'viewTaskUrl'),
        testId: flag(sub, 'test-information')?.match(/"test_id"\s*:\s*"([^"]+)"/)?.[1],
        isLocal,
        cli,
      },
    ]
  }
  if (/^agent\s+authoring\s+(status|answer)\b/.test(sub)) {
    const sessionId = flag(sub, 'session-id')

    return sessionId ? fromStatus(sessionId, jsonFields(text), text) : []
  }

  return []
}

export const captureAuthoring = (call: CallRecord): EntityUpdate[] => {
  const parsed = mablCall(call)
  if (!parsed) {
    return []
  }
  const updates = parsed.source === 'mcp' ? fromMcp(parsed.name, parsed.server, call) : fromCli(parsed.cli, parsed.sub, call.text)

  return updates.map(withWorkspace)
}

export type StepsPage = {
  status?: string
  stepCount: number
  entries: StepEntry[]
  nextCursor?: string
  isRestarted: boolean
}

const toEntry = (raw: unknown): StepEntry | undefined => {
  const step = obj(raw)
  const kind = str(step.kind)

  return kind
    ? {
        path: str(step.path) ?? '',
        text: str(step.text) ?? '',
        kind,
        stepId: str(step.stepId),
        flowId: str(step.flowId),
        collapsedStepCount: num(step.collapsedStepCount),
      }
    : undefined
}

/** Reads one page of `get_mabl_authoring_steps` structured content. */
export const stepsPage = (structured: unknown): StepsPage => {
  const data = obj(structured)
  const steps = Array.isArray(data.steps) ? data.steps : []

  return {
    status: str(data.sessionStatus),
    stepCount: num(data.stepCount) ?? 0,
    entries: steps.map(toEntry).filter((entry): entry is StepEntry => entry !== undefined),
    nextCursor: str(data.nextCursor),
    isRestarted: data.listChanged === true,
  }
}

/** Texts of a collapsed flow's steps from `get_mabl_flow_steps` with `detail: 'compact'`. */
export const flowStepTexts = (structured: unknown): string[] => {
  const steps = obj(structured).steps

  return Array.isArray(steps) ? steps.map(obj).map(step => str(step.description) ?? str(step.step_type) ?? 'step') : []
}

export const collapsedFlowIds = (entries: readonly StepEntry[]): string[] =>
  entries.flatMap(entry => (entry.kind === 'flow-start' && entry.collapsedStepCount && entry.flowId ? [entry.flowId] : []))

export type StepLine = { depth: number; text: string; isFetched?: boolean; isGroup?: boolean }

/** Turns the flat marker list into indented lines; a collapsed flow shows its fetched steps when cached. */
export const stepLines = (entries: readonly StepEntry[], flowSteps: Readonly<Record<string, string[] | null>>): StepLine[] => {
  const lines: StepLine[] = []
  let depth = 0
  for (const entry of entries) {
    switch (entry.kind) {
      case 'task-start':
        lines.push({ depth, text: `▸ ${entry.text}`, isGroup: true })
        depth += 1
        break
      case 'flow-start': {
        const count = entry.collapsedStepCount ? ` (${entry.collapsedStepCount} steps)` : ''
        lines.push({ depth, text: `⤷ ${entry.text}${count}`, isGroup: true })
        depth += 1
        const inner = entry.collapsedStepCount && entry.flowId ? flowSteps[entry.flowId] : undefined
        for (const text of inner ?? []) {
          lines.push({ depth, text, isFetched: true })
        }
        break
      }
      case 'task-end':
      case 'flow-end':
        depth = Math.max(0, depth - 1)
        break
      default:
        lines.push({ depth, text: entry.path ? `${entry.path}  ${entry.text}` : entry.text })
    }
  }

  return lines
}

/** Keeps `budget` lines: the newest ones while running, else the first ones and a "… N more" line. */
export const clipLines = <T extends { text: string; depth: number }>(lines: readonly T[], budget: number, isLive: boolean): (T | StepLine)[] => {
  if (lines.length <= budget) {
    return [...lines]
  }
  const room = Math.max(0, budget - 1)
  const hidden: StepLine = { depth: 0, text: `… ${lines.length - room} more`, isFetched: true }

  return isLive ? [hidden, ...lines.slice(lines.length - room)] : [...lines.slice(0, room), hidden]
}

/** The pending question in `mabl_authoring_status` output (MCP structured content or CLI JSON). */
export const pauseOf = (data: Fields): Pause | undefined => {
  const question = str(data.question)

  return question && str(data.sessionStatus) === NEEDS_ATTENTION
    ? { question, loopNumber: num(data.loopNumber), reClarification: data.reClarification === true, planDiffSummary: str(data.planDiffSummary) }
    : undefined
}

/** The detail with this pause, or without one; the same object when nothing changed. */
export const withPause = (detail: AuthoringDetail, pause: Pause | undefined): AuthoringDetail => {
  if (hashOf(detail.pause) === hashOf(pause)) {
    return detail
  }
  const { pause: _previous, ...rest } = detail

  return pause ? { ...rest, pause } : rest
}

const changed = (before: AuthoringDetail, after: AuthoringDetail): { detail?: AuthoringDetail } => (after === before ? {} : { detail: after })

const pollStatus = async (ops: Ops, entity: MablEntity, detail: AuthoringDetail): Promise<PollResult> => {
  const args = { sessionId: entity.id }
  if (entity.mcpServer) {
    const result = await ops.callTool(entity.mcpServer, 'mabl_authoring_status', args)
    if (result.isError) {
      return { updates: [] }
    }
    const data = obj(result.structured)

    return { updates: fromStatus(entity.id, data, result.text), ...changed(detail, withPause(detail, pauseOf(data))) }
  }
  const argv = [...cliArgv(entity), 'agent', 'authoring', 'status', '--session-id', entity.id]
  const { exitCode, stdout } = await ops.run(argv, 30_000)
  if (exitCode !== 0) {
    return { updates: [] }
  }
  const data = jsonFields(stdout)

  return { updates: fromStatus(entity.id, data, stdout), ...changed(detail, withPause(detail, pauseOf(data))) }
}

/** Steps carry no question, so a paused session asks `mabl_authoring_status`; a re-clarification keeps the pause but changes the question. */
const refreshPause = async (ops: Ops, server: string, sessionId: string, status: string | undefined, current: Pause | undefined): Promise<Pause | undefined> => {
  if (status !== NEEDS_ATTENTION) {
    return undefined
  }
  const result = await ops.callTool(server, 'mabl_authoring_status', { sessionId }).catch(() => undefined)

  return result && !result.isError ? pauseOf(obj(result.structured)) : current
}

/** One `get_mabl_authoring_steps` sweep; it carries the session status too, so it replaces the status poll. */
const pollSteps = async (ops: Ops, entity: MablEntity, detail: AuthoringDetail): Promise<PollResult> => {
  const server = mcpServerFor(entity)
  let entries: StepEntry[] = []
  let cursor: string | undefined
  let page: StepsPage | undefined
  for (let pageIndex = 0; pageIndex < MAX_STEP_PAGES; pageIndex++) {
    const result = await ops.callTool(server, 'get_mabl_authoring_steps', { sessionId: entity.id, limit: 500, ...(cursor ? { cursor } : {}) })
    if (result.isError) {
      return { updates: [] }
    }
    page = stepsPage(result.structured)
    entries = page.isRestarted ? page.entries : [...entries, ...page.entries]
    cursor = page.nextCursor
    if (!cursor) {
      break
    }
  }
  const status = page?.status
  const flowStepsBranch = entity.branch
  const flowSteps = detail.flowStepsBranch === flowStepsBranch ? { ...detail.flowSteps } : {}
  for (const flowId of collapsedFlowIds(entries).filter(id => !(id in flowSteps))) {
    const args = { flowId, detail: 'compact', ...(flowStepsBranch ? { branch: flowStepsBranch } : {}) }
    const result = await ops.callTool(server, 'get_mabl_flow_steps', args).catch(() => undefined)
    flowSteps[flowId] = result && !result.isError ? flowStepTexts(result.structured) : null
  }
  const steps: SessionSteps = {
    entries,
    stepCount: page?.stepCount ?? 0,
    hash: hashOf(entries),
    fetchedAt: await ops.now(),
    isFinal: TERMINAL_STATUSES.has(status ?? ''),
  }
  const isUnchanged =
    detail.steps?.hash === steps.hash &&
    detail.steps.isFinal === steps.isFinal &&
    detail.flowStepsBranch === flowStepsBranch &&
    hashOf(flowSteps) === hashOf(detail.flowSteps ?? {})
  const pause = await refreshPause(ops, server, entity.id, status, detail.pause)

  return {
    updates: status ? [{ kind: 'authoring', id: entity.id, status }] : [],
    ...changed(detail, withPause(isUnchanged ? detail : { ...detail, steps, flowSteps, flowStepsBranch }, pause)),
  }
}

/** The `mabl_authoring_answer` call for a typed answer, or undefined when it cannot be sent. */
export const answerCall = (entity: MablEntity, pause: Pause | undefined, value: string): { server: string; args: Record<string, unknown> } | undefined => {
  const text = value.trim()

  return text && pause?.loopNumber !== undefined
    ? { server: mcpServerFor(entity), args: { sessionId: entity.id, text, expectedLoopNumber: pause.loopNumber } }
    : undefined
}

export const authoringFeature: Feature = {
  kinds: ['authoring'],
  tabKinds: ['authoring'],
  capture: captureAuthoring,
  pollMs: (entity, detail, settings: Settings) => {
    if (entity.isLocal) {
      return undefined
    }
    if (settings.showSessionSteps) {
      return isRunning(entity) || authoringDetail(detail).steps?.isFinal !== true ? settings.stepsPollMs : undefined
    }

    return isRunning(entity) ? STATUS_POLL_MS : undefined
  },
  poll: (ops, entity, detail, settings) =>
    settings.showSessionSteps ? pollSteps(ops, entity, authoringDetail(detail)) : pollStatus(ops, entity, authoringDetail(detail)),
  isFinished: entity => !isRunning(entity),
  announces: (before, after) =>
    after.status !== before?.status && (after.status === NEEDS_ATTENTION || TERMINAL_STATUSES.has(after.status ?? ''))
      ? `mabl authoring ${after.name ?? after.id}: ${after.status}`
      : undefined,
  tabTitle: entity => `Authoring ${entity.name ?? entity.id}`,
  render: ({ Box, Button, Input, Link, Text }, { entity, detail, rows, settings, actions }) => {
    const { steps, flowSteps = {}, pause } = authoringDetail(detail)
    const question = entity.status === NEEDS_ATTENTION ? pause : undefined
    const lines = steps ? clipLines(stepLines(steps.entries, flowSteps), Math.max(3, rows - (question ? 10 : 4)), isRunning(entity)) : []
    const answer = (value: string) => {
      const call = answerCall(entity, question, value)
      if (call) {
        void actions
          .callTool(call.server, 'mabl_authoring_answer', call.args)
          .catch(() => undefined)
          .then(() => actions.pollNow(entity.id))
      }
    }

    return (
      <Box flexDirection="column">
        <Text bold>
          {entity.name ?? entity.id}
          {entity.status ? ` · ${entity.status}` : ''}
          {steps ? ` · ${steps.stepCount} steps` : ''}
        </Text>
        {entity.url && <Link href={entity.url} label="Open in mabl" />}
        {question && (
          <Box flexDirection="column" marginTop={1} marginBottom={1}>
            <Text bold>{question.reClarification ? 'Question (follow-up):' : 'Question:'}</Text>
            <Text wrap="wrap">{question.question}</Text>
            {question.planDiffSummary && <Text dimColor wrap="wrap">Plan change: {question.planDiffSummary}</Text>}
            {Input && question.loopNumber !== undefined && (
              <Input key={`answer-${entity.id}-${question.loopNumber}`} label="Your answer" submitLabel="Send" onSubmit={answer} />
            )}
            <Button key={`ask-claude-${entity.id}`} label="Ask Claude" onPress={() => actions.fillPrompt(`Read the open question on mabl test authoring session ${entity.id} with mabl_authoring_status, then answer it with mabl_authoring_answer. My guidance: `)} />
          </Box>
        )}
        {!settings.showSessionSteps && <Text dimColor>Turn on "Show mabl results in side panel" in /config to see the steps.</Text>}
        {settings.showSessionSteps && !steps && <Text dimColor>Waiting for the first steps…</Text>}
        {steps && steps.entries.length === 0 && <Text dimColor>No steps yet.</Text>}
        {lines.map(line => (
          <Text dimColor={'isFetched' in line && line.isFetched} bold={'isGroup' in line && line.isGroup}>
            {'  '.repeat(line.depth)}
            {line.text}
          </Text>
        ))}
      </Box>
    )
  },
}
