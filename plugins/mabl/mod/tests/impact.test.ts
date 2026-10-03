import { test } from 'claude-code/testing'

import { assert, stubJsx } from './assert'

import type { MablEntities, MablEntity } from '../types'
import {
  captureImpact,
  headline,
  cloudPrompt,
  createPrompt,
  debugPrompt,
  groupOf,
  impactFeature,
  isImpactSettled,
  linkedRuns,
  markOf,
  runOutcome,
  shortName,
  splitDispatch,
  tagsOf,
  targetText,
  targetsOf,
  wrapText,
} from '../features/impact'
import type { ImpactDetail } from '../features/impact'

test('impact', async () => {
  stubJsx()
const WS = 'ws1-w'
const testUrl = (id: string) => `https://app.mabl.com/workspaces/${WS}/train/tests/${id}/current`
const STRUCTURED = {
  tests: [
    { testName: 'Checkout - Shipping address', testId: 't1-j', role: 'validates', relation: 'direct', expectedOutcome: 'should_pass', evidence: 'Step 4 types a postal code into the shipping form and asserts the error text.', context: 'c', viewTestUrl: testUrl('t1-j') },
    { testName: 'Account - Saved addresses', testId: 't2-j', relation: 'blast_radius', expectedOutcome: 'fails_by_design', evidence: 'x'.repeat(300), context: 'c', viewTestUrl: testUrl('t2-j') },
    { testName: 'Catalog - Search', testId: 't3-j', relation: 'adjacent', expectedOutcome: 'uncertain', evidence: 'Nearest coverage.', context: 'c', viewTestUrl: testUrl('t3-j') },
  ],
  moreMayExist: true,
  moreMayExistNote: 'Narrow guidance to checkout only.',
  policy: 'default',
  summary: 'Searched checkout and account settings.',
  coverageGaps: ['Expiry date validation on keystroke', 'Card number formatting in settings'],
  qualityWindow: { startTime: 1, endTime: 2 },
  runContextIncomplete: false,
  workspaceId: WS,
  applicationId: 'app1-a',
  sessionId: 'imp1-as',
}
const ARGS = { changeDescription: 'Validation now fires on each keystroke instead of on blur in checkout and account settings', applicationId: 'app1-a' }

const [entity, ...rest] = captureImpact({ tool: 'mcp__mabl-alt__analyze_test_impact', args: ARGS, text: '', structured: STRUCTURED })
assert.equal(rest.length, 0)
assert.equal(entity?.kind, 'impact')
assert.equal(entity?.id, 'imp1-as')
assert.equal(entity?.name, 'Validation now fires on each keystroke…')
assert.equal(entity?.status, '3 impacted · 2 gaps')
assert.equal(entity?.workspaceId, WS)
assert.equal(entity?.mcpServer, 'mabl-alt')
assert.equal(captureImpact({ tool: 'mcp__mabl-alt__search_mabl_tests', args: ARGS, text: '', structured: STRUCTURED }).length, 0)
assert.equal(captureImpact({ tool: 'mcp__mabl-alt__analyze_test_impact', args: ARGS, text: 'Test impact analysis is not enabled for workspace x.' }).length, 0)

const { sessionId: _session, ...noSession } = STRUCTURED
const [fromText] = captureImpact({ tool: 'mcp__mabl__analyze_test_impact', args: ARGS, text: JSON.stringify(noSession) })
const [again] = captureImpact({ tool: 'mcp__mabl__analyze_test_impact', args: ARGS, text: JSON.stringify(noSession) })
assert.match(fromText?.id ?? '', /^impact-\d+-\d+$/)
assert.equal(fromText?.id, again?.id)

const settings = { showSessionSteps: false, stepsPollMs: 15_000 }
const main = async () => {
const stored = { ...(entity as MablEntity), updatedAt: 0 }
assert.equal(impactFeature.pollMs(stored, undefined, settings), 0)
const polled = await impactFeature.poll!({} as never, stored, undefined, settings)
const detail = polled.detail as ImpactDetail
assert.equal(detail.tests.length, 3)
assert.deepEqual(detail.gaps, STRUCTURED.coverageGaps)
assert.equal(detail.changeDescription, ARGS.changeDescription)
assert.equal(impactFeature.pollMs(stored, detail, settings), 0, 'polls once more for the deployments')
const APPS = { applications: [{ applicationId: 'other-a', environments: [] }, { applicationId: 'app1-a', environments: [
  { deploymentId: 'd2-d', environmentId: 'e2-e', name: 'Prod', url: 'https://app.example.com' },
  { deploymentId: 'd0-d', environmentId: 'e2-e', name: 'Prod', url: '' },
  { deploymentId: 'd1-d', environmentId: 'e1-e', name: 'Dev', url: 'https://dev.example.com' },
] }] }
const calls: string[] = []
const fakeOps = { callTool: async (_server: string, tool: string) => (calls.push(tool), { isError: false, structured: APPS, text: '' }) }
const withTargets = (await impactFeature.poll!(fakeOps as never, stored, detail, settings)).detail as ImpactDetail
assert.deepEqual(calls, ['list_mabl_applications'])
assert.deepEqual(withTargets.targets?.map(target => target.deploymentId), ['d1-d', 'd2-d'])
assert.equal(impactFeature.pollMs(stored, withTargets, settings), undefined)
assert.deepEqual(targetsOf(APPS, 'missing-a'), [])

assert.equal(shortName('one two three'), 'one two three')
assert.equal(runOutcome('succeeded'), 'passed')
assert.equal(runOutcome('failed'), 'failed')
assert.equal(runOutcome('completed'), 'ended')
assert.equal(runOutcome('started'), 'running')
assert.equal(runOutcome(undefined), 'running')

const at = (updatedAt: number, fields: Omit<MablEntity, 'updatedAt'>): MablEntity => ({ ...fields, updatedAt })
const ENTITIES: MablEntities = Object.fromEntries(
  [
    at(1, { kind: 'impact', id: 'imp1-as' }),
    at(1, { kind: 'deployment', id: 'd1', impactSessionId: 'imp1-as', status: 'running', url: 'https://app.mabl.com/workspaces/ws1-w/events/d1' }),
    at(1, { kind: 'planRun', id: 'pr1', parentId: 'd1', status: 'running' }),
    at(1, { kind: 'run', id: 'jr1', parentId: 'pr1', testId: 't1-j', status: 'failed' }),
    at(2, { kind: 'run', id: 'jr2', parentId: 'pr1', testId: 't1-j', status: 'succeeded', url: 'https://app.mabl.com/workspaces/ws1-w/output/jr2' }),
    at(1, { kind: 'run', id: 'jr3', impactSessionId: 'imp1-as', testId: 'x9-j', name: 'Account - Sign in', status: 'running' }),
    at(1, { kind: 'run', id: 'jr4', testId: 't3-j', status: 'passed' }),
    at(1, { kind: 'run', id: 'jr5', impactSessionId: 'other-as', testId: 't2-j', status: 'passed' }),
  ].map(item => [item.id, item]),
)

const linked = linkedRuns('imp1-as', ENTITIES)
assert.deepEqual(linked.map(item => item.id).sort(), ['d1', 'jr1', 'jr2', 'jr3', 'pr1'])
const view = splitDispatch(detail.tests, linked)
assert.deepEqual(
  view.kept.map(kept => [kept.testId, kept.outcome]),
  [
    ['t1-j', 'passed'],
    ['x9-j', 'running'],
  ],
)
assert.equal(view.kept[0]?.url, 'https://app.mabl.com/workspaces/ws1-w/output/jr2')
assert.equal(view.kept[1]?.name, 'Account - Sign in')
assert.deepEqual(view.notRun.map(test => test.testId), ['t2-j', 't3-j'])
assert.deepEqual(view.parents.map(parent => parent.id), ['d1', 'pr1'])

assert.deepEqual(headline(detail, view), ['This change reaches 3 existing tests and leaves 2 gaps.', '2 dispatched: 1 passed, 0 failed, 1 running.'])
const none = splitDispatch(detail.tests, [])
assert.deepEqual(headline(detail, none), ['This change reaches 3 existing tests and leaves 2 gaps.'])
assert.deepEqual(headline({ ...detail, tests: [], gaps: ['a'] }, none), ['The analysis found no existing test that reaches this change, and named 1 gap.'])

assert.equal(isImpactSettled('imp1-as', ENTITIES), false)
assert.equal(isImpactSettled('nothing-as', ENTITIES), true)
assert.equal(impactFeature.isFinished(stored, detail, ENTITIES), false)
assert.equal(impactFeature.isFinished(stored, detail, {}), true)

assert.deepEqual(wrapText('aa bb cc dd ee', 5, 2), ['aa bb', 'cc dd …'])

assert.equal(groupOf(detail.tests[0]!), 'direct')
assert.equal(groupOf({ testName: 'x', testId: 'x-j', relation: 'weird' }), 'other')
assert.equal(markOf({ testName: 'x', testId: 'x-j', stepCount: 0 }), '∅')
assert.equal(markOf({ testName: 'x', testId: 'x-j', quality: 5 }), '!')
assert.equal(markOf({ testName: 'x', testId: 'x-j' }, { name: 'x', testId: 'x-j', outcome: 'failed' }), '✖')
assert.equal(tagsOf({ testName: 'x', testId: 'x-j', role: 'validates', stepCount: 48, quality: 66, aiAssertions: true, labels: ['smoke', 'nightly-regression', 'team-x'] }), 'validates · 48 steps · q66 · AI · smoke · regression')

assert.match(targetText(withTargets), /^Infer the target/)
const pinned: ImpactDetail = { ...withTargets, ui: { target: 'd2-d' } }
assert.match(targetText(pinned), /deployment "Prod" https:\/\/app\.example\.com \(deploymentId d2-d, environmentId e2-e\)/)
const test1 = detail.tests[0]!
assert.match(cloudPrompt('imp1-as', pinned, test1, WS), /^\/mabl:mabl-test-impact Run the mabl test "Checkout - Shipping address" \(t1-j\) in the cloud for test impact analysis imp1-as \(workspace ws1-w, application app1-a\)\. Target: deployment "Prod"/)
assert.match(cloudPrompt('imp1-as', pinned, test1, WS), /impactSessionId imp1-as/)
assert.match(debugPrompt('imp1-as', withTargets, test1, WS), /^\/mabl:mabl-debug Start a local debug session for the mabl test "Checkout - Shipping address" \(t1-j\)/)
assert.match(createPrompt('imp1-as', withTargets, 'Expiry date validation', WS), /^\/mabl:mabl-test-authoring Create one mabl test that covers this gap .*"Expiry date validation"\. Infer the mabl branch/)

type Node = { tag: string; props: Record<string, unknown>; children: unknown[] }
const nodes = (tree: unknown): Node[] => {
  if (!tree || typeof tree !== 'object') return []
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  const node = tree as Node
  return [node, ...(node.children ?? []).flatMap(nodes)]
}
const filled: string[] = []
const updates: unknown[] = []
let stored2: unknown = withTargets
const actions = {
  fillPrompt: (text: string) => filled.push(text),
  updateDetail: (_id: string, change: (detail: unknown) => unknown) => { stored2 = change(stored2); updates.push(stored2) },
}
const els = { Box: 'Box', Text: 'Text', Link: 'Link', Button: 'Button', Select: 'Select' } as never
const draw = (current: unknown) => nodes(impactFeature.render(els, { entity: stored, detail: current, entities: {}, rows: 60, columns: 120, settings, actions: actions as never }))
const press = (tree: Node[], key: string) => (tree.find(node => node.props.key === key)?.props.onPress as () => void)()

let tree = draw(withTargets)
press(tree, 'cloud-t1-j')
press(tree, 'debug-t1-j')
press(tree, 'create-0')
assert.equal(filled.length, 3)
assert.match(filled[0]!, /^\/mabl:mabl-test-impact Run the mabl test/)
assert.match(filled[1]!, /^\/mabl:mabl-debug/)
assert.match(filled[2]!, /^\/mabl:mabl-test-authoring/)
assert.ok(!tree.some(node => node.props.key === 'cloud-t2-j'), 'blast radius starts collapsed')
press(tree, 'group-blast_radius')
tree = draw(stored2)
assert.ok(tree.some(node => node.props.key === 'cloud-t2-j'), 'expanded after the toggle')
const opened: string[] = []
;(actions as Record<string, unknown>).openUrl = (url: string) => opened.push(url)
tree = draw(stored2)
press(tree, 'open-t1-j')
assert.deepEqual(opened, [testUrl('t1-j')])
assert.ok(!tree.some(node => node.tag === 'Link'), 'no inline links')
press(tree, 'more-t1-j')
tree = draw(stored2)
assert.ok(tree.some(node => node.tag === 'Text' && String(node.children).includes('Step 4 types a postal code')), 'evidence shows when expanded')
const select = tree.find(node => node.tag === 'Select')
;(select?.props.onSelect as (value: string) => void)('d2-d')
assert.equal((stored2 as ImpactDetail).ui?.target, 'd2-d')
const small = draw({ ...withTargets, tests: Array.from({ length: 40 }, (_, index) => ({ testName: `Test ${index}`, testId: `m${index}-j`, relation: 'direct' })) })
assert.ok(small.length > 0)
}

await main()
})
