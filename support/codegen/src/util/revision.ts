/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The name of a specification revision as intermediate model directories use it: at most three components, and no
 * trailing ".0" patch level, so "1.7.0" is "1.7".
 */
export function normalizeRevision(revision: string) {
    const components = revision.split(".");
    if (components.length > 3) {
        components.length = 3;
    }
    if (components.length > 2 && components[2] === "0") {
        components.length = 2;
    }
    return components.join(".");
}
