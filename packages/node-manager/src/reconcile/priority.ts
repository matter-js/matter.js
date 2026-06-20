/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ItemKind priority bands. Lower applies first, higher applies last (reverse on delete). ACLs go
 * last so subjects/keysets/groups they reference already exist. Dependent kinds slot in at 2b.
 */
export const PRIORITY_BANDS = {
    keyset: 10,
    group: 20,
    membership: 30,
    acl: 40,
} as const;
