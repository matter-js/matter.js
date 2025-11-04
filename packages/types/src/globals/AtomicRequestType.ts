/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

/**
 * @see {@link MatterSpecification.v142.Core} § 7.15.4
 */
export enum AtomicRequestType {
    /**
     * Begin an atomic write
     */
    BeginWrite = 0,

    /**
     * Commit an atomic write
     */
    CommitWrite = 1,

    /**
     * Rollback an atomic write, discarding any pending changes
     */
    RollbackWrite = 2
}
