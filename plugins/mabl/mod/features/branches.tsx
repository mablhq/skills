import type { MablEntities, MablEntity } from '../types'
import type { Feature, Ops, PollResult, ToolResult } from '../core/feature'
import { KIND_LABEL, appBaseFromUrl, hashOf, list, mablCall, mcpServerFor, num, obj, str, workspaceFromUrl } from '../core/util'
import type { CallRecord, EntityUpdate, Fields } from '../core/util'

const POLL_MS = 60_000
const DEFAULT_TARGET = 'master'
const DONE_STATUSES = new Set(['merged', 'closed'])
const MAX_DIVERGED_SHOWN = 5

export type DivergedEntity = { id: string; type: string; name: string }

/** What `get_mabl_branch_merge_status` said about merging this branch. */
export type MergeStatus = {
  to: string
  hasNewVersions?: boolean
  conflicted?: boolean
  divergedCount?: number
  diverged: DivergedEntity[]
  isNotFound: boolean
  error?: string
}

export type BranchDetail = { merge?: MergeStatus }

const branchDetail = (detail: unknown): BranchDetail => obj(detail) as BranchDetail

const bool = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined)

/** True for a named branch other than mabl's default (`master`, or its alias `main`). */
export const isFeatureBranch = (name: string | undefined): name is string =>
  name !== undefined && name.trim() !== '' && !['master', 'main'].includes(name.trim().toLowerCase())

const firstUrl = (data: Fields): string | undefined => str(data.viewTestUrl) ?? str(data.viewTaskUrl) ?? str(data.url)

/** The branch a mabl MCP result names, and the status the result sets, if any. */
const branchOf = (name: string, call: CallRecord): { branch?: string; status?: string } => {
  const data = obj(call.structured)
  switch (name) {
    case 'create_mabl_branch':
      return data.created === true ? { branch: str(data.name) ?? str(call.args.name), status: str(data.status) ?? 'open' } : {}
    case 'merge_mabl_branch':
      return data.merged === true ? { branch: str(data.branchName) ?? str(data.from) ?? str(call.args.from), status: str(data.status) ?? 'merged' } : {}
    case 'get_mabl_branch_merge_status':
      return {}
    default:
      return { branch: str(data.branchName) ?? str(data.branch) }
  }
}

export const captureBranches = (call: CallRecord): EntityUpdate[] => {
  const parsed = mablCall(call)
  if (parsed?.source !== 'mcp') {
    return []
  }
  const { branch, status } = branchOf(parsed.name, call)
  if (!isFeatureBranch(branch)) {
    return []
  }
  const data = obj(call.structured)
  const name = branch.trim()
  const workspaceId = str(call.args.workspaceId) ?? workspaceFromUrl(firstUrl(data))
  const base = appBaseFromUrl(firstUrl(data))
  const branchId = str(data.branchId)

  return [
    {
      kind: 'branch',
      id: name,
      name,
      status,
      workspaceId,
      url: base && workspaceId && branchId ? new URL(`${base}/workspaces/${workspaceId}/train/branches/${encodeURIComponent(branchId)}`).href : undefined,
      mcpServer: parsed.server,
    },
  ]
}

export const mergeStatusOf = (result: ToolResult): MergeStatus => {
  const data = obj(result.structured)

  return {
    to: str(data.to) ?? DEFAULT_TARGET,
    hasNewVersions: bool(data.hasNewVersions),
    conflicted: bool(data.conflicted),
    divergedCount: num(data.divergedCount),
    diverged: list(data.divergedEntities).flatMap(item => {
      const id = str(item.id)

      return id ? [{ id, type: str(item.type) ?? 'test', name: str(item.name) ?? id }] : []
    }),
    isNotFound: data.branchNotFound === true,
    error: result.isError ? (str(data.hint) ?? (result.text.slice(0, 200) || 'unknown error')) : undefined,
  }
}

/** One line on whether the branch can merge, from the latest merge status. */
export const mergeSummary = (merge: MergeStatus): string => {
  if (merge.isNotFound) {
    return 'mabl has no branch with this name in this workspace.'
  }
  if (merge.error) {
    return `Merge status failed: ${merge.error}`
  }
  if (merge.conflicted) {
    const count = merge.divergedCount ?? merge.diverged.length

    return `Conflicted: ${count} ${count === 1 ? 'test or flow' : 'tests or flows'} changed on ${merge.to} since this branch was cut. Merging would overwrite them.`
  }
  if (merge.hasNewVersions === false) {
    return `Nothing to merge: merging into ${merge.to} would only close the branch.`
  }

  return `Merges cleanly into ${merge.to}.`
}

/** The app's side-by-side view of one test or flow on two branches. */
export const compareUrl = (base: string, workspaceId: string, to: string, from: string, entity: DivergedEntity): string =>
  new URL(
    `${base}/workspaces/${workspaceId}/branches/compare/${encodeURIComponent(to)}...${encodeURIComponent(from)}/${entity.type === 'flow' ? 'flows' : 'tests'}/${encodeURIComponent(entity.id)}`,
  ).href

/** Tests and flows this session tracked on the branch, in its workspace when both are known. */
export const branchMembers = (branch: string, entities: MablEntities, workspaceId?: string): MablEntity[] =>
  Object.values(entities)
    .filter(entity => (entity.kind === 'test' || entity.kind === 'flow') && entity.branch === branch)
    .filter(entity => {
      const memberWorkspace = entity.workspaceId ?? workspaceFromUrl(entity.url)

      return !workspaceId || !memberWorkspace || memberWorkspace === workspaceId
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)

/** `https://app.mabl.com` from the branch's own link, else from any item in its workspace. */
export const appBaseFor = (entity: MablEntity, entities: MablEntities): string | undefined =>
  appBaseFromUrl(entity.url) ??
  Object.values(entities)
    .filter(other => other.url && workspaceFromUrl(other.url) === entity.workspaceId)
    .map(other => appBaseFromUrl(other.url))
    .find(Boolean)

const isDone = (entity: MablEntity, detail: unknown): boolean =>
  DONE_STATUSES.has(entity.status ?? '') || branchDetail(detail).merge?.isNotFound === true

const pollBranch = async (ops: Ops, entity: MablEntity, detail: unknown): Promise<PollResult> => {
  const result = await ops.callTool(
    mcpServerFor(entity),
    'get_mabl_branch_merge_status',
    { workspaceId: entity.workspaceId, from: entity.name ?? entity.id },
    { isErrorExpected: true },
  )
  const before = branchDetail(detail)
  const merge = mergeStatusOf(result)

  return { updates: [], ...(hashOf(before.merge) === hashOf(merge) ? {} : { detail: { ...before, merge } }) }
}

export const branchesFeature: Feature = {
  kinds: ['branch'],
  tabKinds: ['branch'],
  capture: captureBranches,
  // Not-found still polls: the name can be recreated, or point at another workspace on a later call.
  pollMs: entity => (entity.workspaceId && !DONE_STATUSES.has(entity.status ?? '') ? POLL_MS : undefined),
  poll: pollBranch,
  isFinished: isDone,
  tabTitle: entity => `Branch ${entity.name ?? entity.id}`,
  render: ({ Box, Link, Text }, { entity, detail, entities, rows }) => {
    const name = entity.name ?? entity.id
    const { merge } = branchDetail(detail)
    const base = appBaseFor(entity, entities)
    const members = branchMembers(name, entities, entity.workspaceId)
    const diverged = merge?.conflicted ? merge.diverged.slice(0, MAX_DIVERGED_SHOWN) : []
    const room = Math.max(3, rows - 6 - diverged.length)

    return (
      <Box flexDirection="column">
        <Text bold>
          Branch {name} · {entity.status ?? 'open'}
        </Text>
        {entity.url ? (
          <Link href={entity.url} label="Open branch in mabl" />
        ) : (
          base && entity.workspaceId && <Link href={new URL(`${base}/workspaces/${entity.workspaceId}/train/branches`).href} label="Branches in mabl" />
        )}
        {!entity.workspaceId && <Text dimColor>Merge status appears once a mabl call names this branch's workspace.</Text>}
        {entity.workspaceId && !merge && !isDone(entity, detail) && <Text dimColor>Checking merge status…</Text>}
        {merge && <Text wrap="wrap">{mergeSummary(merge)}</Text>}
        {diverged.map(item => (
          <Box gap={1}>
            <Text dimColor>
              {'  '}
              {item.type} {item.name}
            </Text>
            {base && entity.workspaceId && <Link href={compareUrl(base, entity.workspaceId, merge?.to ?? DEFAULT_TARGET, name, item)} label="Compare" />}
          </Box>
        ))}
        <Text bold>Tests and flows on this branch</Text>
        {members.length === 0 && <Text dimColor>None tracked in this session yet.</Text>}
        {members.slice(0, room).map(member => (
          <Box gap={1}>
            <Text>
              {KIND_LABEL[member.kind]} {member.name ?? member.id}
              {member.status ? ` · ${member.status}` : ''}
            </Text>
            {member.url && <Link href={member.url} label="Open" />}
          </Box>
        ))}
        {members.length > room && <Text dimColor>… {members.length - room} more</Text>}
      </Box>
    )
  },
}
