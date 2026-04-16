/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Lightweight base class that carries a namespace identity for storage drivers.
 *
 * Filesystem-backed drivers use {@link DatafileRoot} (which extends this) to also manage directory locking.
 * Non-filesystem drivers (e.g. AsyncStorage, Web Storage) only need the namespace string.
 */
export class DataNamespace {
    readonly namespace: string;

    constructor(namespace: string) {
        this.namespace = namespace;
    }
}
