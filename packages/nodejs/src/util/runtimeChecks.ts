/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
// Some utilities for checking runtime feature.

/**
 * Check runtime is bun.js
 */
export function isBunjs() {
  return process.versions.bun != null
}

/**
 * Check Node.js's runtime supports sqlite.
 */
export function supportsSqlite() {
  const nodeVersion = process.versions.node
  if (!nodeVersion.includes(".")) {
    return false
  }
  const prefixPart = nodeVersion.substring(0, nodeVersion.indexOf("."))

  const majorNum = Number(prefixPart)
  if (Number.isNaN(majorNum)) {
    return false
  }
  // Don't need to check minor version because of minimum requirement version.
  return majorNum >= 22
}