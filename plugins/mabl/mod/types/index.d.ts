export type MablEntityKind =
  | 'authoring'
  | 'test'
  | 'flow'
  | 'branch'
  | 'run'
  | 'planRun'
  | 'deployment'
  | 'debug'
  | 'impact';

/** One mabl item this session touched. Feature-specific data lives in `details`, keyed by the same id. */
export type MablEntity = {
  kind: MablEntityKind;
  id: string;
  name?: string;
  status?: string;
  branch?: string;
  testId?: string;
  url?: string;
  workspaceId?: string;
  isLocal?: boolean;
  /** MCP server that started the item, used for polling; absent when the CLI started it. */
  mcpServer?: string;
  /** CLI binary that started the item, e.g. `mabl`. */
  cli?: string;
  /** The test impact analysis a run, plan run, or deployment was dispatched for. */
  impactSessionId?: string;
  /** The plan run a test run belongs to, or the deployment a plan run belongs to. */
  parentId?: string;
  updatedAt: number;
};

export type MablEntities = Record<string, MablEntity>;

/** One entry of `get_mabl_authoring_steps`: a step, or a step group / flow boundary. */
export type StepEntry = {
  path: string;
  text: string;
  kind: string;
  stepId?: string;
  flowId?: string;
  collapsedStepCount?: number;
};

export type SessionSteps = {
  entries: StepEntry[];
  stepCount: number;
  hash: string;
  fetchedAt: number;
  /** True once fetched after the session reached a terminal status. */
  isFinal: boolean;
};

/** A trimmed copy of an entity kept across sessions in `$.store`. */
export type HistoryItem = Pick<
  MablEntity,
  'kind' | 'id' | 'name' | 'status' | 'url' | 'branch' | 'workspaceId'
> & {
  seenAt: number;
};

declare module 'claude-code' {
  interface PluginState {
    mabl: {
      entities: MablEntities;
      /** Feature-owned data per entity id; each feature knows its own shape. */
      details: Record<string, unknown>;
      /** Per-tab view choices, such as a list filter; polls never write them. */
      views: Record<string, unknown>;
      /** When the last poll finished, and why it failed. */
      lastPoll: {at: number; error?: string} | null;
    };
  }
}
