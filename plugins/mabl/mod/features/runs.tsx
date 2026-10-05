import type {RenderElement} from 'claude-code';

import type {MablEntities, MablEntity} from '../types';
import type {Actions, Els, Feature, Ops, PollResult} from '../core/feature';
import {
  appBaseFromUrl,
  field,
  flag,
  hashOf,
  KIND_LABEL,
  list,
  mablCall,
  mcpServerFor,
  num,
  obj,
  parseJson,
  skillCommand,
  str,
  withWorkspace,
} from '../core/util';
import type {CallRecord, EntityUpdate, Fields} from '../core/util';

const DEPLOYMENT_POLL_MS = 30_000;
const PLAN_RUN_POLL_MS = 15_000;
const RUN_POLL_MS = 10_000;

const FINAL_STATES = new Set([
  'passed',
  'failed',
  'skipped',
  'stopped',
  'no plans matched',
  'completed',
  'succeeded',
  'terminated',
  'cancelled',
]);
const QUEUED_STATUSES = new Set([
  'queued',
  'pre_execution',
  'scheduling',
  'scheduled',
  'awaiting_precondition',
]);
const STOPPED_PLAN_STATUSES = new Set(['cancelled', 'terminated']);

export type Counts = {
  total: number;
  passed: number;
  failed: number;
  running: number;
  queued: number;
  skipped: number;
};

export type FailedRun = {
  testRunId: string;
  testName?: string;
  browser?: string;
  error?: string;
  appHref?: string;
};

export type PlanRunRow = {
  planRunId?: string;
  planId?: string;
  planName?: string;
  status?: string;
  statusCause?: string;
  isRetry: boolean;
  testRunCount?: number;
  failedTotal: number;
  failedTestRuns: FailedRun[];
};

export type DeploymentDetail = {
  kind: 'deployment';
  hash: string;
  terminal: boolean;
  pollMs?: number;
  name?: string;
  tests: {
    total: number;
    passed: number;
    failed: number;
    running: number;
    skipped: number;
    terminated: number;
  };
  finalFailed?: number;
  finalStopped?: number;
  planRuns: PlanRunRow[];
};

export type TestRunRow = {
  id: string;
  testId?: string;
  testName?: string;
  status?: string;
  error?: string;
  failingStep?: string;
};

export type PlanRunDetail = {
  kind: 'planRun';
  hash: string;
  status?: string;
  statusCause?: string;
  terminal: boolean;
  counts: Counts;
  testRuns: TestRunRow[];
};

export type RunDetail = {
  kind: 'run';
  hash: string;
  testName?: string;
  testId?: string;
  planRunId?: string;
  status?: string;
  terminal: boolean;
  success?: boolean;
  failingStep?: string;
  failureSummary?: string;
  appHref?: string;
  durationMs?: number;
};

export type RunsDetail = DeploymentDetail | PlanRunDetail | RunDetail;

const detailOf = <K extends RunsDetail['kind']>(
  kind: K,
  detail: unknown,
): Extract<RunsDetail, {kind: K}> | undefined =>
  obj(detail).kind === kind
    ? (obj(detail) as Extract<RunsDetail, {kind: K}>)
    : undefined;

const withHash = <T extends object>(detail: T): T & {hash: string} => ({
  ...detail,
  hash: hashOf(detail),
});

/** The state word of a status: `failed (2 of 40 tests)` is `failed`. */
export const stateOf = (status?: string): string | undefined =>
  status?.split(' (')[0];

export const isFinalStatus = (status?: string): boolean =>
  FINAL_STATES.has(stateOf(status) ?? '');

/** A raw test run status as the entity shows it. */
export const runState = (status?: string): string | undefined => {
  switch (status) {
    case undefined:
      return undefined;
    case 'completed':
      return 'passed';
    case 'failed':
    case 'terminated':
      return 'failed';
    case 'skipped':
      return 'skipped';
    default:
      return QUEUED_STATUSES.has(status) ? 'queued' : 'running';
  }
};

export const tally = (rows: readonly Pick<TestRunRow, 'status'>[]): Counts => {
  const counts: Counts = {
    total: rows.length,
    passed: 0,
    failed: 0,
    running: 0,
    queued: 0,
    skipped: 0,
  };
  for (const row of rows) {
    const state = runState(row.status) ?? 'running';
    counts[state as keyof Omit<Counts, 'total'>] += 1;
  }

  return counts;
};

const progress = (state: string, done: number, total: number): string =>
  total > 0 ? `${state} (${done} of ${total} tests done)` : state;

const verdict = (state: string, failed: number, total: number): string => {
  if (total === 0) {
    return state;
  }

  return state === 'failed'
    ? `failed (${failed} of ${total} tests)`
    : `${state} (${total} tests)`;
};

export const deploymentStatus = (detail: DeploymentDetail): string => {
  const {tests} = detail;
  if (!detail.terminal) {
    return progress(
      'running',
      tests.passed + tests.failed + tests.skipped + tests.terminated,
      tests.total,
    );
  }
  const failed = detail.finalFailed ?? tests.failed + tests.terminated;
  const state =
    failed > 0
      ? 'failed'
      : (detail.finalStopped ?? 0) > 0
        ? 'stopped'
        : 'passed';

  return verdict(state, tests.failed + tests.terminated, tests.total);
};

export const planRunStatus = (detail: PlanRunDetail): string => {
  const {counts} = detail;
  if (!detail.terminal) {
    return progress(
      QUEUED_STATUSES.has(detail.status ?? '') ? 'queued' : 'running',
      counts.passed + counts.failed + counts.skipped,
      counts.total,
    );
  }
  const state =
    counts.failed > 0 || detail.status === 'failed'
      ? 'failed'
      : STOPPED_PLAN_STATUSES.has(detail.status ?? '')
        ? 'stopped'
        : 'passed';

  return verdict(state, counts.failed, counts.total);
};

/** A raw plan run status as a state word, without the test counts. */
export const planState = (status?: string): string => {
  switch (status) {
    case 'succeeded':
    case 'completed':
      return 'passed';
    case 'failed':
      return 'failed';
    default:
      return STOPPED_PLAN_STATUSES.has(status ?? '')
        ? 'stopped'
        : QUEUED_STATUSES.has(status ?? '')
          ? 'queued'
          : 'running';
  }
};

export const runStatus = (detail: RunDetail): string | undefined =>
  detail.terminal
    ? detail.success
      ? 'passed'
      : detail.status === 'skipped'
        ? 'skipped'
        : 'failed'
    : runState(detail.status);

const failedRun = (raw: Fields): FailedRun[] => {
  const testRunId = str(raw.testRunId);

  return testRunId
    ? [
        {
          testRunId,
          testName: str(raw.testName),
          browser: str(raw.browser),
          error: str(raw.failureError),
          appHref: str(raw.appHref),
        },
      ]
    : [];
};

const planRunRow = (raw: Fields): PlanRunRow => {
  const failedTestRuns = list(raw.failedTestRuns).flatMap(failedRun);

  return {
    planRunId: str(raw.planRunId),
    planId: str(raw.planId),
    planName: str(raw.planName),
    status: str(raw.status),
    statusCause: str(raw.statusCause),
    isRetry: raw.isRetry === true,
    testRunCount: num(raw.testRunCount),
    failedTotal: num(raw.failedTestRunsTotal) ?? failedTestRuns.length,
    failedTestRuns,
  };
};

/** Reads `get_mabl_deployment_status` structured content. */
export const deploymentDetail = (structured: unknown): DeploymentDetail => {
  const data = obj(structured);
  const deployment = obj(data.deployment);
  const tests = obj(deployment.testMetrics);
  const final = obj(deployment.finalPlanMetrics);
  const count = (key: string): number => num(tests[key]) ?? 0;

  return withHash({
    kind: 'deployment' as const,
    terminal: data.terminal === true,
    pollMs: num(data.suggestedPollIntervalMs),
    name:
      [str(deployment.applicationName), str(deployment.environmentName)]
        .filter(Boolean)
        .join(' · ') || undefined,
    tests: {
      total: count('total'),
      passed: count('passed'),
      failed: count('failed'),
      running: count('running'),
      skipped: count('skipped'),
      terminated: count('terminated'),
    },
    finalFailed: num(final.failed),
    finalStopped: num(final.stopped),
    planRuns: list(deployment.planRuns).map(planRunRow),
  });
};

/** Reads `get_mabl_plan_run` structured content. */
export const planRunDetail = (structured: unknown): PlanRunDetail => {
  const data = obj(structured);
  const planRun = obj(data.planRun);
  const testRuns = list(data.testRuns).flatMap((raw): TestRunRow[] => {
    const id = str(raw.id);
    const failure = obj(raw.failureSummary);
    const step = str(failure.stepDisplayNumber);

    return id
      ? [
          {
            id,
            testId: str(raw.testId),
            testName: str(raw.testName),
            status: str(raw.status),
            error: str(failure.error),
            failingStep:
              step && [str(failure.flowName), step].filter(Boolean).join(' '),
          },
        ]
      : [];
  });

  return withHash({
    kind: 'planRun' as const,
    status: str(planRun.status),
    statusCause: str(planRun.statusCause),
    terminal: planRun.terminal === true,
    counts: tally(testRuns),
    testRuns,
  });
};

/** Reads `get_mabl_test_run` structured content. */
export const runDetail = (structured: unknown): RunDetail => {
  const data = obj(structured);

  return withHash({
    kind: 'run' as const,
    testName: str(data.testName),
    testId: str(data.testId),
    planRunId: str(data.planRunId),
    status: str(data.status),
    terminal: data.terminal === true,
    success: typeof data.success === 'boolean' ? data.success : undefined,
    failingStep: str(data.failingStep),
    failureSummary: str(data.failureSummary),
    appHref: str(data.appHref),
    durationMs: num(data.durationMs),
  });
};

const appBaseOrDefault = (url: string | undefined): string =>
  appBaseFromUrl(url) ?? 'https://app.mabl.com';

const planRunUrl = (
  base: string,
  workspaceId: string | undefined,
  id: string,
): string | undefined =>
  workspaceId
    ? `${base}/workspaces/${workspaceId}/output/plan-runs/${id}`
    : undefined;

const testRunUrl = (
  base: string,
  workspaceId: string | undefined,
  id: string,
): string | undefined =>
  workspaceId
    ? `${base}/workspaces/${workspaceId}/test/journey-runs/${id}`
    : undefined;

type Origin = Pick<
  MablEntity,
  'mcpServer' | 'cli' | 'workspaceId' | 'impactSessionId'
>;

const testRunsOf = (
  data: Fields,
  origin: Origin,
  parentId?: string,
): EntityUpdate[] =>
  list(data.testRuns).flatMap((run) => {
    const id = str(run.testRunId) ?? str(run.id);

    return id
      ? [
          {
            kind: 'run' as const,
            id,
            testId: str(run.testId),
            url: str(run.outputUrl),
            status: 'started',
            parentId,
            ...origin,
          },
        ]
      : [];
  });

const fromMcp = (
  name: string,
  server: string,
  call: CallRecord,
): EntityUpdate[] => {
  const {args, text} = call;
  const data = obj(call.structured ?? parseJson(text));
  const origin: Origin = {
    mcpServer: server,
    workspaceId: str(data.workspaceId) ?? str(args.workspaceId),
    impactSessionId: str(args.impactSessionId),
  };

  switch (name) {
    case 'trigger_mabl_deployment': {
      const id = field(data, text, 'deploymentId');
      if (!id) {
        return [];
      }
      const base = appBaseOrDefault(str(data.deploymentUrl));
      const url =
        field(data, text, 'deploymentUrl') ??
        (origin.workspaceId
          ? `${base}/workspaces/${origin.workspaceId}/output/deployments/${id}`
          : undefined);
      const planRuns = list(data.triggeredPlanRuns).flatMap((planRun) => {
        const planRunId = str(planRun.planRunId);

        return planRunId
          ? [
              {
                kind: 'planRun' as const,
                id: planRunId,
                url: planRunUrl(base, origin.workspaceId, planRunId),
                status: 'started',
                parentId: id,
                ...origin,
              },
            ]
          : [];
      });
      const status =
        list(data.triggeredPlanRuns).length === 0 &&
        data.noMatchingPlans !== undefined
          ? 'no plans matched'
          : 'started';

      return [{kind: 'deployment', id, url, status, ...origin}, ...planRuns];
    }
    case 'run_mabl_plan':
    case 'rerun_mabl_plan':
    case 'run_mabl_test_batch_cloud': {
      const planRunId = field(data, text, 'planRunId');
      const runs = testRunsOf(data, origin, planRunId);
      if (!planRunId) {
        return runs;
      }
      const testCount = Array.isArray(args.testIds)
        ? args.testIds.length
        : undefined;
      const planName =
        str(args.planName) ??
        (name === 'run_mabl_test_batch_cloud' && testCount
          ? `batch of ${testCount} tests`
          : undefined);

      return [
        {
          kind: 'planRun',
          id: planRunId,
          name: planName,
          url: field(data, text, 'outputUrl'),
          status: 'started',
          ...origin,
        },
        ...runs,
      ];
    }
    case 'run_mabl_test_cloud': {
      const branch = str(obj(data.resolvedBinding).branch) ?? str(args.branch);

      return testRunsOf(data, origin).map((run) => ({
        ...run,
        testId: str(args.testId),
        branch,
      }));
    }
    case 'rerun_mabl_test':
      return testRunsOf(data, origin);
    default:
      return [];
  }
};

const DEPLOYMENT_URL =
  /https:\/\/[^\s"']+?\/workspaces\/([^/\s"']+)\/output\/deployments\/([\w-]+)/;

const fromCli = (cli: string, sub: string, text: string): EntityUpdate[] => {
  if (/^tests\s+run-cloud\b/.test(sub)) {
    const branch = flag(sub, 'mabl-branch');
    const tests = [
      ...text.matchAll(/Running test: (.+?) - (\S+) - on branch - (\S+)/g),
    ];
    const updates: EntityUpdate[] = tests.flatMap(
      ([, name, testId, onBranch]) =>
        testId
          ? [{kind: 'test' as const, id: testId, name, branch: onBranch}]
          : [],
    );
    for (const [match, workspaceId, id] of text.matchAll(
      /(?:https:\/\/[^\s"']+?\/workspaces\/([^/\s"']+)\/[^\s"']*?)?journey-runs\/([\w-]+)/g,
    )) {
      if (id) {
        updates.push({
          kind: 'run',
          id,
          branch,
          status: 'started',
          testId: tests[0]?.[2],
          url: match.startsWith('https://') ? match : undefined,
          workspaceId: workspaceId ?? flag(sub, 'workspace-id'),
          cli,
        });
      }
    }

    return updates;
  }
  if (/^deployments\s+create\b/.test(sub)) {
    const [url, workspaceId, fromUrl] = text.match(DEPLOYMENT_URL) ?? [];
    const id = fromUrl ?? field({}, text, 'id');

    return id
      ? [
          {
            kind: 'deployment',
            id,
            url,
            workspaceId: workspaceId ?? flag(sub, 'workspace-id'),
            status: 'started',
            cli,
            impactSessionId: flag(sub, 'impact-session-id'),
          },
        ]
      : [];
  }

  return [];
};

export const captureRuns = (call: CallRecord): EntityUpdate[] => {
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

const childOrigin = (entity: MablEntity): Origin & {parentId: string} => ({
  parentId: entity.id,
  mcpServer: entity.mcpServer,
  cli: entity.cli,
  workspaceId: entity.workspaceId,
  impactSessionId: entity.impactSessionId,
});

const pollDeployment = async (
  ops: Ops,
  entity: MablEntity,
  workspaceId: string,
  before?: DeploymentDetail,
): Promise<PollResult> => {
  const result = await ops.callTool(
    mcpServerFor(entity),
    'get_mabl_deployment_status',
    {workspaceId, deploymentId: entity.id},
  );
  if (result.isError || str(obj(result.structured).status) === 'not_found') {
    return {updates: []};
  }
  const detail = deploymentDetail(result.structured);
  const status = deploymentStatus(detail);
  const updates: EntityUpdate[] =
    status !== entity.status || (detail.name && detail.name !== entity.name)
      ? [{kind: 'deployment', id: entity.id, status, name: detail.name}]
      : [];
  const known = new Set(before?.planRuns.map((planRun) => planRun.planRunId));
  const base = appBaseOrDefault(entity.url);
  for (const planRun of detail.planRuns) {
    if (
      planRun.planRunId &&
      !planRun.isRetry &&
      !known.has(planRun.planRunId)
    ) {
      updates.push({
        kind: 'planRun',
        id: planRun.planRunId,
        name: planRun.planName,
        url: planRunUrl(base, workspaceId, planRun.planRunId),
        ...childOrigin(entity),
      });
    }
  }

  return {updates, ...(detail.hash === before?.hash ? {} : {detail})};
};

const pollPlanRun = async (
  ops: Ops,
  entity: MablEntity,
  workspaceId: string,
  before?: PlanRunDetail,
): Promise<PollResult> => {
  const result = await ops.callTool(mcpServerFor(entity), 'get_mabl_plan_run', {
    planRunId: entity.id,
    workspaceId,
  });
  if (result.isError) {
    return {updates: []};
  }
  const detail = planRunDetail(result.structured);
  const status = planRunStatus(detail);
  const updates: EntityUpdate[] =
    status !== entity.status ? [{kind: 'planRun', id: entity.id, status}] : [];
  const previous = new Map(before?.testRuns.map((run) => [run.id, run]));
  const base = appBaseOrDefault(entity.url);
  for (const run of detail.testRuns) {
    const old = previous.get(run.id);
    if (!old || old.status !== run.status || old.testName !== run.testName) {
      updates.push({
        kind: 'run',
        id: run.id,
        name: run.testName,
        testId: run.testId,
        status: runState(run.status),
        url: testRunUrl(base, workspaceId, run.id),
        ...childOrigin(entity),
      });
    }
  }

  return {updates, ...(detail.hash === before?.hash ? {} : {detail})};
};

const pollRun = async (
  ops: Ops,
  entity: MablEntity,
  workspaceId: string,
  before?: RunDetail,
): Promise<PollResult> => {
  const result = await ops.callTool(mcpServerFor(entity), 'get_mabl_test_run', {
    testRunId: entity.id,
    workspaceId,
  });
  if (result.isError) {
    return {updates: []};
  }
  const detail = runDetail(result.structured);
  const status = runStatus(detail);
  const isChanged =
    status !== entity.status ||
    (detail.testName && detail.testName !== entity.name) ||
    (detail.testId && detail.testId !== entity.testId);
  const updates: EntityUpdate[] = isChanged
    ? [
        {
          kind: 'run',
          id: entity.id,
          status,
          name: detail.testName,
          testId: detail.testId,
          url: entity.url ? undefined : detail.appHref,
        },
      ]
    : [];

  return {updates, ...(detail.hash === before?.hash ? {} : {detail})};
};

export const pollRuns = async (
  ops: Ops,
  entity: MablEntity,
  detail: unknown,
): Promise<PollResult> => {
  const {workspaceId} = entity;
  if (!workspaceId) {
    return {updates: []};
  }
  switch (entity.kind) {
    case 'deployment':
      return pollDeployment(
        ops,
        entity,
        workspaceId,
        detailOf('deployment', detail),
      );
    case 'planRun':
      return pollPlanRun(ops, entity, workspaceId, detailOf('planRun', detail));
    case 'run':
      return pollRun(ops, entity, workspaceId, detailOf('run', detail));
    default:
      return {updates: []};
  }
};

/** A plan run's test runs are polled by the plan run; one is fetched itself only once it fails, for its failing step. */
export const runsPollMs = (
  entity: MablEntity,
  detail: unknown,
): number | undefined => {
  if (!entity.workspaceId) {
    return undefined;
  }
  switch (entity.kind) {
    case 'deployment':
      return isFinalStatus(entity.status)
        ? undefined
        : (detailOf('deployment', detail)?.pollMs ?? DEPLOYMENT_POLL_MS);
    case 'planRun':
      return isFinalStatus(entity.status) ? undefined : PLAN_RUN_POLL_MS;
    case 'run':
      if (
        detailOf('run', detail)?.terminal ||
        (entity.parentId && stateOf(entity.status) !== 'failed')
      ) {
        return undefined;
      }

      return RUN_POLL_MS;
    default:
      return undefined;
  }
};

export const formatDuration = (ms?: number): string | undefined => {
  if (ms === undefined) {
    return undefined;
  }
  const seconds = Math.round(ms / 1000);

  return seconds >= 60
    ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    : `${seconds}s`;
};

export const markOf = (status?: string): string => {
  switch (stateOf(status)) {
    case 'passed':
      return '✔';
    case 'failed':
      return '✖';
    case 'skipped':
      return '↷';
    case 'stopped':
      return '■';
    default:
      return '…';
  }
};

const STATE_ORDER = ['failed', 'running', 'queued', 'skipped', 'passed'];

/** Failures first, then what is still going, then the rest. */
export const sortRows = (rows: readonly TestRunRow[]): TestRunRow[] =>
  [...rows].sort(
    (a, b) =>
      STATE_ORDER.indexOf(runState(a.status) ?? 'running') -
      STATE_ORDER.indexOf(runState(b.status) ?? 'running'),
  );

/** Keeps `budget` elements; past that, the first `budget - 1` and a "… N more" line. */
export const clipTo = <T,>(
  items: readonly T[],
  budget: number,
  more: (hidden: number) => T,
): T[] => {
  if (items.length <= budget) {
    return [...items];
  }
  const room = Math.max(0, budget - 1);

  return [...items.slice(0, room), more(items.length - room)];
};

const failureButtons = (
  {Button}: Els,
  actions: Actions,
  entity: MablEntity,
  testRunId: string,
): RenderElement[] => {
  const server = mcpServerFor(entity);
  const {workspaceId} = entity;

  return [
    <Button
      key={`debug-${testRunId}`}
      label="Debug"
      onPress={() =>
        actions.fillPrompt(`${skillCommand('mabl-debug')} ${testRunId}`)
      }
    />,
    ...(workspaceId
      ? [
          <Button
            key={`rerun-${testRunId}`}
            label="Rerun"
            onPress={() =>
              void actions
                .callTool(server, 'rerun_mabl_test', {testRunId, workspaceId})
                .catch(() => undefined)
            }
          />,
        ]
      : []),
  ];
};

type FailureLine = {testRunId: string; text: string; href?: string};

const openButton = (
  {Button}: Els,
  actions: Actions,
  key: string,
  href: string | undefined,
  label = 'Open',
): RenderElement | undefined =>
  href ? (
    <Button key={key} label={label} onPress={() => actions.openUrl(href)} />
  ) : undefined;

const failureLine = (
  els: Els,
  actions: Actions,
  entity: MablEntity,
  failure: FailureLine,
): RenderElement => {
  const {Box, Text} = els;

  return (
    <Box gap={1}>
      <Text wrap="truncate-end">{failure.text}</Text>
      {openButton(els, actions, `open-${failure.testRunId}`, failure.href)}
      {failureButtons(els, actions, entity, failure.testRunId)}
    </Box>
  );
};

/** Test runs tracked under a plan run, failures first; the plan run's own poll keeps their status current. */
export const childRuns = (
  planRunId: string | undefined,
  entities: MablEntities,
): MablEntity[] =>
  planRunId
    ? Object.values(entities)
        .filter((child) => child.kind === 'run' && child.parentId === planRunId)
        .sort(
          (a, b) =>
            STATE_ORDER.indexOf(stateOf(a.status) ?? 'running') -
            STATE_ORDER.indexOf(stateOf(b.status) ?? 'running'),
        )
    : [];

const renderDeployment = (
  els: Els,
  entity: MablEntity,
  detail: DeploymentDetail | undefined,
  entities: MablEntities,
  rows: number,
  actions: Actions,
): RenderElement => {
  const {Box, Text} = els;
  const tests = detail?.tests;
  const lines: RenderElement[] = (detail?.planRuns ?? []).flatMap((planRun) => {
    const counts = [
      planRun.testRunCount !== undefined && `${planRun.testRunCount} tests`,
      `${planRun.failedTotal} failed`,
    ]
      .filter(Boolean)
      .join(', ');
    const head = (
      <Text wrap="truncate-end">
        {markOf(planState(planRun.status))}{' '}
        {planRun.planName ?? planRun.planId ?? planRun.planRunId ?? 'plan'} (
        {counts}){planRun.status ? ` · ${planRun.status}` : ''}
        {planRun.isRetry ? ' · retry' : ''}
      </Text>
    );
    const children = childRuns(planRun.planRunId, entities);
    if (children.length > 0) {
      const errors = new Map(
        planRun.failedTestRuns.map((run) => [run.testRunId, run.error]),
      );

      return [
        head,
        ...children.map((child) => {
          const state = stateOf(child.status);
          const name = child.name ?? child.testId ?? child.id;
          if (state === 'failed') {
            return failureLine(els, actions, entity, {
              testRunId: child.id,
              text: `   ${markOf(state)} ${name} · ${errors.get(child.id) ?? 'failed'}`,
              href: child.url,
            });
          }

          return (
            <Box gap={1}>
              <Text wrap="truncate-end">{`   ${markOf(state)} ${name} · ${state ?? 'queued'}`}</Text>
              {openButton(els, actions, `open-${child.id}`, child.url)}
            </Box>
          );
        }),
      ];
    }
    const failures = planRun.failedTestRuns.map((run) =>
      failureLine(els, actions, entity, {
        testRunId: run.testRunId,
        text: `   ✖ ${run.testName ?? run.testRunId} · ${run.error ?? 'failed'}`,
        href: run.appHref,
      }),
    );
    const hidden = planRun.failedTotal - planRun.failedTestRuns.length;

    return [
      head,
      ...failures,
      ...(hidden > 0
        ? [<Text dimColor>{`   … ${hidden} more failed`}</Text>]
        : []),
    ];
  });

  return (
    <Box flexDirection="column">
      <Text bold wrap="truncate-end">
        Deployment · {stateOf(entity.status) ?? 'started'}
        {tests
          ? ` · ${tests.passed}/${tests.total} tests passed (${tests.failed} failed, ${tests.running} running, ${tests.skipped} skipped)`
          : ''}
      </Text>
      {openButton(els, actions, 'open-deployment', entity.url, 'Open in mabl')}
      {!entity.workspaceId && (
        <Text dimColor>
          No workspace id, so this deployment cannot be checked.
        </Text>
      )}
      {entity.workspaceId && !detail && !isFinalStatus(entity.status) && (
        <Text dimColor>Waiting for the first status…</Text>
      )}
      {clipTo(lines, Math.max(3, rows - 3), (hidden) => (
        <Text dimColor>{`… ${hidden} more`}</Text>
      ))}
    </Box>
  );
};

const renderPlanRun = (
  els: Els,
  entity: MablEntity,
  detail: PlanRunDetail | undefined,
  rows: number,
  actions: Actions,
): RenderElement => {
  const {Box, Text} = els;
  const counts = detail?.counts;
  const base = appBaseOrDefault(entity.url);
  const lines = sortRows(detail?.testRuns ?? []).map((run) => {
    const state = runState(run.status);
    const name = run.testName ?? run.id;
    if (state === 'failed') {
      const why =
        [run.failingStep, run.error].filter(Boolean).join(': ') || 'failed';

      return failureLine(els, actions, entity, {
        testRunId: run.id,
        text: `${markOf(state)} ${name} · ${why}`,
        href: testRunUrl(base, entity.workspaceId, run.id),
      });
    }

    return (
      <Box gap={1}>
        <Text wrap="truncate-end">{`${markOf(state)} ${name}${state ? ` · ${state}` : ''}`}</Text>
        {openButton(
          els,
          actions,
          `open-${run.id}`,
          testRunUrl(base, entity.workspaceId, run.id),
        )}
      </Box>
    );
  });

  return (
    <Box flexDirection="column">
      <Text bold wrap="truncate-end">
        {entity.name ?? 'Plan run'} · {stateOf(entity.status) ?? 'started'}
        {counts
          ? ` · ${counts.passed} passed, ${counts.failed} failed, ${counts.running} running, ${counts.queued} queued, ${counts.skipped} skipped`
          : ''}
      </Text>
      {openButton(els, actions, 'open-plan-run', entity.url, 'Open in mabl')}
      {detail?.statusCause && (
        <Text dimColor wrap="truncate-end">
          {detail.statusCause}
        </Text>
      )}
      {!entity.workspaceId && (
        <Text dimColor>
          No workspace id, so this plan run cannot be checked.
        </Text>
      )}
      {entity.workspaceId && !detail && !isFinalStatus(entity.status) && (
        <Text dimColor>Waiting for the first status…</Text>
      )}
      {clipTo(lines, Math.max(3, rows - 4), (hidden) => (
        <Text dimColor>{`… ${hidden} more`}</Text>
      ))}
    </Box>
  );
};

const renderRun = (
  els: Els,
  entity: MablEntity,
  detail: RunDetail | undefined,
  actions: Actions,
): RenderElement => {
  const {Box, Text} = els;
  const duration = formatDuration(detail?.durationMs);
  const href = entity.url ?? detail?.appHref;
  const isFailed = stateOf(entity.status) === 'failed';

  return (
    <Box flexDirection="column">
      <Text bold wrap="truncate-end">
        {entity.name ?? entity.testId ?? entity.id} ·{' '}
        {stateOf(entity.status) ?? 'started'}
        {duration ? ` · ${duration}` : ''}
      </Text>
      {openButton(els, actions, 'open-run', href, 'Open in mabl')}
      {entity.parentId && <Text dimColor>Part of {entity.parentId}</Text>}
      {!entity.workspaceId && (
        <Text dimColor>No workspace id, so this run cannot be checked.</Text>
      )}
      {entity.workspaceId &&
        !detail &&
        !isFinalStatus(entity.status) &&
        !entity.parentId && <Text dimColor>Waiting for the first status…</Text>}
      {isFailed && detail?.failingStep && (
        <Text>Failing step: {detail.failingStep}</Text>
      )}
      {isFailed && detail?.failureSummary && (
        <Text>{detail.failureSummary}</Text>
      )}
      {isFailed && (
        <Box gap={1}>{failureButtons(els, actions, entity, entity.id)}</Box>
      )}
    </Box>
  );
};

export const runsFeature: Feature = {
  kinds: ['run', 'planRun', 'deployment'],
  tabKinds: ['run', 'planRun', 'deployment'],
  capture: captureRuns,
  pollMs: runsPollMs,
  poll: pollRuns,
  isFinished: (entity) => isFinalStatus(entity.status),
  announces: (before, after) =>
    !after.parentId &&
    isFinalStatus(after.status) &&
    stateOf(after.status) !== stateOf(before?.status)
      ? `mabl ${KIND_LABEL[after.kind].toLowerCase()} ${after.name ?? after.id}: ${after.status}`
      : undefined,
  tabTitle: (entity) => {
    switch (entity.kind) {
      case 'deployment':
        return `Deploy ${entity.name ?? entity.id.slice(0, 8)}`;
      case 'planRun':
        return `Plan run ${entity.name ?? entity.id}`;
      default:
        return `Run ${entity.name ?? entity.testId ?? entity.id}`;
    }
  },
  render: (els, {entity, detail, entities, rows, actions}) => {
    switch (entity.kind) {
      case 'deployment':
        return renderDeployment(
          els,
          entity,
          detailOf('deployment', detail),
          entities,
          rows,
          actions,
        );
      case 'planRun':
        return renderPlanRun(
          els,
          entity,
          detailOf('planRun', detail),
          rows,
          actions,
        );
      default:
        return renderRun(els, entity, detailOf('run', detail), actions);
    }
  },
};
