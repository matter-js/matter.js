/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Val } from "@matter/protocol";
import type { ValReference } from "./ValReference.js";

/**
 * API for bypassing managed collections and accessing the internal object containing raw data.
 */
export namespace Internal {
    export const reference = Symbol("reference");
    export const session = Symbol("session");

    export interface Collection {
        [reference]: ValReference<Val.Collection>;
    }

    /**
     * Recursively unwrap managed proxies in a value tree, returning raw data.
     *
     * Primitives, Uint8Array, Date, and other non-plain objects pass through unchanged.  Plain
     * arrays and plain objects are walked; a new container is only allocated if a child was replaced.
     */
    export function unmanage(value: Val): Val {
        if (value === null || value === undefined || typeof value !== "object") {
            return value;
        }

        // Unwrap managed proxy to its raw value, then continue walking
        const ref = (value as Collection)[reference];
        if (ref) {
            return unmanage(ref.value);
        }

        if (Array.isArray(value)) {
            let changed = false;
            const result = new Array(value.length);

            for (let i = 0; i < value.length; i++) {
                const child = unmanage(value[i]);
                if (child !== value[i]) {
                    changed = true;
                }
                result[i] = child;
            }

            return changed ? result : value;
        }

        const proto = Object.getPrototypeOf(value);
        if (proto === Object.prototype || proto === null) {
            let changed = false;
            const result = {} as Record<string, Val>;

            for (const key in value as Record<string, Val>) {
                const child = unmanage((value as Record<string, Val>)[key]);
                if (child !== (value as Record<string, Val>)[key]) {
                    changed = true;
                }
                result[key] = child;
            }

            return changed ? result : value;
        }

        return value;
    }
}
