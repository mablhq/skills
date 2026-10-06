import type {Elements, RenderElement} from 'claude-code';

import type {MablEntities, MablEntity, MablEntityKind} from '../types';
import type {CallRecord, EntityUpdate} from './util';

/** The mod's settings, from the manifest's `userConfig`. */
export type Settings = {
  showSessionSteps: boolean;
  stepsPollMs: number;
};

/** An MCP result, flattened: structured content (or the JSON in its text) and the text itself. */
export type ToolResult = {isError: boolean; structured: unknown; text: string};

/**
 * What a feature may do while polling. `register.tsx` builds these from `$`;
 * a feature never sees `$` itself, because `$` cannot cross a module import.
 */
export type Ops = {
  /** `isErrorExpected`: the caller reads an error result as data, so it is not a failed check. */
  callTool: (
    server: string,
    tool: string,
    args: Record<string, unknown>,
    options?: {isErrorExpected?: boolean},
  ) => Promise<ToolResult>;
  run: (
    argv: readonly string[],
    timeoutMs?: number,
  ) => Promise<{exitCode: number; stdout: string; stderr: string}>;
  /** Modified time of a file, or undefined when it is missing. */
  mtime: (path: string) => Promise<number | undefined>;
  /** A file's text, or undefined when it cannot be read. */
  read: (path: string) => Promise<string | undefined>;
  /** The user's home directory. */
  home: string;
  /** The MCP server to call for an item: the one that started it, else the plugin's mabl server. */
  serverFor: (entity: Pick<MablEntity, 'mcpServer'>) => string;
  now: () => Promise<number>;
};

/** What a feature's poll found: entity changes, and new detail data (undefined keeps the old). */
export type PollResult = {updates: EntityUpdate[]; detail?: unknown};

/** What a pane's buttons and inputs may do: closures over `$`, fire-and-forget except `callTool`. */
export type Actions = {
  /** Puts text in the prompt box as a draft for the person to send, keeping what they typed. */
  fillPrompt: (text: string) => void;
  /** Shows a short message, e.g. that a button's call failed. */
  notify: (text: string) => void;
  serverFor: Ops['serverFor'];
  /** Calls an MCP tool on the person's behalf, then records the entities the result names. */
  callTool: (
    server: string,
    tool: string,
    args: Record<string, unknown>,
  ) => Promise<ToolResult>;
  /** Adds or updates entities, as if a tool call had named them. */
  track: (updates: EntityUpdate[]) => void;
  /** Polls one entity again on the next tick. */
  pollNow: (entityId: string) => void;
  /** Opens an entity's own tab. */
  openTab: (entity: MablEntity) => void;
  /** Opens a mabl.com URL in the person's browser; any other URL is ignored. */
  openUrl: (url: string) => void;
  /** Sets a tab's view choice, such as a list filter; the tab redraws. */
  setView: (entityId: string, view: unknown) => void;
  /** Changes an entity's stored detail, e.g. a tab's own UI state; the tab redraws. */
  updateDetail: (
    entityId: string,
    change: (detail: unknown) => unknown,
  ) => void;
};

/** The elements a feature draws with, from `$.ui.resolve(e)`. `Input` is missing on mobile. */
export type Els = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button'> & {
  Input?: Elements['terminal']['Input'];
  Select?: Elements['terminal']['Select'];
};

export type RenderContext = {
  entity: MablEntity;
  detail: unknown;
  /** The tab's view choice from `setView`, if the person made one. */
  view?: unknown;
  /** Every entity, so a tab can show related ones (a plan run's test runs, a branch's tests). */
  entities: MablEntities;
  /** Rows and columns the pane may use. */
  rows: number;
  columns: number;
  settings: Settings;
  actions: Actions;
};

export type Feature = {
  /** The entity kinds this feature owns: their polls and their tabs. */
  kinds: readonly MablEntityKind[];
  /** Kinds that get their own tab. A subset of `kinds`. */
  tabKinds: readonly MablEntityKind[];
  /** Entities a finished mabl tool call names. Pure; `register.tsx` calls it for every mabl call. */
  capture: (call: CallRecord) => EntityUpdate[];
  /** How long until the next poll, or undefined when the entity needs no more polling. */
  pollMs: (
    entity: MablEntity,
    detail: unknown,
    settings: Settings,
  ) => number | undefined;
  poll?: (
    ops: Ops,
    entity: MablEntity,
    detail: unknown,
    settings: Settings,
  ) => Promise<PollResult>;
  /** True when the item is done and "Clear finished" may drop it. */
  isFinished: (
    entity: MablEntity,
    detail: unknown,
    entities: MablEntities,
  ) => boolean;
  /** Status changes worth a toast, e.g. "failed". */
  announces?: (
    before: MablEntity | undefined,
    after: MablEntity,
  ) => string | undefined;
  tabTitle: (entity: MablEntity) => string;
  render: (els: Els, context: RenderContext) => RenderElement;
};
