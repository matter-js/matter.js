/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Task } from "#task/Task.js";
import { TaskPhase } from "#task/types.js";

/** A synthetic task whose phases are supplied inline; for unit-testing the manager/driver. */
export class SyntheticTask extends Task<{ tag: string }> {
    static phasesByTag: Record<string, TaskPhase[]> = {};
    override readonly type = "synthetic";
    override get phases() {
        return SyntheticTask.phasesByTag[this.params.tag] ?? new Array<TaskPhase>();
    }
    static override idFor(params: { tag: string }) {
        return `synthetic:${params.tag}`;
    }
}
