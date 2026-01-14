/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "./ActionContext.js";

/**
 * Components may implement this interface to convey any associated {@link ActionContext}.
 */
export interface Contextual {
    [Contextual.context]?: ActionContext;
}

export namespace Contextual {
    export const context = Symbol("association");

    export function contextOf(subject: unknown) {
        if (subject === undefined || subject === null) {
            return;
        }
        return (subject as Contextual)[Contextual.context];
    }

    export function setContextOf(subject: {}, context?: ActionContext) {
        (subject as Contextual)[Contextual.context] = context;
    }
}
