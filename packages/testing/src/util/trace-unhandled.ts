/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export const traceUnhandled = {
    async initialize() {
        // We process args and environment manually so we don't need dependencies and can install as early as possible
        if (!process.argv.includes("--trace-unhandled") && !process.env.MATTER_TRACE_UNHANDLED) {
            return;
        }

        const { register } = await import("trace-unhandled");
        register();
    },
};
