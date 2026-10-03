import { test } from 'claude-code/testing'

import { assert } from './assert'

import type { Ops, Settings } from '../core/feature'
import { clipLines, captureAuthoring, stepLines, stepsPage, authoringFeature } from '../features/authoring'
import type { AuthoringDetail } from '../features/authoring'

test('authoring', async () => {
const STEPS = [
  { path: '1', text: 'Visit', kind: 'step' },
  { path: '2', text: 'Log in', kind: 'flow-start', flowId: 'f1-f', collapsedStepCount: 2 },
  { path: '', text: 'Log in', kind: 'flow-end' },
  { path: '3', text: 'Checkout', kind: 'task-start' },
  { path: '3.1', text: 'Buy', kind: 'step' },
  { path: '', text: 'Checkout', kind: 'task-end' },
]
assert.deepEqual(
  stepLines(STEPS, { 'f1-f': ['Enter email'] }).map(line => `${'  '.repeat(line.depth)}${line.text}`),
  ['1  Visit', '⤷ Log in (2 steps)', '  Enter email', '▸ Checkout', '  3.1  Buy'],
)
assert.equal(clipLines(stepLines(STEPS, {}), 2, true)[0]?.text, '… 3 more')
assert.equal(stepsPage({ sessionStatus: 'running', steps: STEPS }).entries.length, 6)
const [session] = captureAuthoring({
  tool: 'mcp__mabl-alt__mabl_authoring_initiate',
  args: { workspaceId: 'ws-w', testInformation: { name: 'Demo' } },
  text: '',
  structured: { sessionId: 's1-as', viewTaskUrl: 'https://app.mabl.com/workspaces/ws-w/agents/tasks/s1-as' },
})
assert.equal(session?.mcpServer, 'mabl-alt')
assert.equal(session?.name, 'Demo')

const flowCalls: Record<string, unknown>[] = []
const ops: Ops = {
  callTool: async (_server, tool, args) => {
    if (tool === 'get_mabl_flow_steps') {
      flowCalls.push(args)
    }

    return { isError: false, structured: tool === 'get_mabl_flow_steps' ? { steps: [{ description: 'Enter email' }] } : { sessionStatus: 'running', steps: STEPS }, text: '' }
  },
  run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
  mtime: async () => undefined,
  read: async () => undefined,
  home: '/home',
  now: async () => 1,
}
const settings: Settings = { showSessionSteps: true, stepsPollMs: 15_000 }
const running = { kind: 'authoring' as const, id: 's1-as', status: 'running', mcpServer: 'mabl', updatedAt: 1 }
const onMaster = (await authoringFeature.poll!(ops, running, undefined, settings)).detail as AuthoringDetail
assert.deepEqual(flowCalls, [{ flowId: 'f1-f', detail: 'compact' }])
await authoringFeature.poll!(ops, { ...running, branch: 'feat-x' }, onMaster, settings)
assert.deepEqual(flowCalls[1], { flowId: 'f1-f', detail: 'compact', branch: 'feat-x' }, 'a newly known branch refetches its flows')
})
