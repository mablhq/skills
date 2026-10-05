import type {HistoryItem, MablEntities, MablEntityKind} from '../types';
import {KIND_LABEL, num, obj, str, toHistoryItem} from '../core/util';

export const HISTORY_KEY = 'history';
export const HISTORY_LIMIT = 50;

const isKind = (value: unknown): value is MablEntityKind =>
  typeof value === 'string' && Object.hasOwn(KIND_LABEL, value);

/** A stored item rebuilt from known fields, or undefined when it is not one. */
const toItem = (value: unknown): HistoryItem | undefined => {
  const raw = obj(value);
  const id = str(raw.id);
  const seenAt = num(raw.seenAt);

  return id && seenAt !== undefined && isKind(raw.kind)
    ? {
        kind: raw.kind,
        id,
        name: str(raw.name),
        status: str(raw.status),
        url: str(raw.url),
        branch: str(raw.branch),
        workspaceId: str(raw.workspaceId),
        seenAt,
      }
    : undefined;
};

/** Valid stored items, one per id (the newest), newest first. */
const readHistory = (stored: unknown): HistoryItem[] => {
  const byId = new Map<string, HistoryItem>();
  for (const item of Array.isArray(stored) ? stored.map(toItem) : []) {
    if (item && item.seenAt > (byId.get(item.id)?.seenAt ?? -Infinity)) {
      byId.set(item.id, item);
    }
  }

  return [...byId.values()].sort((a, b) => b.seenAt - a.seenAt);
};

/** The stored history after this session's entities changed: each entity upserted, newest first, capped. */
export const mergeHistory = (
  previous: unknown,
  entities: MablEntities,
  now: number,
): HistoryItem[] => {
  const byId = new Map(readHistory(previous).map((item) => [item.id, item]));
  for (const entity of Object.values(entities)) {
    const seenAt = Math.max(
      num(entity.updatedAt) ?? now,
      byId.get(entity.id)?.seenAt ?? 0,
    );
    byId.set(entity.id, toHistoryItem(entity, seenAt));
  }

  return [...byId.values()]
    .sort((a, b) => b.seenAt - a.seenAt)
    .slice(0, HISTORY_LIMIT);
};

/** History items from earlier sessions, not already tracked in this one, newest first. */
export const recentItems = (
  history: unknown,
  entities: MablEntities,
): HistoryItem[] =>
  readHistory(history).filter((item) => !Object.hasOwn(entities, item.id));
