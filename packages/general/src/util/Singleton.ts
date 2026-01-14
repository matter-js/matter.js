/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export function singleton<T>(create: () => T) {
    let instance: T | undefined;
    return () => {
        if (instance === undefined) instance = create();
        return instance;
    };
}
