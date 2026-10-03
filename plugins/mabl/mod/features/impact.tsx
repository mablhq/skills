import type { MablEntities, MablEntity } from '../types'
import type { Feature, Ops } from '../core/feature'
import { hashOf, list, mablCall, mcpServerFor, obj, parseJson, skillCommand, str, withWorkspace } from '../core/util'
import type { CallRecord, EntityUpdate, Fields } from '../core/util'

const NAME_WORDS = 6

export type ImpactTest = {
  testName: string
  testId: string
  role?: string
  relation?: string
  expectedOutcome?: string
  evidence?: string
  viewTestUrl?: string
  enabled?: boolean
  stepCount?: number
  aiAssertions?: boolean
  quality?: number
  labels?: string[]
}

/** A deployment of the analyzed application, offered as a cloud run target. */
export type Target = { deploymentId: string; environmentId?: string; name: string; url: string }

export type ImpactUi = {
  /** The chosen cloud target's deployment id; absent means "infer from run history". */
  target?: string
  /** Test ids whose evidence row is open. */
  expanded?: string[]
  /** Relation groups the person collapsed or opened, overriding the default. */
  groups?: Record<string, boolean>
}

export type ImpactDetail = {
  changeDescription?: string
  summary?: string
  tests: ImpactTest[]
  gaps: string[]
  moreMayExist: boolean
  moreMayExistNote?: string
  revision?: string
  branch?: string
  references: { type?: string; id?: string; url?: string }[]
  workspaceId?: string
  applicationId?: string
  /** Undefined until fetched; empty when the lookup failed or found no deployment with a URL. */
  targets?: Target[]
  ui?: ImpactUi
}

export type RunOutcome = 'passed' | 'failed' | 'ended' | 'running'

export type KeptTest = { name: string; testId: string; status?: string; outcome: RunOutcome; url?: string }

export type DispatchView = { linked: MablEntity[]; parents: MablEntity[]; kept: KeptTest[]; notRun: ImpactTest[] }

export type ImpactLine = { text: string; href?: string; label?: string; bold?: boolean; dim?: boolean }

// `capture` cannot return detail, so it parks the analysis here and the first poll hands it to the store.
const captured = new Map<string, ImpactDetail>()

const resultData = (call: CallRecord): Fields => {
  const data = obj(call.structured)

  return Object.keys(data).length > 0 ? data : obj(parseJson(call.text))
}

const toTest = (raw: Fields): ImpactTest | undefined => {
  const testId = str(raw.testId)
  const context = obj(raw.runContext)
  const quality = obj(context.quality).score

  return testId
    ? {
        enabled: typeof context.enabled === 'boolean' ? context.enabled : undefined,
        stepCount: typeof context.stepCount === 'number' ? context.stepCount : undefined,
        aiAssertions: context.aiAssertions === true,
        quality: typeof quality === 'number' ? quality : undefined,
        labels: Array.isArray(context.labels) ? context.labels.flatMap(label => str(label) ?? []) : undefined,
        testName: str(raw.testName) ?? testId,
        testId,
        role: str(raw.role),
        relation: str(raw.relation),
        expectedOutcome: str(raw.expectedOutcome),
        evidence: str(raw.evidence),
        viewTestUrl: str(raw.viewTestUrl),
      }
    : undefined
}

export const toImpactDetail = (args: Fields, data: Fields): ImpactDetail => ({
  changeDescription: str(args.changeDescription),
  summary: str(data.summary),
  tests: list(data.tests)
    .map(toTest)
    .filter((test): test is ImpactTest => test !== undefined),
  gaps: Array.isArray(data.coverageGaps) ? data.coverageGaps.flatMap(gap => str(gap) ?? []) : [],
  moreMayExist: data.moreMayExist === true,
  moreMayExistNote: str(data.moreMayExistNote),
  revision: str(data.revision) ?? str(args.revision),
  branch: str(data.branch) ?? str(args.branch),
  references: list(data.references ?? args.references).map(ref => ({ type: str(ref.type), id: str(ref.id), url: str(ref.url) })),
  workspaceId: str(data.workspaceId),
  applicationId: str(data.applicationId) ?? str(args.applicationId),
})

export const shortName = (text: string, words = NAME_WORDS): string => {
  const all = text.trim().split(/\s+/)

  return all.length > words ? `${all.slice(0, words).join(' ')}…` : all.join(' ')
}

export const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`

export const captureImpact = (call: CallRecord): EntityUpdate[] => {
  const parsed = mablCall(call)
  if (parsed?.source !== 'mcp' || parsed.name !== 'analyze_test_impact') {
    return []
  }
  const data = resultData(call)
  if (!Array.isArray(data.tests)) {
    return []
  }
  const detail = toImpactDetail(call.args, data)
  const id = str(data.sessionId) ?? `impact-${hashOf(call.args).replace(':', '-')}`
  const reference = detail.references[0]
  captured.set(id, detail)

  return [
    withWorkspace({
      kind: 'impact',
      id,
      name: detail.changeDescription ? shortName(detail.changeDescription) : (reference?.id ?? reference?.url),
      status: `${detail.tests.length} impacted · ${plural(detail.gaps.length, 'gap')}`,
      workspaceId: str(data.workspaceId),
      mcpServer: parsed.server,
      url: undefined,
    }),
  ]
}

export const runOutcome = (status?: string): RunOutcome => {
  const text = status?.split(' (')[0]?.toLowerCase() ?? ''
  if (/\b(fail\w*|error|terminated|cancell?ed|timed?[ _-]?out)\b/.test(text)) {
    return 'failed'
  }
  if (/\b(passed|succeeded|success)\b/.test(text)) {
    return 'passed'
  }

  return /\b(completed|skipped|stopped|finished|done)\b/.test(text) ? 'ended' : 'running'
}

/** Runs, plan runs and deployments dispatched for this analysis, and everything under them by `parentId`. */
export const linkedRuns = (impactId: string, entities: MablEntities): MablEntity[] => {
  const all = Object.values(entities).filter(entity => entity.kind === 'run' || entity.kind === 'planRun' || entity.kind === 'deployment')
  const ids = new Set(all.filter(entity => entity.impactSessionId === impactId).map(entity => entity.id))
  let isGrowing = ids.size > 0
  while (isGrowing) {
    isGrowing = false
    for (const entity of all) {
      if (!ids.has(entity.id) && entity.parentId && ids.has(entity.parentId)) {
        ids.add(entity.id)
        isGrowing = true
      }
    }
  }

  return all.filter(entity => ids.has(entity.id))
}

/** Kept: impacted tests (and any extra tests) with a linked test run, newest run per test. Not run: the rest. */
export const splitDispatch = (tests: readonly ImpactTest[], linked: readonly MablEntity[]): DispatchView => {
  const latest = new Map<string, MablEntity>()
  for (const run of linked) {
    const previous = run.kind === 'run' && run.testId ? latest.get(run.testId) : undefined
    if (run.kind === 'run' && run.testId && (!previous || previous.updatedAt <= run.updatedAt)) {
      latest.set(run.testId, run)
    }
  }
  const toKept = (testId: string, run: MablEntity, test?: ImpactTest): KeptTest => ({
    name: test?.testName ?? run.name ?? testId,
    testId,
    status: run.status,
    outcome: runOutcome(run.status),
    url: run.url ?? test?.viewTestUrl,
  })
  const impactedIds = new Set(tests.map(test => test.testId))
  const kept = [
    ...tests.flatMap(test => {
      const run = latest.get(test.testId)

      return run ? [toKept(test.testId, run, test)] : []
    }),
    ...[...latest].filter(([testId]) => !impactedIds.has(testId)).map(([testId, run]) => toKept(testId, run)),
  ]

  return {
    linked: [...linked],
    parents: linked.filter(entity => entity.kind !== 'run'),
    kept,
    notRun: tests.filter(test => !latest.has(test.testId)),
  }
}

export const isImpactSettled = (impactId: string, entities: MablEntities): boolean =>
  linkedRuns(impactId, entities).every(entity => runOutcome(entity.status) !== 'running')

export const headline = (detail: ImpactDetail, view: DispatchView): string[] => {
  const tests = detail.tests.length
  const gaps = plural(detail.gaps.length, 'gap')
  const reach =
    tests === 0
      ? `The analysis found no existing test that reaches this change, and named ${gaps}.`
      : `This change reaches ${plural(tests, 'existing test')} and leaves ${gaps}.`
  if (view.kept.length === 0) {
    return view.linked.length > 0 ? [reach, 'Runs dispatched; no test runs seen yet.'] : [reach]
  }
  const count = (outcome: RunOutcome) => view.kept.filter(kept => kept.outcome === outcome).length
  const ended = count('ended')

  return [reach, `${view.kept.length} dispatched: ${count('passed')} passed, ${count('failed')} failed, ${count('running')} running${ended > 0 ? `, ${ended} other` : ''}.`]
}

export const wrapText = (text: string, width: number, maxLines: number): string[] => {
  const lines: string[] = []
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const last = lines[lines.length - 1]
    if (last !== undefined && last.length + 1 + word.length <= width) {
      lines[lines.length - 1] = `${last} ${word}`
    } else {
      lines.push(word)
    }
  }

  return lines.length > maxLines ? [...lines.slice(0, maxLines - 1), `${lines[maxLines - 1] ?? ''} …`] : lines
}

const MAX_APPLICATION_PAGES = 3
const INFER_TARGET = 'infer'
const LOW_QUALITY = 30

export const GROUPS = [
  { key: 'direct', label: 'Direct', isOpen: true },
  { key: 'blast_radius', label: 'Blast radius', isOpen: false },
  { key: 'adjacent', label: 'Adjacent', isOpen: false },
  { key: 'other', label: 'Other', isOpen: false },
] as const

export const groupOf = (test: ImpactTest): string => (GROUPS.some(group => group.key === test.relation) ? (test.relation ?? 'other') : 'other')

/** The analyzed application's deployments that have a URL, from `list_mabl_applications`. */
export const targetsOf = (structured: unknown, applicationId: string): Target[] => {
  const application = list(obj(structured).applications).find(app => str(app.applicationId) === applicationId)

  return list(application?.environments)
    .flatMap(env => {
      const deploymentId = str(env.deploymentId)
      const url = str(env.url)

      return deploymentId && url ? [{ deploymentId, environmentId: str(env.environmentId), name: str(env.name) ?? 'deployment', url }] : []
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

const needsTargets = (detail: unknown): boolean => {
  const impact = detail as ImpactDetail | undefined

  return Boolean(impact?.tests && impact.applicationId && !impact.targets)
}

const fetchTargets = async (ops: Ops, server: string, workspaceId: string, applicationId: string): Promise<Target[]> => {
  let cursor: string | undefined
  for (let page = 0; page < MAX_APPLICATION_PAGES; page++) {
    const result = await ops.callTool(server, 'list_mabl_applications', { workspaceId, limit: 100, ...(cursor ? { cursor } : {}) })
    if (result.isError) {
      return []
    }
    const targets = targetsOf(result.structured, applicationId)
    cursor = str(obj(result.structured).nextCursor)
    if (targets.length > 0 || !cursor) {
      return targets
    }
  }

  return []
}

export const markOf = (test: ImpactTest, kept?: KeptTest): string => {
  if (kept) {
    return { passed: '✔', failed: '✖', running: '…', ended: '■' }[kept.outcome]
  }
  if (test.enabled === false) {
    return '⊘'
  }
  if (test.stepCount === 0) {
    return '∅'
  }

  return test.quality !== undefined && test.quality < LOW_QUALITY ? '!' : '·'
}

export const tagsOf = (test: ImpactTest, kept?: KeptTest): string =>
  [
    kept?.status,
    test.role,
    test.enabled === false && 'disabled',
    test.stepCount === 0 ? 'no steps' : test.stepCount !== undefined && `${test.stepCount} steps`,
    test.quality !== undefined && `q${test.quality}`,
    test.aiAssertions && 'AI',
    ...(test.labels ?? []).filter(label => /smoke|regression/.test(label)).map(label => (/smoke/.test(label) ? 'smoke' : 'regression')),
  ]
    .filter(Boolean)
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .join(' · ')

export const targetText = (detail: ImpactDetail): string => {
  const target = detail.targets?.find(candidate => candidate.deploymentId === detail.ui?.target)

  return target
    ? `Target: deployment "${target.name}" ${target.url} (deploymentId ${target.deploymentId}${target.environmentId ? `, environmentId ${target.environmentId}` : ''}); take the credential from the test's latest passing run.`
    : "Infer the target (deployment and credential) from the test's latest passing run, and tell me which one you picked."
}

const scopeOf = (impactId: string, detail: ImpactDetail, workspaceId?: string): string =>
  `test impact analysis ${impactId} (workspace ${workspaceId ?? detail.workspaceId ?? 'unknown'}, application ${detail.applicationId ?? 'unknown'})`

export const cloudPrompt = (impactId: string, detail: ImpactDetail, test: ImpactTest, workspaceId?: string): string =>
  `${skillCommand('mabl-test-impact')} Run the mabl test "${test.testName}" (${test.testId}) in the cloud for ${scopeOf(impactId, detail, workspaceId)}. ${targetText(detail)} Screen it first (hard gates, side-effect band), dispatch it with run_mabl_test_batch_cloud and impactSessionId ${impactId} so the run links to the analysis, and ask me before running anything outside the read-only or contained bands.`

export const debugPrompt = (impactId: string, detail: ImpactDetail, test: ImpactTest, workspaceId?: string): string =>
  `${skillCommand('mabl-debug')} Start a local debug session for the mabl test "${test.testName}" (${test.testId}) from ${scopeOf(impactId, detail, workspaceId)}, using the mabl debug CLI (agent debug session start) in a local browser. ${targetText(detail)} Stop before the first step and show me the step list.`

export const createPrompt = (impactId: string, detail: ImpactDetail, gap: string, workspaceId?: string): string =>
  `${skillCommand('mabl-test-authoring')} Create one mabl test that covers this gap from ${scopeOf(impactId, detail, workspaceId)}: "${gap}". Infer the mabl branch to author it on (an open branch for this change, if there is one); if you cannot tell, ask me. ${targetText(detail)}`

export const impactFeature: Feature = {
  kinds: ['impact'],
  tabKinds: ['impact'],
  capture: captureImpact,
  pollMs: (entity, detail) => (captured.has(entity.id) || needsTargets(detail) ? 0 : undefined),
  poll: async (ops, entity, detail) => {
    const parked = captured.get(entity.id)
    if (parked) {
      captured.delete(entity.id)

      return { updates: [], detail: parked }
    }
    const impact = detail as ImpactDetail | undefined
    if (!impact?.tests || !impact.applicationId || impact.targets) {
      return { updates: [] }
    }
    const workspaceId = entity.workspaceId ?? impact.workspaceId
    const targets = workspaceId ? await fetchTargets(ops, mcpServerFor(entity), workspaceId, impact.applicationId).catch(() => []) : []

    return { updates: [], detail: { ...impact, targets } }
  },
  isFinished: (entity, _detail, entities) => isImpactSettled(entity.id, entities),
  tabTitle: entity => `Impact ${entity.name ?? entity.id}`,
  render: ({ Box, Button, Select, Text }, { entity, detail, entities, rows, columns, actions }) => {
    const impact = detail as ImpactDetail | undefined
    if (!impact?.tests) {
      return (
        <Box flexDirection="column">
          <Text bold>
            {entity.name ?? entity.id} · {entity.status ?? 'unknown'}
          </Text>
          <Text dimColor>The analysis details are not loaded in this session.</Text>
        </Box>
      )
    }
    const view = splitDispatch(impact.tests, linkedRuns(entity.id, entities))
    const keptById = new Map(view.kept.map(kept => [kept.testId, kept]))
    const ui = impact.ui ?? {}
    const setUi = (change: (current: ImpactUi) => ImpactUi) =>
      actions.updateDetail(entity.id, current => {
        const stored = current as ImpactDetail

        return { ...stored, ui: change(stored.ui ?? {}) }
      })
    const nameWidth = Math.max(18, Math.min(60, columns - 42))
    const rowsOut: JSX.Element[] = []
    const push = (row: JSX.Element) => rowsOut.push(row)

    for (const [index, text] of headline(impact, view).entries()) {
      push(<Text bold={index === 0}>{text}</Text>)
    }
    for (const text of wrapText(impact.changeDescription ?? '', Math.max(40, columns - 4), 2)) {
      push(<Text dimColor>{text}</Text>)
    }
    push(
      <Box gap={1}>
        <Text bold>Target</Text>
        {Select && impact.targets && impact.targets.length > 0 ? (
          <Select
            key={`target-${entity.id}`}
            value={ui.target ?? INFER_TARGET}
            options={[{ value: INFER_TARGET, label: 'Infer from run history' }, ...impact.targets.map(target => ({ value: target.deploymentId, label: `${target.name} · ${target.url}` }))]}
            onSelect={value => setUi(current => ({ ...current, target: value === INFER_TARGET ? undefined : value }))}
          />
        ) : (
          <Text dimColor>{impact.targets || !impact.applicationId ? 'infer from run history' : 'loading deployments…'}</Text>
        )}
      </Box>,
    )

    push(<Text bold>{`Gaps (${impact.gaps.length})`}</Text>)
    if (impact.gaps.length === 0) {
      push(<Text dimColor>The analysis named no uncovered behavior.</Text>)
    }
    for (const [index, gap] of impact.gaps.entries()) {
      push(
        <Box gap={1}>
          <Box width={Math.max(20, columns - 14)}>
            <Text wrap="truncate-end">! {gap}</Text>
          </Box>
          <Button key={`create-${index}`} label="Create" onPress={() => actions.fillPrompt(createPrompt(entity.id, impact, gap, entity.workspaceId))} />
        </Box>,
      )
    }

    push(<Text bold>{`Impacted (${impact.tests.length})`}</Text>)
    for (const group of GROUPS) {
      const tests = impact.tests.filter(test => groupOf(test) === group.key)
      if (tests.length === 0) {
        continue
      }
      const isOpen = ui.groups?.[group.key] ?? group.isOpen
      push(
        <Button
          key={`group-${group.key}`}
          label={`${isOpen ? '▾' : '▸'} ${group.label} (${tests.length})`}
          plain
          onPress={() => setUi(current => ({ ...current, groups: { ...current.groups, [group.key]: !isOpen } }))}
        />,
      )
      if (!isOpen) {
        continue
      }
      for (const test of tests) {
        const kept = keptById.get(test.testId)
        const isExpanded = ui.expanded?.includes(test.testId) ?? false
        push(
          <Box gap={1}>
            <Box width={nameWidth}>
              <Text wrap="truncate-end">
                {markOf(test, kept)} {test.testName}
              </Text>
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <Text dimColor wrap="truncate-end">
                {tagsOf(test, kept)}
              </Text>
            </Box>
            <Button key={`cloud-${test.testId}`} label="Run Cloud" onPress={() => actions.fillPrompt(cloudPrompt(entity.id, impact, test, entity.workspaceId))} />
            <Button key={`debug-${test.testId}`} label="Debug" onPress={() => actions.fillPrompt(debugPrompt(entity.id, impact, test, entity.workspaceId))} />
            {(kept?.url ?? test.viewTestUrl) && (
              <Button key={`open-${test.testId}`} label="Open" onPress={() => actions.openUrl(kept?.url ?? test.viewTestUrl ?? '')} />
            )}
            <Button
              key={`more-${test.testId}`}
              label={isExpanded ? '−' : '⋯'}
              onPress={() =>
                setUi(current => ({
                  ...current,
                  expanded: isExpanded ? (current.expanded ?? []).filter(id => id !== test.testId) : [...(current.expanded ?? []), test.testId],
                }))
              }
            />
          </Box>,
        )
        if (isExpanded && test.evidence) {
          push(<Text dimColor>{`    ${test.evidence}`}</Text>)
        }
      }
    }
    if (impact.moreMayExist) {
      push(<Text dimColor>{`More relevant tests may exist.${impact.moreMayExistNote ? ` ${impact.moreMayExistNote}` : ''}`}</Text>)
    }

    const shown = rowsOut.length > rows ? [...rowsOut.slice(0, Math.max(1, rows - 1)), <Text dimColor>{`… ${rowsOut.length - rows + 1} more rows; collapse a group or widen the pane`}</Text>] : rowsOut

    return <Box flexDirection="column">{shown}</Box>
  },
}
