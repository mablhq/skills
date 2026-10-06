import {test} from 'claude-code/testing';

import {assert, stubJsx} from './assert';

import type {MablEntity} from '../types';
import type {Ops} from '../core/feature';
import type {CallRecord} from '../core/util';
import {
  captureDebugger,
  debugLines,
  debuggerFeature,
  parseSteps,
  pollDebugger,
  sessionFacts,
  statusText,
  windowLines,
  type DebugDetail,
} from '../features/debugger';

test('debugger', async () => {
  stubJsx();
  const bash = (command: string, text: string): CallRecord => ({
    tool: 'Bash',
    args: {command},
    text,
  });

  const [started] = captureDebugger(
    bash(
      'npx -y @mablhq/mabl-cli@2.136.25 agent debug session start abc-j --headless 2>&1',
      'Warning: something\n{"sessionId":"mabl-debug-1","testId":"abc-j","browser":"chromium","stepCount":12}\n',
    ),
  );
  assert.deepEqual(started, {
    kind: 'debug',
    id: 'mabl-debug-1',
    testId: 'abc-j',
    name: 'abc-j',
    status: 'started',
    cli: 'npx -y @mablhq/mabl-cli@2.136.25',
  });
  assert.deepEqual(
    captureDebugger(bash('mabl agent debug session start abc-j &', '')),
    [],
  );

  assert.equal(
    captureDebugger(
      bash(
        'mabl agent debug session run-step mabl-debug-1 3.2',
        '{"status":"failed","stepId":"s","durationMs":5,"error":"boom","currentStepIndex":4,"remainingSteps":8}',
      ),
    )[0]?.status,
    'step 3.2 failed',
  );
  assert.equal(
    captureDebugger(
      bash(
        'mabl agent debug session run-step "mabl-debug-1"',
        '{"status":"passed"}',
      ),
    )[0]?.status,
    'step passed',
  );
  assert.equal(
    captureDebugger(
      bash(
        'mabl agent debug session set-current-step mabl-debug-1 4.1',
        '{"stepId":"s","position":"4.1"}',
      ),
    )[0]?.status,
    'at 4.1',
  );
  assert.equal(
    captureDebugger(
      bash(
        'mabl agent debug session run-all mabl-debug-1',
        '[1/3] PASS  Click  "a"  5ms\n[2/3] FAIL  Click  "b"  9ms  boom\n',
      ),
    )[0]?.status,
    'run: 1 passed, then a failure',
  );
  assert.deepEqual(
    captureDebugger(
      bash(
        'mabl agent debug session stop "$SID"',
        '{"stopped":true,"sessionId":"mabl-debug-1"}',
      ),
    ),
    [{kind: 'debug', id: 'mabl-debug-1', status: 'stopped', cli: 'mabl'}],
  );
  assert.deepEqual(
    captureDebugger(
      bash('mabl agent debug session run-step "$SID"', '{"status":"passed"}'),
    ),
    [],
  );
  assert.deepEqual(captureDebugger(bash('mabl tests run --id abc-j', '')), []);
  assert.deepEqual(
    captureDebugger(
      bash('mabl agent debug session start abc-j', '{"sessionId":"../../etc"}'),
    ),
    [],
  );
  assert.deepEqual(
    captureDebugger(
      bash('mabl agent debug session stop ../x', '{"sessionId":"-o"}'),
    ),
    [],
  );
  assert.equal(
    captureDebugger(
      bash(
        'npx -y @mablhq/mabl-cli@1.2.3 agent debug session stop mabl-debug-1',
        '{}',
      ),
    )[0]?.cli,
    'npx -y @mablhq/mabl-cli@1.2.3',
  );
  assert.deepEqual(
    captureDebugger(
      bash(
        'npx -y @mablhq/mabl-cli@file:../x agent debug session stop mabl-debug-1',
        '{}',
      ),
    ),
    [],
  );

  const LISTED = JSON.stringify([
    {
      index: 0,
      id: 'a',
      type: 'VisitUrl',
      description: 'Visit',
      status: 'passed',
      position: '1',
      isCursor: false,
    },
    {
      index: 1,
      id: 'b',
      type: 'EvaluateFlow',
      description: 'Log in',
      status: 'passed',
      position: '2',
      isCursor: false,
    },
    {
      index: 2,
      id: 'b1',
      type: 'EnterText',
      description: 'Email',
      status: 'failed',
      position: '2.1',
      isCursor: false,
      parentStepId: 'b',
    },
    {
      index: 3,
      id: 'b2',
      type: 'Click',
      description: 'Submit',
      status: 'skipped',
      position: '2.2',
      isCursor: false,
      parentStepId: 'b',
    },
    {
      index: 4,
      id: 'c',
      type: 'Click',
      description: 'Buy',
      status: 'current',
      position: '3',
      isCursor: true,
    },
    {
      index: 5,
      id: 'd',
      type: 'Assert',
      description: 'Done',
      status: 'pending',
      position: '4',
      isCursor: false,
    },
  ]);
  const steps = parseSteps(LISTED);
  assert.deepEqual(
    steps.map((step) => [step.position, step.depth]),
    [
      ['1', 0],
      ['2', 0],
      ['2.1', 1],
      ['2.2', 1],
      ['3', 0],
      ['4', 0],
    ],
  );
  assert.deepEqual(
    parseSteps(
      JSON.stringify([{id: 'p'}, {id: 'q', position: 'x', parentStepId: 'p'}]),
    ).map((step) => step.depth),
    [0, 1],
  );
  assert.deepEqual(parseSteps('not json'), []);
  assert.equal(
    statusText(steps),
    'at 3 · 2/6 passed · 1 skipped · failed at 2.1',
  );

  const facts = sessionFacts(
    JSON.stringify({
      snapshot: {test: {name: 'Checkout'}},
      stepResults: [
        {
          stepId: 'b1',
          status: 'failed',
          error: 'Timeout 30000ms exceeded.\n  at frame',
        },
        {stepId: 'a', status: 'failed', error: 'old'},
        {stepId: 'a', status: 'passed'},
      ],
    }),
  );
  assert.deepEqual(facts, {
    name: 'Checkout',
    errors: {b1: 'Timeout 30000ms exceeded.'},
  });
  assert.deepEqual(sessionFacts(''), {errors: {}});

  const withError = steps.map((step) =>
    step.id === 'b1' ? {...step, error: 'boom'} : step,
  );
  const {lines, focus} = debugLines(withError);
  assert.deepEqual(
    lines.map((line) => `${'  '.repeat(line.depth)}${line.text}`),
    [
      '✔ 1  Visit',
      '✔ 2  Log in',
      '  ✖ 2.1  Email',
      '      boom',
      '  ↷ 2.2  Submit',
      '▶ 3  Buy',
      '· 4  Done',
    ],
  );
  assert.equal(focus, 5);

  const many = Array.from({length: 20}, (_, index) => ({
    depth: 0,
    text: `line ${index}`,
  }));
  assert.deepEqual(
    windowLines(many, 10, 6).map((line) => line.text),
    ['… 7 more', 'line 7', 'line 8', 'line 9', 'line 10', '… 9 more'],
  );
  assert.deepEqual(
    windowLines(many, 1, 5).map((line) => line.text),
    ['line 0', 'line 1', 'line 2', 'line 3', '… 16 more'],
  );
  assert.deepEqual(
    windowLines(many, 19, 5).map((line) => line.text),
    ['… 16 more', 'line 16', 'line 17', 'line 18', 'line 19'],
  );
  assert.equal(windowLines(many, 3, 30).length, 20);
  for (const budget of [3, 4, 7, 19]) {
    for (const at of [0, 5, 18, 19]) {
      assert.equal(windowLines(many, at, budget).length, budget);
    }
  }

  const entity: MablEntity = {
    kind: 'debug',
    id: 'mabl-debug-1',
    cli: 'npx -y @mablhq/mabl-cli@2.136.25',
    status: 'started',
    updatedAt: 0,
  };
  const fakeOps = (mtime: number | undefined, calls: string[][]): Ops => ({
    callTool: async () => assert.fail('no MCP calls'),
    run: async (argv) => {
      calls.push([...argv]);

      return {exitCode: 0, stdout: LISTED, stderr: ''};
    },
    read: async () =>
      JSON.stringify({
        snapshot: {test: {name: 'Checkout'}},
        stepResults: [{stepId: 'b1', error: 'boom'}],
      }),
    mtime: async (path) => {
      assert.equal(path, '/home/me/.mabl/debug/mabl-debug-1/session.json');

      return mtime;
    },
    home: '/home/me',
    serverFor: (entity: {mcpServer?: string}) => entity.mcpServer ?? 'mabl',
    now: async () => 0,
  });

  await (async () => {
    const gone: string[][] = [];
    assert.deepEqual(
      await pollDebugger(fakeOps(undefined, gone), entity, undefined),
      {updates: [{kind: 'debug', id: 'mabl-debug-1', status: 'stopped'}]},
    );
    assert.equal(gone.length, 0);

    const same: string[][] = [];
    assert.deepEqual(
      await pollDebugger(fakeOps(42, same), entity, {mtime: 42, steps: []}),
      {updates: []},
    );
    assert.equal(same.length, 0);

    const changed: string[][] = [];
    const result = await pollDebugger(fakeOps(43, changed), entity, {
      mtime: 42,
      steps: [],
    });
    assert.deepEqual(changed[0], [
      'npx',
      '-y',
      '@mablhq/mabl-cli@2.136.25',
      'agent',
      'debug',
      'session',
      'list-steps',
      'mabl-debug-1',
      '-o',
      'json',
    ]);
    const detail = result.detail as DebugDetail;
    assert.equal(detail.mtime, 43);
    assert.equal(detail.cursorIndex, 4);
    assert.equal(detail.steps.find((step) => step.id === 'b1')?.error, 'boom');
    assert.deepEqual(result.updates, [
      {
        kind: 'debug',
        id: 'mabl-debug-1',
        name: 'Checkout',
        status: 'at 3 · 2/6 passed · 1 skipped · failed at 2.1',
      },
    ]);

    assert.deepEqual(
      captureDebugger({
        tool: 'Bash',
        args: {command: 'mabl agent debug session start abc-j'},
        text: '{"sessionId":"--help"}',
      }),
      [],
    );

    const settings = {showSessionSteps: false, stepsPollMs: 15_000};
    assert.equal(debuggerFeature.pollMs(entity, undefined, settings), 3_000);
    const stopped = {...entity, status: 'stopped'};
    assert.equal(
      debuggerFeature.pollMs(stopped, undefined, settings),
      undefined,
    );
    assert.equal(debuggerFeature.isFinished(stopped, undefined, {}), true);
    assert.equal(debuggerFeature.isFinished(entity, undefined, {}), false);
    const failing = {
      ...entity,
      name: 'Checkout',
      status: 'at 3 · 2/6 passed · failed at 2.1',
    };
    assert.equal(
      debuggerFeature.announces?.(entity, failing),
      'mabl debug Checkout: step 2.1 failed',
    );
    assert.equal(
      debuggerFeature.announces?.(failing, {
        ...failing,
        status: 'at 4 · 3/6 passed · failed at 2.1',
      }),
      undefined,
    );
    assert.equal(
      debuggerFeature.tabTitle({...entity, testId: 'abc-j'}),
      'Debug abc-j',
    );

    const filled: string[] = [];
    const actions = {
      fillPrompt: (text: string) => void filled.push(text),
      callTool: async () => assert.fail(),
      track: () => {},
      pollNow: () => {},
      openTab: () => {},
      openUrl: () => {},
      notify: () => undefined,
      setView: () => undefined,
      serverFor: (entity: {mcpServer?: string}) => entity.mcpServer ?? 'mabl',
      updateDetail: () => {},
    };
    const els = {
      Box: 'Box',
      Text: 'Text',
      Button: 'Button',
      Link: 'Link',
    } as never;
    type Node = {
      tag: string;
      props: Record<string, unknown>;
      children: unknown[];
    };
    const tree = debuggerFeature.render(els, {
      entity: failing,
      detail,
      entities: {},
      rows: 9,
      columns: 100,
      settings,
      actions,
    }) as unknown as Node;
    const flat = (node: unknown): Node[] =>
      node && typeof node === 'object'
        ? [node as Node, ...(node as Node).children.flatMap(flat)]
        : [];
    const button = flat(tree).find((node) => node.tag === 'Button');
    if (!button) {
      throw new Error('no Run next step button');
    }
    (button.props.onPress as () => void)();
    assert.deepEqual(filled, [
      'npx -y @mablhq/mabl-cli@2.136.25 agent debug session run-step mabl-debug-1',
    ]);
    const texts = flat(tree).filter((node) => node.tag === 'Text');
    assert.equal(texts.length, 2 + 4);
  })();
});

test('step lists parse after a CLI warning line', () => {
  for (const warning of ['Unsupported Node.js version', '[WARN] old Node']) {
    assert.equal(
      parseSteps(`${warning}\n[{"id":"s1","index":0,"description":"Click"}]`)
        .length,
      1,
      warning,
    );
  }
});
