import type { MablEntity } from '../types'
import type { Feature, Ops, PollResult } from '../core/feature'
import { cliArgv, field, list, mablCall, num, obj, str } from '../core/util'
import type { CallRecord, EntityUpdate } from '../core/util'

const POLL_MS = 3_000
const LIST_TIMEOUT_MS = 15_000
const LINES_BEFORE_CURSOR = 3
const ERROR_PREVIEW = 200
const SESSION_ID = /^mabl-debug-\d+$/

const sessionIdOf = (value?: string): string | undefined => (value && SESSION_ID.test(value) ? value : undefined)
const DOT_POSITION = /^\d+(\.\d+)*$/

export type DebugStep = {
  index: number
  id: string
  type: string
  description: string
  status: string
  position: string
  depth: number
  isCursor: boolean
  error?: string
}

export type DebugDetail = { mtime: number; steps: DebugStep[]; cursorIndex?: number }

export type DebugLine = { text: string; depth: number; tone?: 'cursor' | 'failed' | 'pending' | 'error' | 'more' }

const debugDetail = (detail: unknown): Partial<DebugDetail> => obj(detail) as Partial<DebugDetail>

export const isStopped = (entity: MablEntity): boolean => entity.status === 'stopped'

export const sessionFile = (home: string, sessionId: string): string => `${home}/.mabl/debug/${sessionId}/session.json`

const unquote = (token: string): string => token.replace(/^["']|["']$/g, '')

const lastJson = (text: string): Record<string, unknown> => {
  for (const line of text.split('\n').reverse()) {
    if (line.trim().startsWith('{')) {
      try {
        return obj(JSON.parse(line))
      } catch {
        continue
      }
    }
  }

  return {}
}

const runSummary = (text: string): string | undefined => {
  const results = [...text.matchAll(/^\[(\d+)\/(\d+)\]\s+(PASS|SKIP|FAIL)\b/gm)]
  const last = results.at(-1)
  if (!last) {
    return undefined
  }
  const passed = results.filter(match => match[3] !== 'FAIL').length

  return last[3] === 'FAIL' ? `run: ${passed} passed, then a failure` : `run: ${passed}/${last[2]} passed`
}

const subcommandStatus = (sub: string, ref: string | undefined, data: Record<string, unknown>, text: string): string | undefined => {
  switch (sub) {
    case 'stop':
      return 'stopped'
    case 'run-step': {
      const result = str(data.status)

      return result && (ref && DOT_POSITION.test(ref) ? `step ${ref} ${result}` : `step ${result}`)
    }
    case 'set-current-step': {
      const position = str(data.position)

      return position && `at ${position}`
    }
    case 'run-all':
    case 'run-to-step':
      return runSummary(text)
    default:
      return undefined
  }
}

/** Entities a `mabl agent debug session ...` call names. The session id is the positional after the subcommand. */
export const captureDebugger = (call: CallRecord): EntityUpdate[] => {
  const parsed = mablCall(call)
  if (parsed?.source !== 'cli') {
    return []
  }
  const [, sub, rest = ''] = parsed.sub.match(/^agent\s+debug\s+session\s+([\w-]+)\s*(.*)$/) ?? []
  if (!sub) {
    return []
  }
  const { cli } = parsed
  const data = lastJson(call.text)
  if (sub === 'start') {
    const sessionId = sessionIdOf(field(data, call.text, 'sessionId'))
    const testId = field(data, call.text, 'testId')

    return sessionId ? [{ kind: 'debug', id: sessionId, testId, name: testId, status: 'started', cli }] : []
  }
  const [first, second] = rest.split(/\s+/).map(unquote)
  const sessionId = sessionIdOf(first) ?? sessionIdOf(str(data.sessionId))
  if (!sessionId) {
    return []
  }
  const ref = second && !second.startsWith('-') && !/[<>]/.test(second) ? second : undefined
  const status = subcommandStatus(sub, ref, data, call.text)

  return [{ kind: 'debug', id: sessionId, status, cli }]
}

/** `list-steps -o json` output as steps with a tree depth, from the dot position or else the parent chain. */
export const parseSteps = (stdout: string): DebugStep[] => {
  let raw: unknown
  try {
    raw = JSON.parse(stdout)
  } catch {
    return []
  }
  const depthById = new Map<string, number>()

  return list(raw).flatMap((step, order) => {
    const id = str(step.id)
    if (!id) {
      return []
    }
    const index = num(step.index) ?? order
    const position = str(step.position) ?? String(index + 1)
    const parent = str(step.parentStepId)
    const depth = DOT_POSITION.test(position) ? position.split('.').length - 1 : parent ? (depthById.get(parent) ?? 0) + 1 : 0
    depthById.set(id, depth)

    return [
      {
        index,
        id,
        type: str(step.type) ?? 'step',
        description: str(step.description) ?? '',
        status: str(step.status) ?? 'pending',
        position,
        depth,
        isCursor: step.isCursor === true,
      },
    ]
  })
}

/** Test name and the latest error per step id from `session.json`; a later result of a step replaces an earlier one. */
export const sessionFacts = (text: string): { name?: string; errors: Record<string, string> } => {
  let data: Record<string, unknown>
  try {
    data = obj(JSON.parse(text))
  } catch {
    return { errors: {} }
  }
  const errors: Record<string, string> = {}
  for (const result of list(data.stepResults)) {
    const stepId = str(result.stepId)
    if (!stepId) {
      continue
    }
    const error = str(result.error)?.split('\n')[0]?.trim()
    if (error) {
      errors[stepId] = error.slice(0, ERROR_PREVIEW)
    } else {
      delete errors[stepId]
    }
  }

  return { name: str(obj(obj(data.snapshot).test).name), errors }
}

/** "at 14 · 26/40 passed · failed at 14": the cursor, the counts, and the last failed step. */
export const statusText = (steps: readonly DebugStep[]): string => {
  const cursor = steps.find(step => step.isCursor)
  const count = (status: string) => steps.filter(step => step.status === status).length
  const lastFailed = steps.findLast(step => step.status === 'failed')

  return [
    cursor ? `at ${cursor.position}` : 'at end',
    `${count('passed')}/${steps.length} passed`,
    count('skipped') > 0 && `${count('skipped')} skipped`,
    lastFailed && `failed at ${lastFailed.position}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

const failedAt = (status?: string): string | undefined => status?.match(/failed at ([\d.]+)/)?.[1]

const MARK: Record<string, string> = { passed: '✔', failed: '✖', skipped: '↷' }

/** One line per step, with a failed step's error under it; `focus` is the cursor's line, else the last failure's. */
export const debugLines = (steps: readonly DebugStep[]): { lines: DebugLine[]; focus: number } => {
  const lines: DebugLine[] = []
  let focus: number | undefined
  let lastFailedLine = 0
  for (const step of steps) {
    if (step.isCursor) {
      focus = lines.length
    }
    if (step.status === 'failed') {
      lastFailedLine = lines.length
    }
    const mark = step.isCursor ? '▶' : (MARK[step.status] ?? '·')
    const tone = step.isCursor ? 'cursor' : step.status === 'failed' ? 'failed' : step.status === 'passed' || step.status === 'skipped' ? undefined : 'pending'
    lines.push({ depth: step.depth, text: `${mark} ${step.position}  ${step.description || step.type}`, tone })
    if (step.status === 'failed' && step.error) {
      lines.push({ depth: step.depth + 2, text: step.error, tone: 'error' })
    }
  }

  return { lines, focus: focus ?? lastFailedLine }
}

/** Keeps `budget` lines around `focus`: a few before it, the rest after, with "… N more" in place of the cut ends. */
export const windowLines = (lines: readonly DebugLine[], focus: number, budget: number): DebugLine[] => {
  if (lines.length <= budget) {
    return [...lines]
  }
  const more = (count: number): DebugLine => ({ depth: 0, text: `… ${count} more`, tone: 'more' })
  const start = Math.max(0, focus - Math.min(LINES_BEFORE_CURSOR, Math.max(0, budget - 3)))
  if (start === 0) {
    return [...lines.slice(0, budget - 1), more(lines.length - budget + 1)]
  }
  if (start + budget - 1 >= lines.length) {
    return [more(lines.length - budget + 1), ...lines.slice(lines.length - budget + 1)]
  }

  return [more(start), ...lines.slice(start, start + budget - 2), more(lines.length - start - budget + 2)]
}

/** Re-lists the steps only when `session.json` changed; a missing file means the session ended. */
export const pollDebugger = async (ops: Ops, entity: MablEntity, detail: unknown): Promise<PollResult> => {
  if (!ops.home) {
    return { updates: [] }
  }
  const path = sessionFile(ops.home, entity.id)
  const mtime = await ops.mtime(path)
  if (mtime === undefined) {
    return { updates: [{ kind: 'debug', id: entity.id, status: 'stopped' }] }
  }
  if (debugDetail(detail).mtime === mtime) {
    return { updates: [] }
  }
  const cli = cliArgv(entity)
  const [listed, session] = await Promise.all([
    ops.run([...cli, 'agent', 'debug', 'session', 'list-steps', entity.id, '-o', 'json'], LIST_TIMEOUT_MS),
    ops.read(path),
  ])
  if (listed.exitCode !== 0) {
    return { updates: [] }
  }
  const steps = parseSteps(listed.stdout)
  const { name, errors } = sessionFacts(session ?? '')
  const withErrors = steps.map(step => (errors[step.id] ? { ...step, error: errors[step.id] } : step))
  const cursorIndex = withErrors.find(step => step.isCursor)?.index

  return {
    updates: [{ kind: 'debug', id: entity.id, name, status: statusText(withErrors) }],
    detail: { mtime, steps: withErrors, cursorIndex } satisfies DebugDetail,
  }
}

const TONE_PROPS: Record<NonNullable<DebugLine['tone']>, { color?: string; dimColor?: boolean; bold?: boolean }> = {
  cursor: { bold: true },
  failed: { color: 'red' },
  pending: { dimColor: true },
  error: { color: 'red', dimColor: true },
  more: { dimColor: true },
}

export const debuggerFeature: Feature = {
  kinds: ['debug'],
  tabKinds: ['debug'],
  capture: captureDebugger,
  pollMs: entity => (isStopped(entity) ? undefined : POLL_MS),
  poll: (ops, entity, detail) => pollDebugger(ops, entity, detail),
  isFinished: entity => isStopped(entity),
  announces: (before, after) => {
    const position = failedAt(after.status)

    return position && position !== failedAt(before?.status) ? `mabl debug ${after.name ?? after.id}: step ${position} failed` : undefined
  },
  tabTitle: entity => `Debug ${entity.name ?? entity.testId ?? entity.id}`,
  render: ({ Box, Button, Text }, { entity, detail, rows, actions }) => {
    const { steps } = debugDetail(detail)
    const { lines, focus } = debugLines(steps ?? [])
    const shown = windowLines(lines, focus, Math.max(4, rows - 5))
    const cli = entity.cli ?? 'mabl'

    return (
      <Box flexDirection="column">
        <Text bold>
          {entity.name ?? entity.testId ?? entity.id}
          {entity.status ? ` · ${entity.status}` : ''}
        </Text>
        <Text dimColor>
          {entity.id}
          {entity.testId ? ` · test ${entity.testId}` : ''}
        </Text>
        {!isStopped(entity) && (
          <Box marginBottom={1}>
            <Button
              key={`debug-next-${entity.id}`}
              label="Run next step"
              onPress={() => actions.fillPrompt(`${cli} agent debug session run-step ${entity.id}`)}
            />
          </Box>
        )}
        {!steps && !isStopped(entity) && <Text dimColor>Waiting for the step list…</Text>}
        {shown.map(line => (
          <Text wrap="truncate-end" {...(line.tone ? TONE_PROPS[line.tone] : {})}>
            {'  '.repeat(line.depth)}
            {line.text}
          </Text>
        ))}
      </Box>
    )
  },
}
