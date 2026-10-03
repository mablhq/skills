import { test } from 'claude-code/testing'

import { assert, stubJsx } from './assert'

import type { Ops, ToolResult } from '../core/feature'
import type { MablEntity } from '../types'
import {
  captureRuns,
  clipTo,
  deploymentDetail,
  deploymentStatus,
  formatDuration,
  isFinalStatus,
  planRunDetail,
  planRunStatus,
  pollRuns,
  runDetail,
  runState,
  runStatus,
  runsFeature,
  runsPollMs,
  sortRows,
  tally,
} from '../features/runs'

test('runs', async () => {
  stubJsx()
const WS = 'ws-w'
const BASE = 'https://app.mabl.com'
type EntityFields = Partial<MablEntity> & Pick<MablEntity, 'kind' | 'id'>
function entity(fields: EntityFields): MablEntity {
  return { updatedAt: 0, ...fields }
}

// Capture: trigger_mabl_deployment
{
  const updates = captureRuns({
    tool: 'mcp__mabl-alt__trigger_mabl_deployment',
    args: { workspaceId: WS, applicationId: 'a1-a', impactSessionId: 'i1-as' },
    text: '',
    structured: {
      deploymentId: 'd1-v',
      workspaceId: WS,
      deploymentUrl: `${BASE}/workspaces/${WS}/events/d1-v`,
      triggeredPlanRuns: [{ planId: 'p1', planRunId: 'pr1-pr' }, { planId: 'p2' }],
    },
  })
  assert.equal(updates.length, 2)
  const [deployment, planRun] = updates
  assert.deepEqual(
    { kind: deployment?.kind, id: deployment?.id, url: deployment?.url, mcpServer: deployment?.mcpServer, workspaceId: deployment?.workspaceId, impact: deployment?.impactSessionId, status: deployment?.status },
    { kind: 'deployment', id: 'd1-v', url: `${BASE}/workspaces/${WS}/events/d1-v`, mcpServer: 'mabl-alt', workspaceId: WS, impact: 'i1-as', status: 'started' },
  )
  assert.equal(planRun?.kind, 'planRun')
  assert.equal(planRun?.parentId, 'd1-v')
  assert.equal(planRun?.url, `${BASE}/workspaces/${WS}/output/plan-runs/pr1-pr`)
}
{
  const [deployment] = captureRuns({
    tool: 'mcp__mabl__trigger_mabl_deployment',
    args: { workspaceId: WS },
    text: '',
    structured: { deploymentId: 'd2-v', triggeredPlanRuns: [], noMatchingPlans: { reason: 'x' } },
  })
  assert.equal(deployment?.url, `https://app.mabl.com/workspaces/${WS}/output/deployments/d2-v`)
  assert.equal(deployment?.status, 'no plans matched')
  assert.equal(runsFeature.isFinished(deployment as MablEntity, undefined, {}), true)
}

// Capture: run_mabl_plan, rerun_mabl_plan, batch, single, rerun test
{
  const updates = captureRuns({
    tool: 'mcp__mabl__run_mabl_plan',
    args: { workspaceId: WS, planId: 'p1' },
    text: '',
    structured: {
      planRunId: 'pr2-pr',
      outputUrl: `https://app.mabl.com/workspaces/${WS}/output/plan-runs/pr2-pr`,
      testRuns: [{ id: 'jr1-jr', outputUrl: `https://app.mabl.com/workspaces/${WS}/test/journey-runs/jr1-jr` }],
    },
  })
  assert.deepEqual(updates.map(update => [update.kind, update.id, update.parentId]), [['planRun', 'pr2-pr', undefined], ['run', 'jr1-jr', 'pr2-pr']])
  assert.equal(updates[1]?.url, `https://app.mabl.com/workspaces/${WS}/test/journey-runs/jr1-jr`)
}
assert.equal(captureRuns({ tool: 'mcp__mabl__rerun_mabl_plan', args: { workspaceId: WS, planRunId: 'old-pr' }, text: '', structured: { planRunId: 'pr3-pr', outputUrl: 'x', testRuns: [] } })[0]?.id, 'pr3-pr')
{
  const updates = captureRuns({
    tool: 'mcp__mabl__run_mabl_test_batch_cloud',
    args: { workspaceId: WS, testIds: ['t1-j', 't2-j'], impactSessionId: 'i2-as' },
    text: '',
    structured: { planRunId: 'pr4-pr', outputUrl: 'u', testRuns: [{ testRunId: 'jr2-jr', testId: 't1-j', outputUrl: 'v' }] },
  })
  assert.equal(updates[0]?.name, 'batch of 2 tests')
  assert.equal(updates[1]?.testId, 't1-j')
  assert.equal(updates[1]?.parentId, 'pr4-pr')
  assert.equal(updates[1]?.impactSessionId, 'i2-as')
  const notStarted = captureRuns({ tool: 'mcp__mabl__run_mabl_test_batch_cloud', args: { workspaceId: WS }, text: '', structured: { testRuns: [] } })
  assert.deepEqual(notStarted, [])
}
{
  const [run] = captureRuns({
    tool: 'mcp__mabl__run_mabl_test_cloud',
    args: { workspaceId: WS, testId: 't1-j' },
    text: '',
    structured: { testRuns: [{ id: 'jr3-jr', outputUrl: `https://app.mabl.com/workspaces/${WS}/test/journey-runs/jr3-jr` }], resolvedBinding: { branch: 'feat' } },
  })
  assert.deepEqual([run?.id, run?.testId, run?.branch, run?.parentId, run?.workspaceId], ['jr3-jr', 't1-j', 'feat', undefined, WS])
  const [rerun] = captureRuns({ tool: 'mcp__mabl__rerun_mabl_test', args: { workspaceId: WS, testRunId: 'jr3-jr' }, text: '', structured: { planRunId: 'pr5-pr', testRuns: [{ id: 'jr4-jr', outputUrl: 'w' }] } })
  assert.equal(rerun?.id, 'jr4-jr')
  assert.equal(rerun?.parentId, undefined)
}
// Text fallback when there is no structured content
assert.equal(captureRuns({ tool: 'mcp__mabl__run_mabl_plan', args: { workspaceId: WS }, text: '{"planRunId":"pr6-pr","outputUrl":"o","testRuns":[{"id":"jr5-jr","outputUrl":"p"}]}' }).length, 2)

// Capture: CLI
{
  const updates = captureRuns({
    tool: 'Bash',
    args: { command: 'mabl tests run-cloud --id t1-j --mabl-branch feat' },
    text: `Running test: Login - t1-j - on branch - feat\nView at https://app.mabl.com/workspaces/${WS}/test/journey-runs/jr6-jr`,
  })
  const run = updates.find(update => update.kind === 'run')
  assert.deepEqual([run?.id, run?.workspaceId, run?.branch, run?.cli, run?.testId], ['jr6-jr', WS, 'feat', 'mabl', 't1-j'])
}
{
  const [json] = captureRuns({
    tool: 'Bash',
    args: { command: 'mabl-alt deployments create -a a1-a --output json' },
    text: JSON.stringify({ id: 'd3-v', href: `${BASE}/workspaces/${WS}/output/deployments/d3-v` }),
  })
  assert.deepEqual([json?.kind, json?.id, json?.workspaceId, json?.cli], ['deployment', 'd3-v', WS, 'mabl-alt'])
  const [plain] = captureRuns({
    tool: 'Bash',
    args: { command: 'mabl deployments create -a a1-a' },
    text: `\u001b[35mDeployment triggered. View output at: https://app.mabl.com/workspaces/${WS}/output/deployments/d4-v\u001b[39m`,
  })
  assert.equal(plain?.id, 'd4-v')
  assert.equal(plain?.url, `https://app.mabl.com/workspaces/${WS}/output/deployments/d4-v`)
}

// Status mapping and tally
assert.deepEqual(['completed', 'failed', 'terminated', 'skipped', 'queued', 'pre_execution', 'running'].map(runState), ['passed', 'failed', 'failed', 'skipped', 'queued', 'queued', 'running'])
assert.deepEqual(tally([{ status: 'completed' }, { status: 'failed' }, { status: 'terminated' }, { status: 'scheduled' }, { status: 'running' }, { status: 'skipped' }]), {
  total: 6,
  passed: 1,
  failed: 2,
  running: 1,
  queued: 1,
  skipped: 1,
})
assert.equal(isFinalStatus('failed (2 of 40 tests)'), true)
assert.equal(isFinalStatus('running (3 of 40 tests done)'), false)
assert.equal(formatDuration(83_000), '1m 23s')
assert.equal(clipTo([1, 2, 3, 4], 3, hidden => -hidden).join(','), '1,2,-2')
assert.deepEqual(sortRows([{ id: 'a', status: 'completed' }, { id: 'b', status: 'failed' }, { id: 'c', status: 'running' }]).map(row => row.id), ['b', 'c', 'a'])

const DEPLOYMENT_DONE = {
  status: 'completed',
  terminal: true,
  deployment: {
    applicationName: 'Shop',
    environmentName: 'dev',
    testMetrics: { total: 40, passed: 38, failed: 2, running: 0, skipped: 0 },
    finalPlanMetrics: { total: 2, passed: 1, failed: 1 },
    planRuns: [
      { planRunId: 'pr1-pr', planName: 'Smoke', status: 'failed', testRunCount: 20, failedTestRunsTotal: 2, failedTestRuns: [{ testRunId: 'jr7-jr', testName: 'Login', failureError: 'boom', appHref: 'h' }] },
      { planRunId: 'pr9-pr', planName: 'Smoke', status: 'failed', isRetry: true, failedTestRuns: [] },
    ],
  },
}
assert.equal(deploymentStatus(deploymentDetail(DEPLOYMENT_DONE)), 'failed (2 of 40 tests)')
assert.equal(deploymentStatus(deploymentDetail({ status: 'running', terminal: false, suggestedPollIntervalMs: 5000, deployment: { testMetrics: { total: 10, passed: 3 } } })), 'running (3 of 10 tests done)')
assert.equal(
  planRunStatus(planRunDetail({ planRun: { id: 'pr2-pr', status: 'succeeded', terminal: true }, testRuns: [{ id: 'a', testId: 't', testName: 'A', status: 'completed' }] })),
  'passed (1 tests)',
)
assert.equal(runStatus(runDetail({ terminal: true, success: false, status: 'failed' })), 'failed')
assert.equal(runStatus(runDetail({ terminal: true, success: true, status: 'completed' })), 'passed')

// pollMs and isFinished
assert.equal(runsPollMs(entity({ kind: 'deployment', id: 'd', workspaceId: WS, status: 'started' }), undefined), 30_000)
assert.equal(runsPollMs(entity({ kind: 'deployment', id: 'd', workspaceId: WS, status: 'running' }), deploymentDetail({ terminal: false, suggestedPollIntervalMs: 5000 })), 5000)
assert.equal(runsPollMs(entity({ kind: 'deployment', id: 'd', workspaceId: WS, status: 'passed (4 tests)' }), undefined), undefined)
assert.equal(runsPollMs(entity({ kind: 'deployment', id: 'd', status: 'started' }), undefined), undefined)
assert.equal(runsPollMs(entity({ kind: 'planRun', id: 'p', workspaceId: WS, status: 'started' }), undefined), 15_000)
assert.equal(runsPollMs(entity({ kind: 'run', id: 'r', workspaceId: WS, status: 'started' }), undefined), 10_000)
assert.equal(runsPollMs(entity({ kind: 'run', id: 'r', workspaceId: WS, status: 'running', parentId: 'p' }), undefined), undefined)
assert.equal(runsPollMs(entity({ kind: 'run', id: 'r', workspaceId: WS, status: 'failed', parentId: 'p' }), undefined), 10_000)
assert.equal(runsPollMs(entity({ kind: 'run', id: 'r', workspaceId: WS, status: 'failed' }), runDetail({ terminal: true })), undefined)
assert.equal(runsFeature.isFinished(entity({ kind: 'run', id: 'r', status: 'running' }), undefined, {}), false)
assert.equal(runsFeature.isFinished(entity({ kind: 'planRun', id: 'p', status: 'failed (1 of 3 tests)' }), undefined, {}), true)

// announces and tab titles
assert.equal(
  runsFeature.announces?.(entity({ kind: 'deployment', id: 'd1-v', name: 'Shop', status: 'running' }), entity({ kind: 'deployment', id: 'd1-v', name: 'Shop', status: 'failed (2 of 40 tests)' })),
  'mabl deployment Shop: failed (2 of 40 tests)',
)
assert.equal(runsFeature.announces?.(undefined, entity({ kind: 'run', id: 'r', parentId: 'p', status: 'failed' })), undefined)
assert.equal(runsFeature.announces?.(entity({ kind: 'run', id: 'r', status: 'failed' }), entity({ kind: 'run', id: 'r', status: 'failed' })), undefined)
assert.equal(runsFeature.tabTitle(entity({ kind: 'deployment', id: 'abcdefghijk-v' })), 'Deploy abcdefgh')

// Poll with a fake ops
const fakeOps = (results: Record<string, unknown>, calls: [string, string, Record<string, unknown>][]): Ops => ({
  callTool: async (server, tool, args): Promise<ToolResult> => {
    calls.push([server, tool, args])

    return tool in results ? { isError: false, structured: results[tool], text: '' } : { isError: true, structured: undefined, text: 'nope' }
  },
  run: async () => ({ exitCode: 1, stdout: '', stderr: '' }),
  mtime: async () => undefined,
  read: async () => undefined,
  home: '/',
  now: async () => 0,
})

await (async () => {
  const calls: [string, string, Record<string, unknown>][] = []
  const PLAN_RUN = {
    planRun: { id: 'pr2-pr', status: 'running', terminal: false },
    testRuns: [
      { id: 'jr1-jr', testId: 't1-j', testName: 'Login', status: 'failed', failureSummary: { error: 'boom', flowName: 'Sign in', stepDisplayNumber: '2.1' } },
      { id: 'jr8-jr', testId: 't2-j', testName: 'Cart', status: 'running' },
    ],
  }
  const ops = fakeOps({ get_mabl_plan_run: PLAN_RUN, get_mabl_deployment_status: DEPLOYMENT_DONE, get_mabl_test_run: { testName: 'Login', testId: 't1-j', status: 'failed', terminal: true, success: false, failingStep: '2.1', durationMs: 5000 } }, calls)

  const planRun = entity({ kind: 'planRun', id: 'pr2-pr', workspaceId: WS, mcpServer: 'mabl-alt', url: `${BASE}/workspaces/${WS}/output/plan-runs/pr2-pr`, status: 'started' })
  const first = await pollRuns(ops, planRun, undefined)
  assert.deepEqual(calls[0], ['mabl-alt', 'get_mabl_plan_run', { planRunId: 'pr2-pr', workspaceId: WS }])
  assert.equal(first.updates[0]?.status, 'running (1 of 2 tests done)')
  const runs = first.updates.filter(update => update.kind === 'run')
  assert.deepEqual(runs.map(run => [run.id, run.name, run.status, run.parentId]), [['jr1-jr', 'Login', 'failed', 'pr2-pr'], ['jr8-jr', 'Cart', 'running', 'pr2-pr']])
  assert.equal(runs[0]?.url, `${BASE}/workspaces/${WS}/test/journey-runs/jr1-jr`)
  assert.ok(first.detail)
  const again = await pollRuns(ops, { ...planRun, status: 'running (1 of 2 tests done)' }, first.detail)
  assert.deepEqual(again, { updates: [] })

  const deployment = entity({ kind: 'deployment', id: 'd1-v', workspaceId: WS, status: 'started' })
  const polled = await pollRuns(ops, deployment, undefined)
  assert.deepEqual(calls[2], ['mabl', 'get_mabl_deployment_status', { workspaceId: WS, deploymentId: 'd1-v' }])
  assert.deepEqual(polled.updates[0], { kind: 'deployment', id: 'd1-v', status: 'failed (2 of 40 tests)', name: 'Shop · dev' })
  assert.deepEqual(polled.updates.slice(1).map(update => [update.kind, update.id, update.name]), [['planRun', 'pr1-pr', 'Smoke']])

  const run = await pollRuns(ops, entity({ kind: 'run', id: 'jr1-jr', workspaceId: WS, status: 'started' }), undefined)
  assert.equal(run.updates[0]?.status, 'failed')
  assert.equal(run.updates[0]?.name, 'Login')

  const failing = await pollRuns(fakeOps({}, []), deployment, undefined)
  assert.deepEqual(failing, { updates: [] })
  assert.deepEqual(await pollRuns(ops, entity({ kind: 'run', id: 'x' }), undefined), { updates: [] })

  // Render: failure actions call the right closures with unique keys
  const prompts: string[] = []
  const toolCalls: [string, string, Record<string, unknown>][] = []
  const el = (name: string) => Object.defineProperty((props: unknown) => props, 'name', { value: name })
  const els = { Box: el('Box'), Text: el('Text'), Button: el('Button'), Link: el('Link') } as never
  const tree = runsFeature.render(els, {
    entity: { ...deployment, ...polled.updates[0] } as MablEntity,
    detail: polled.detail,
    entities: {},
    rows: 30,
    columns: 100,
    settings: { showSessionSteps: false, stepsPollMs: 15_000 },
    actions: {
      fillPrompt: text => void prompts.push(text),
      callTool: async (server, tool, args) => {
        toolCalls.push([server, tool, args])

        return { isError: false, structured: undefined, text: '' }
      },
      track: () => undefined,
      pollNow: () => undefined,
      openTab: () => undefined, openUrl: () => undefined, updateDetail: () => undefined,
    },
  })
  type Node = { tag: string; props: Record<string, unknown>; children: unknown[] }
  const walk = (node: unknown): Node[] => {
    const value = node as Node | undefined
    if (!value || typeof value !== 'object' || !('tag' in value)) {
      return []
    }

    return [value, ...value.children.flatMap(walk)]
  }
  const buttons = walk(tree).filter(node => node.tag === 'Button')
  assert.deepEqual(buttons.map(button => button.props.key), ['open-jr7-jr', 'debug-jr7-jr', 'rerun-jr7-jr'])
  ;(buttons[1]?.props.onPress as () => void)()
  ;(buttons[2]?.props.onPress as () => void)()
  assert.deepEqual(prompts, ['/mabl:mabl-debug jr7-jr'])
  assert.deepEqual(toolCalls, [['mabl', 'rerun_mabl_test', { testRunId: 'jr7-jr', workspaceId: WS }]])

  // Render: the test runs tracked under a deployment's plan run are listed with their live status
  const opened: string[] = []
  const planRunId = (polled.detail as { planRuns: { planRunId?: string }[] }).planRuns[0]?.planRunId ?? ''
  const children = {
    a: entity({ kind: 'run', id: 'a-jr', name: 'Passing test', status: 'passed', parentId: planRunId, url: 'https://app.mabl.com/workspaces/ws/test/journey-runs/a-jr' }),
    b: entity({ kind: 'run', id: 'b-jr', name: 'Running test', status: 'running', parentId: planRunId }),
    c: entity({ kind: 'run', id: 'c-jr', name: 'Elsewhere', status: 'passed', parentId: 'other-pr' }),
  }
  const withChildren = runsFeature.render(els, {
    entity: { ...deployment, ...polled.updates[0] } as MablEntity,
    detail: polled.detail,
    entities: children as never,
    rows: 30,
    columns: 100,
    settings: { showSessionSteps: false, stepsPollMs: 15_000 },
    actions: { openUrl: (url: string) => void opened.push(url) } as never,
  })
  const texts = walk(withChildren).filter(node => node.tag === 'Text').map(node => node.children.join(''))
  assert.ok(texts.some(text => text.includes('… Running test · running')), texts.join('\n'))
  assert.ok(texts.some(text => text.includes('✔ Passing test · passed')))
  assert.ok(!texts.some(text => text.includes('Elsewhere')))
  const openA = walk(withChildren).find(node => node.props.key === 'open-a-jr')
  ;(openA?.props.onPress as () => void)()
  assert.deepEqual(opened, ['https://app.mabl.com/workspaces/ws/test/journey-runs/a-jr'])
})()
})
