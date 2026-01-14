/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SqliteStorageError } from "./SqliteStorageError.js"

/**
 * Build string context path from contexts[]
 * @param contexts Contexts
 * @returns `.` joined context path
 */
export function buildContextPath(contexts: string[]) {
  for (const ctx of contexts) {
    if (ctx.trim().length <= 0 || ctx.includes(".")) {
      throw new SqliteStorageError(
        "build", `{${contexts.join(",")}}`,
        "Context must not be an empty and not contain dots."
      )
    }
  }
  return contexts.join(".")
}

/**
 * Build Context & Key pair
 * @param contexts Contexts
 * @param key Key
 */
export function buildContextKeyPair(contexts: string[], key: string) {
  return {
    context: buildContextPath(contexts),
    key: buildKey(key),
  }
}

/**
 * Build Context & Key *log* path
 */
export function buildContextKeyLog(contexts: string[], key: string) {
  return `${buildContextPath(contexts)}$${key}` // use in log only
}

/**
 * Build key (just verification)
 */
export function buildKey(key: string) {
  if (key.trim().length <= 0) {
    throw new SqliteStorageError(
      "build", key,
      "Key must not be an empty string."
    )
  }
  return key
}

/**
 * Escape string for Glob
 */
export function escapeGlob(value: string) {
  return value.replace(/[*[?]/g, "[$&]")
}

/**
 * Ensure extensions of `path`
 */
export function ensureExtension(path: string, extension: string[]) {
  if (extension.length <= 0) {
    return path
  }

  for (const ext of extension) {
    if (path.endsWith(`.${ext}`)) {
      return path
    }
  }
  return `${path}.${extension[0]}`
}