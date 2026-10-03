import { expect } from 'claude-code/testing'

type Assert = {
  equal: (actual: unknown, expected: unknown, message?: string) => void
  deepEqual: (actual: unknown, expected: unknown, message?: string) => void
  match: (actual: string, pattern: RegExp, message?: string) => void
  doesNotMatch: (actual: string, pattern: RegExp, message?: string) => void
  ok: (value: unknown, message?: string) => asserts value
  fail: (message?: string) => never
}

const withMessage = (message: string | undefined, check: () => void): void => {
  try {
    check()
  } catch (failure) {
    throw message ? new Error(`${message}: ${String(failure)}`) : failure
  }
}

/** The few `node:assert` checks these tests use, on top of the test kit's `expect`. */
export const assert: Assert = {
  equal: (actual, expected, message) => withMessage(message, () => expect(actual).toBe(expected)),
  deepEqual: (actual, expected, message) => withMessage(message, () => expect(actual).toEqual(expected)),
  match: (actual, pattern, message) => withMessage(message, () => expect(actual).toMatch(pattern)),
  doesNotMatch: (actual, pattern, message) => withMessage(message, () => expect(actual).not.toMatch(pattern)),
  ok: (value: unknown, message?: string): asserts value => {
    if (!value) {
      throw new Error(message ?? 'expected a truthy value')
    }
  },
  fail: (message = 'unexpected call'): never => {
    throw new Error(message)
  },
}

type TreeNode = { tag: string; props: Record<string, unknown>; children: unknown[] }

/** Draws JSX as plain `{ tag, props, children }` objects, so a test can find a button by key and press it. */
export const stubJsx = (): void => {
  ;(globalThis as { h?: unknown }).h = (tag: string | { name: string }, props: Record<string, unknown> | null, ...children: unknown[]): TreeNode => ({
    tag: typeof tag === 'string' ? tag : tag.name,
    props: props ?? {},
    children: children.flat(),
  })
}
