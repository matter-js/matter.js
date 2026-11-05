/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/** Membership intent key: per (group, endpoint) so one peer can join a group on several endpoints. */
export function membershipKey(groupId: number, endpoint: number): string {
    return `${groupId}:${endpoint}`;
}
