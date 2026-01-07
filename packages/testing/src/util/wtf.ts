/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export const wtf = {
    async initialize() {
        // This will only work under actual Node.js
        if (typeof process !== "object" || process?.release?.name !== "node") {
            return;
        }

        // We process args and environment manually so we don't need dependencies and can install wtfnode as early as
        // possible
        if (!process.argv.includes("--wtf") && !process.env.MATTER_WTF) {
            return;
        }

        const { dump } = await import("wtfnode");
        this.dump = () => dump();
    },

    dump() {},
};
