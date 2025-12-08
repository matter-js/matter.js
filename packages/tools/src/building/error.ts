/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export class InternalBuildError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export class BuildError extends Error {
    constructor(readonly diagnostics?: string) {
        super();
    }

    override get stack() {
        return this.diagnostics ?? super.stack;
    }

    override toString() {
        return this.diagnostics ?? "Build error";
    }

    inspect() {
        return this.toString();
    }
}
