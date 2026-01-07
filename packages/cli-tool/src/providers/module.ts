/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Directory, Stat } from "#stat.js";

Stat.provide(definition => {
    if (!isModule(definition)) {
        return;
    }

    return Directory({
        paths() {
            return Object.keys(definition);
        },

        definitionAt(path: string) {
            return definition[path];
        },
    });
});

function isModule(definition: unknown): definition is Record<string, unknown> {
    if (typeof definition !== "object" || definition === null) {
        return false;
    }
    return (definition as any)[Symbol.toStringTag] === "Module";
}
