import {test} from 'claude-code/testing';

import {assert, stubJsx} from './assert';

import type {MablEntity} from '../types';
import {hashOf} from '../core/util';
import type {Actions, Els, Ops, Settings, ToolResult} from '../core/feature';
import {
  answerCall,
  captureAuthoring,
  pauseFromSession,
  pauseOf,
  authoringFeature,
  withPause,
} from '../features/authoring';
import type {AuthoringDetail} from '../features/authoring';

const ask = (id: string, question: string): Record<string, unknown> => ({
  role: 'model',
  parts: [
    {
      type: 'tool_call',
      id,
      name: 'execute_ask_for_help',
      input: {type: 'json', json: {question}},
    },
  ],
});
const closed = (id: string): Record<string, unknown> => ({
  role: 'tool_output',
  parts: [
    {type: 'tool_output', tool_name: 'execute_ask_for_help', tool_call_id: id},
  ],
});
const MESSAGES = [
  ask('c1', 'Which app?'),
  closed('c1'),
  ask('c2', 'Which user should log in?'),
  closed('c2'),
  {role: 'special', parts: []},
];
const PROGRESS = {
  stepCount: 1,
  steps: [{path: '1', text: 'Visit', kind: 'step'}],
};

test('pending question from the session', () => {
  const paused = {status: 'needs_attention', messages: MESSAGES};
  assert.deepEqual(pauseFromSession(paused), {
    question: 'Which user should log in?',
  });
  assert.equal(
    pauseFromSession({
      status: 'needs_attention',
      messages: [ask('c3', 'Still open?'), ask('c4', 'Done'), closed('c4')],
    })?.question,
    'Still open?',
    'an unanswered ask outranks a newer closed one',
  );
  assert.equal(
    pauseFromSession({status: 'running', messages: MESSAGES}),
    undefined,
  );
  assert.equal(
    pauseFromSession({status: 'needs_attention', messages: []}),
    undefined,
  );
});

test('authoring-answer', async () => {
  stubJsx();
  type Node = {
    tag: string;
    props: Record<string, unknown>;
    children: unknown[];
  };
  const nodes = (tree: unknown, tag: string): Node[] => {
    if (!tree || typeof tree !== 'object') {
      return [];
    }
    const node = tree as Node;
    const own = node.tag === tag ? [node] : [];

    return [
      ...own,
      ...(node.children ?? []).flatMap((child) => nodes(child, tag)),
    ];
  };
  const text = (tree: unknown): string =>
    typeof tree === 'string' || typeof tree === 'number'
      ? String(tree)
      : tree && typeof tree === 'object'
        ? ((tree as Node).children ?? []).map(text).join('')
        : '';

  const CLI_PAUSED = {
    sessionStatus: 'needs_attention',
    question: 'Which user should log in?',
    reClarification: true,
    planDiffSummary: 'Added login',
  };
  const result = (structured: unknown, isError = false): ToolResult => ({
    isError,
    structured,
    text: JSON.stringify(structured),
  });

  assert.deepEqual(pauseOf(CLI_PAUSED), {
    question: 'Which user should log in?',
    reClarification: true,
    planDiffSummary: 'Added login',
  });
  assert.equal(
    pauseOf({sessionStatus: 'running', question: 'stale'}),
    undefined,
  );
  const paused: AuthoringDetail = withPause({}, pauseOf(CLI_PAUSED));
  assert.equal(
    withPause(paused, pauseOf(CLI_PAUSED)),
    paused,
    'same pause keeps the same object',
  );
  assert.deepEqual(withPause(paused, undefined), {});

  const entity: MablEntity = {
    kind: 'authoring',
    id: 's1-as',
    status: 'needs_attention',
    mcpServer: 'mabl-alt',
    url: 'https://app.mabl.com/workspaces/ws-w/agents/tasks/s1-as',
    updatedAt: 1,
  };
  assert.deepEqual(answerCall(entity, paused.pause, '  alice  ', 'mabl-alt'), {
    server: 'mabl-alt',
    args: {sessionId: 's1-as', message: 'alice'},
  });
  assert.equal(answerCall(entity, paused.pause, '   ', 'mabl-alt'), undefined);
  assert.equal(
    answerCall(entity, undefined, 'x', 'mabl-alt'),
    undefined,
    'no question, no answer',
  );

  // get_agent_session reads in the transcript
  const [read, createdTest] = captureAuthoring({
    tool: 'mcp__mabl-alt__get_agent_session',
    args: {sessionId: 's1-as', includeProgress: true},
    text: '',
    structured: {
      sessionId: 's1-as',
      agentType: 'test_authoring',
      status: 'completed',
      progress: {...PROGRESS, createdTestId: 't1-j'},
    },
  });
  assert.equal(read?.status, 'completed');
  assert.equal(read?.testId, 't1-j');
  assert.equal(createdTest?.kind, 'test');
  assert.deepEqual(
    captureAuthoring({
      tool: 'mcp__mabl__get_agent_session',
      args: {sessionId: 'a1-as'},
      text: '',
      structured: {agentType: 'workspace_assistant', status: 'running'},
    }),
    [],
    'only authoring sessions are tracked',
  );
  const [cliAnswer] = captureAuthoring({
    tool: 'Bash',
    args: {
      command: 'mabl agent authoring answer --session-id s1-as --text alice',
    },
    text: '{"outcome":"resumed","sessionStatus":"queued"}',
  });
  assert.equal(cliAnswer?.status, 'queued');
  const [cliStatus] = captureAuthoring({
    tool: 'Bash',
    args: {command: 'mabl agent authoring status --session-id s1-as'},
    text: '{"sessionStatus":"running","branchName":"feat-x"}',
  });
  assert.equal(cliStatus?.branch, 'feat-x');

  // Polls against a fake get_agent_session
  type Read = {messageLimit?: number; includeProgress?: boolean};
  const label = (tool: string, args: Read): string =>
    tool === 'get_agent_session'
      ? args.includeProgress
        ? `progress:${args.messageLimit}`
        : `messages:${args.messageLimit}`
      : tool;
  const fakeOps = (
    respond: (args: Read) => ToolResult,
    calls: string[] = [],
  ): Ops => ({
    callTool: async (_server, tool, args) => {
      calls.push(label(tool, args));

      return respond(args);
    },
    run: async () => ({
      exitCode: 0,
      stdout: JSON.stringify(CLI_PAUSED),
      stderr: '',
    }),
    mtime: async () => undefined,
    read: async () => undefined,
    home: '/home',
    serverFor: (item: {mcpServer?: string}) => item.mcpServer ?? 'mabl',
    now: async () => 100,
  });
  const session =
    (status: string, messages: unknown[] = MESSAGES) =>
    (args: Read): ToolResult =>
      result({
        sessionId: 's1-as',
        agentType: 'test_authoring',
        status,
        messages: args.messageLimit ? messages : [],
        ...(args.includeProgress ? {progress: PROGRESS} : {}),
      });
  const steps: Settings = {showSessionSteps: true, stepsPollMs: 15_000};
  const status: Settings = {showSessionSteps: false, stepsPollMs: 15_000};

  const firstCalls: string[] = [];
  const first = await authoringFeature.poll!(
    fakeOps(session('needs_attention'), firstCalls),
    entity,
    undefined,
    steps,
  );
  assert.deepEqual(firstCalls, ['progress:0', 'messages:10']);
  const firstDetail = first.detail as AuthoringDetail;
  assert.equal(firstDetail.pause?.question, 'Which user should log in?');
  assert.equal(firstDetail.steps?.stepCount, 1);

  const again = await authoringFeature.poll!(
    fakeOps(session('needs_attention')),
    entity,
    firstDetail,
    steps,
  );
  assert.equal(again.detail, undefined, 'nothing changed, no new detail');

  const asked = await authoringFeature.poll!(
    fakeOps(
      session('needs_attention', [
        ...MESSAGES,
        ask('c5', 'And the password?'),
        closed('c5'),
      ]),
    ),
    entity,
    firstDetail,
    steps,
  );
  assert.equal(
    (asked.detail as AuthoringDetail).pause?.question,
    'And the password?',
    'a newer question replaces the stored one',
  );

  const kept = await authoringFeature.poll!(
    fakeOps((args) =>
      args.includeProgress
        ? session('needs_attention')(args)
        : result({}, true),
    ),
    entity,
    firstDetail,
    steps,
  );
  assert.equal(
    kept.detail,
    undefined,
    'a failed message read keeps the stored question',
  );

  const noProgressCalls: string[] = [];
  const noProgress = await authoringFeature.poll!(
    fakeOps(
      (args) =>
        args.includeProgress ? result({}, true) : session('running')(args),
      noProgressCalls,
    ),
    entity,
    firstDetail,
    steps,
  );
  assert.deepEqual(noProgressCalls, ['progress:0', 'messages:0']);
  assert.equal(
    noProgress.updates[0]?.status,
    'running',
    'a failed progress read still reports status',
  );

  const resumedCalls: string[] = [];
  const resumed = await authoringFeature.poll!(
    fakeOps(session('running'), resumedCalls),
    {...entity, status: 'running'},
    firstDetail,
    steps,
  );
  assert.deepEqual(resumedCalls, ['progress:0']);
  assert.equal(
    (resumed.detail as AuthoringDetail).pause,
    undefined,
    'question cleared once running',
  );
  assert.equal((resumed.detail as AuthoringDetail).steps?.stepCount, 1);

  const viaStatusCalls: string[] = [];
  const viaStatus = await authoringFeature.poll!(
    fakeOps(session('needs_attention'), viaStatusCalls),
    entity,
    undefined,
    status,
  );
  assert.deepEqual(viaStatusCalls, ['messages:0', 'messages:10']);
  assert.equal(
    (viaStatus.detail as AuthoringDetail).pause?.question,
    'Which user should log in?',
  );

  const finished = await authoringFeature.poll!(
    fakeOps((args) =>
      result({
        status: 'completed',
        ...(args.includeProgress
          ? {progress: {...PROGRESS, createdTestId: 't1-j'}}
          : {}),
      }),
    ),
    entity,
    undefined,
    status,
  );
  assert.equal(finished.updates[0]?.testId, 't1-j');
  assert.equal(
    finished.updates[1]?.url,
    'https://app.mabl.com/workspaces/ws-w/train/tests/t1-j/current',
  );

  const cliEntity: MablEntity = {
    kind: 'authoring',
    id: 's2-as',
    status: 'needs_attention',
    cli: 'mabl',
    updatedAt: 1,
  };
  const viaCli = await authoringFeature.poll!(
    fakeOps(session('running')),
    cliEntity,
    undefined,
    status,
  );
  assert.equal(
    (viaCli.detail as AuthoringDetail).pause?.question,
    CLI_PAUSED.question,
  );
  assert.equal(viaCli.updates[0]?.status, 'needs_attention');

  const clearedCalls: string[] = [];
  const cleared = await authoringFeature.poll!(
    fakeOps(session('running'), clearedCalls),
    entity,
    firstDetail,
    status,
  );
  assert.deepEqual(clearedCalls, ['messages:0']);
  assert.equal((cleared.detail as AuthoringDetail).pause, undefined);
  assert.ok(
    (cleared.detail as AuthoringDetail).steps,
    'clearing the question keeps the steps',
  );

  // Render
  const els = {
    Box: function Box() {},
    Text: function Text() {},
    Button: function Button() {},
    Link: function Link() {},
    Input: function Input() {},
  } as unknown as Els;
  const sent: {
    server: string;
    tool: string;
    args: Record<string, unknown>;
  }[] = [];
  const filled: string[] = [];
  const polled: string[] = [];
  const actions: Actions = {
    fillPrompt: (value) => void filled.push(value),
    callTool: async (server, tool, args) => {
      sent.push({server, tool, args});

      return result({sessionId: 's1-as', delivered: true});
    },
    track: () => {},
    pollNow: (id) => void polled.push(id),
    openTab: () => {},
    openUrl: () => {},
    notify: () => undefined,
    setView: () => undefined,
    serverFor: (item: {mcpServer?: string}) => item.mcpServer ?? 'mabl',
    updateDetail: () => {},
  };
  const context = {
    entity,
    detail: asked.detail,
    entities: {[entity.id]: entity},
    rows: 30,
    columns: 100,
    settings: steps,
    actions,
  };
  const tree = authoringFeature.render(els, context);
  assert.match(text(tree), /Question:And the password\?/);
  const [input] = nodes(tree, 'Input');
  assert.equal(input?.props.key, `answer-s1-as-${hashOf('And the password?')}`);
  assert.equal(input?.props.label, 'Your answer');
  assert.equal(input?.props.submitLabel, 'Send');
  (input?.props.onSubmit as (value: string) => void)('alice');
  for (let tick = 0; tick < 10; tick++) await Promise.resolve();
  assert.deepEqual(sent, [
    {
      server: 'mabl-alt',
      tool: 'send_agent_message',
      args: {sessionId: 's1-as', message: 'alice'},
    },
  ]);
  assert.deepEqual(polled, ['s1-as']);
  const [askClaude] = nodes(tree, 'Button');
  (askClaude?.props.onPress as () => void)();
  assert.deepEqual(filled, [
    'Read the open question on mabl test authoring session s1-as with get_agent_session, then answer it with send_agent_message. My guidance: ',
  ]);

  const {Input: _input, ...mobile} = els;
  const mobileTree = authoringFeature.render(mobile as Els, context);
  assert.equal(nodes(mobileTree, 'Input').length, 0);
  assert.equal(nodes(mobileTree, 'Button').length, 1);

  const running = authoringFeature.render(els, {
    ...context,
    entity: {...entity, status: 'running'},
  });
  assert.equal(
    nodes(running, 'Input').length + nodes(running, 'Button').length,
    0,
    'no question once running',
  );
});

test('CLI answers and initiations name their session and test', () => {
  const [answered] = captureAuthoring({
    tool: 'Bash',
    args: {
      command: 'mabl agent authoring answer s9-as "use the staging login"',
    },
    text: '{"sessionStatus":"queued"}',
  });
  assert.equal(answered?.id, 's9-as', 'the session id is positional');
  const [initiated] = captureAuthoring({
    tool: 'Bash',
    args: {
      command: `mabl agent authoring initiate --test-information '{"test_id":"t7-j","test_case":"x; y"}'`,
    },
    text: '{"sessionId":"s7-as"}',
  });
  assert.equal(
    initiated?.testId,
    't7-j',
    'the test id sits inside quoted JSON',
  );
});
