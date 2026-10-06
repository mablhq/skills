import {test} from 'claude-code/testing';

import {assert, stubJsx} from './assert';

import type {MablEntity} from '../types';
import type {Actions, Els, Ops, Settings, ToolResult} from '../core/feature';
import {
  branchMembers,
  branchesFeature,
  captureBranches,
  compareUrl,
  isFeatureBranch,
  mergeStatusOf,
  mergeSummary,
} from '../features/branches';
import type {BranchDetail} from '../features/branches';
import {tabIdFor} from '../core/util';

test('branches', async () => {
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

    return [
      ...(node.tag === tag ? [node] : []),
      ...(node.children ?? []).flatMap((child) => nodes(child, tag)),
    ];
  };
  const text = (tree: unknown): string =>
    typeof tree === 'string' || typeof tree === 'number'
      ? String(tree)
      : tree && typeof tree === 'object'
        ? ((tree as Node).children ?? []).map(text).join('')
        : '';
  const result = (structured: unknown, isError = false): ToolResult => ({
    isError,
    structured,
    text: JSON.stringify(structured),
  });

  assert.equal(isFeatureBranch('feat-x'), true);
  assert.equal(isFeatureBranch('Main'), false);
  assert.equal(isFeatureBranch(' master '), false);
  assert.equal(isFeatureBranch(undefined), false);
  const slashTab = tabIdFor({kind: 'branch', id: 'feat/x'});
  assert.match(slashTab, /^mabl-branch-[\w-]+$/);
  assert.ok(slashTab !== tabIdFor({kind: 'branch', id: 'feat_x'}));
  assert.match(
    tabIdFor({kind: 'branch', id: 'x'.repeat(200)}),
    /^[\w-]{1,64}$/,
  );

  // Capture
  const [created] = captureBranches({
    tool: 'mcp__mabl-alt__create_mabl_branch',
    args: {workspaceId: 'ws-w', name: 'feat-x'},
    text: '',
    structured: {created: true, branchId: 'b1', name: 'feat-x', status: 'open'},
  });
  assert.deepEqual(
    {...created},
    {
      kind: 'branch',
      id: 'feat-x',
      name: 'feat-x',
      status: 'open',
      workspaceId: 'ws-w',
      url: undefined,
      mcpServer: 'mabl-alt',
    },
  );
  assert.deepEqual(
    captureBranches({
      tool: 'mcp__mabl__create_mabl_branch',
      args: {name: 'x'},
      text: '',
      structured: {created: false, name: 'x'},
    }),
    [],
  );
  const [fromStatus] = captureBranches({
    tool: 'mcp__mabl__mabl_authoring_status',
    args: {sessionId: 's1-as'},
    text: '',
    structured: {
      sessionStatus: 'completed',
      branchId: 'b2',
      branchName: 'taa-branch',
      viewTestUrl:
        'https://app.mabl.com/workspaces/ws-a/train/tests/t1-j/current',
    },
  });
  assert.equal(fromStatus?.id, 'taa-branch');
  assert.equal(fromStatus?.status, undefined);
  assert.equal(fromStatus?.workspaceId, 'ws-a');
  assert.equal(
    fromStatus?.url,
    'https://app.mabl.com/workspaces/ws-a/train/branches/b2',
  );
  const [fromTest] = captureBranches({
    tool: 'mcp__mabl__create_mabl_test',
    args: {workspaceId: 'ws-a'},
    text: '',
    structured: {created: true, testId: 't1-j', branch: 'feat-y'},
  });
  assert.equal(fromTest?.id, 'feat-y');
  assert.deepEqual(
    captureBranches({
      tool: 'mcp__mabl__create_mabl_test',
      args: {},
      text: '',
      structured: {testId: 't2-j', branch: 'master'},
    }),
    [],
  );
  assert.deepEqual(
    captureBranches({
      tool: 'mcp__mabl__get_mabl_branch_merge_status',
      args: {from: 'feat-x'},
      text: '',
      structured: {from: 'feat-x', to: 'master'},
    }),
    [],
  );
  assert.deepEqual(
    captureBranches({
      tool: 'Bash',
      args: {command: 'mabl branches list'},
      text: '{"branch":"feat-x"}',
    }),
    [],
  );
  const [merged] = captureBranches({
    tool: 'mcp__mabl__merge_mabl_branch',
    args: {workspaceId: 'ws-a', from: 'feat-x'},
    text: '',
    structured: {merged: true, from: 'feat-x', to: 'master', status: 'merged'},
  });
  assert.equal(merged?.status, 'merged');

  // Merge status
  const CONFLICTED = {
    from: 'feat-x',
    to: 'master',
    hasNewVersions: true,
    conflicted: true,
    divergedCount: 2,
    divergedEntities: [
      {id: 't1-j', type: 'test', name: 'Login'},
      {id: 'f1-f', type: 'flow', name: 'Setup'},
    ],
  };
  const conflicted = mergeStatusOf(result(CONFLICTED));
  assert.equal(conflicted.diverged.length, 2);
  assert.match(
    mergeSummary(conflicted),
    /^Conflicted: 2 tests or flows changed on master/,
  );
  assert.match(
    mergeSummary(
      mergeStatusOf(
        result({
          from: 'a',
          to: 'master',
          hasNewVersions: false,
          conflicted: false,
        }),
      ),
    ),
    /^Nothing to merge/,
  );
  assert.match(
    mergeSummary(
      mergeStatusOf(
        result({
          from: 'a',
          to: 'master',
          hasNewVersions: true,
          conflicted: false,
        }),
      ),
    ),
    /^Merges cleanly into master/,
  );
  const missing = mergeStatusOf(
    result(
      {from: 'a', to: 'master', branchNotFound: true, hint: 'not found'},
      true,
    ),
  );
  assert.equal(missing.isNotFound, true);
  assert.match(
    mergeSummary(
      mergeStatusOf(result({from: 'a', to: 'master', hint: 'boom'}, true)),
    ),
    /^Merge status failed: boom/,
  );
  assert.equal(
    compareUrl('https://app.mabl.com', 'ws-a', 'master', 'feat x', {
      id: 'f1-f',
      type: 'flow',
      name: 'Setup',
    }),
    'https://app.mabl.com/workspaces/ws-a/branches/compare/master...feat%20x/flows/f1-f',
  );

  // Poll, finish, and render
  const settings: Settings = {showSessionSteps: false, stepsPollMs: 15_000};
  const branch: MablEntity = {
    kind: 'branch',
    id: 'feat-x',
    name: 'feat-x',
    status: 'open',
    workspaceId: 'ws-a',
    mcpServer: 'mabl-alt',
    updatedAt: 1,
  };
  assert.equal(branchesFeature.tabKinds.includes('branch'), true);
  assert.equal(branchesFeature.pollMs(branch, undefined, settings), 60_000);
  assert.equal(
    branchesFeature.pollMs(
      {...branch, workspaceId: undefined},
      undefined,
      settings,
    ),
    undefined,
  );
  assert.equal(
    branchesFeature.pollMs({...branch, status: 'merged'}, undefined, settings),
    undefined,
  );
  assert.equal(
    branchesFeature.isFinished({...branch, status: 'merged'}, undefined, {}),
    true,
  );
  assert.equal(branchesFeature.isFinished(branch, undefined, {}), false);
  assert.equal(branchesFeature.isFinished(branch, {merge: missing}, {}), true);
  assert.equal(
    branchesFeature.pollMs(branch, {merge: missing}, settings),
    60_000,
    'a not-found branch keeps polling',
  );

  const main = async (): Promise<void> => {
    const calls: {
      server: string;
      tool: string;
      args: Record<string, unknown>;
      options?: {isErrorExpected?: boolean};
    }[] = [];
    const ops: Ops = {
      callTool: async (server, tool, args, options) => {
        calls.push({server, tool, args, options});

        return result(CONFLICTED);
      },
      run: async () => ({exitCode: 0, stdout: '', stderr: ''}),
      mtime: async () => undefined,
      read: async () => undefined,
      home: '/home',
      serverFor: (entity: {mcpServer?: string}) => entity.mcpServer ?? 'mabl',
      now: async () => 1,
    };
    const polled = await branchesFeature.poll!(
      ops,
      branch,
      undefined,
      settings,
    );
    assert.deepEqual(calls, [
      {
        server: 'mabl-alt',
        tool: 'get_mabl_branch_merge_status',
        args: {workspaceId: 'ws-a', from: 'feat-x'},
        options: {isErrorExpected: true},
      },
    ]);
    const detail = polled.detail as BranchDetail;
    assert.equal(detail.merge?.conflicted, true);
    const again = await branchesFeature.poll!(ops, branch, detail, settings);
    assert.equal(again.detail, undefined, 'same merge status, no new detail');

    const test: MablEntity = {
      kind: 'test',
      id: 't1-j',
      name: 'Login',
      status: 'created',
      branch: 'feat-x',
      url: 'https://app.mabl.com/workspaces/ws-a/train/tests/t1-j/current',
      updatedAt: 3,
    };
    const flow: MablEntity = {
      kind: 'flow',
      id: 'f1-f',
      name: 'Setup',
      branch: 'feat-x',
      updatedAt: 2,
    };
    const other: MablEntity = {
      kind: 'test',
      id: 't9-j',
      branch: 'master',
      updatedAt: 4,
    };
    const entities = {
      [branch.id]: branch,
      [test.id]: test,
      [flow.id]: flow,
      [other.id]: other,
    };
    assert.deepEqual(
      branchMembers('feat-x', entities).map((entity) => entity.id),
      ['t1-j', 'f1-f'],
    );
    const elsewhere: MablEntity = {
      kind: 'test',
      id: 't8-j',
      branch: 'feat-x',
      workspaceId: 'ws-b',
      updatedAt: 5,
    };
    assert.deepEqual(
      branchMembers(
        'feat-x',
        {...entities, [elsewhere.id]: elsewhere},
        'ws-a',
      ).map((entity) => entity.id),
      ['t1-j', 'f1-f'],
    );
    const els = {
      Box: function Box() {},
      Text: function Text() {},
      Button: function Button() {},
    } as unknown as Els;
    const opened: string[] = [];
    const actions: Actions = {
      fillPrompt: () => {},
      callTool: async () => result({}),
      track: () => {},
      pollNow: () => {},
      openTab: () => {},
      openUrl: (url) => void opened.push(url),
      notify: () => undefined,
      setView: () => undefined,
      serverFor: (entity: {mcpServer?: string}) => entity.mcpServer ?? 'mabl',
      updateDetail: () => {},
    };
    const tree = branchesFeature.render(els, {
      entity: branch,
      detail,
      entities,
      rows: 30,
      columns: 100,
      settings,
      actions,
    });
    const shown = text(tree);
    assert.match(shown, /^Branch feat-x · open/);
    assert.match(shown, /Conflicted: 2 tests or flows/);
    assert.match(shown, /Test Login · created/);
    assert.match(shown, /Flow Setup/);
    assert.doesNotMatch(shown, /t9-j/);
    for (const button of nodes(tree, 'Button')) {
      (button.props.onPress as () => void)();
    }
    assert.deepEqual(opened, [
      'https://app.mabl.com/workspaces/ws-a/train/branches',
      'https://app.mabl.com/workspaces/ws-a/branches/compare/master...feat-x/tests/t1-j',
      'https://app.mabl.com/workspaces/ws-a/branches/compare/master...feat-x/flows/f1-f',
      'https://app.mabl.com/workspaces/ws-a/train/tests/t1-j/current',
    ]);
    const noWorkspace = text(
      branchesFeature.render(els, {
        entity: {...branch, workspaceId: undefined},
        detail: undefined,
        entities: {},
        rows: 30,
        columns: 100,
        settings,
        actions,
      }),
    );
    assert.match(noWorkspace, /Merge status appears once/);
  };

  await main();
});
