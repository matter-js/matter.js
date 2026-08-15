/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/main";
import type { TimedInteractionOptions } from "@matter/testing";

/**
 * The timeout a timed interaction asks for, or `undefined` for an untimed one.
 *
 * Validated here so both adapters refuse the same values: the field is a `uint16` on the wire (Matter
 * Core § 10.6.11), which chip-tool's own argument bounds too, but matter.js's TLV layer checks bounds
 * without checking integrality — so a fractional timeout would reach one controller as a truncated
 * integer and the other as a usage error.
 */
export function timedInteractionTimeoutOf(options?: TimedInteractionOptions): number | undefined {
    const timeout = options?.timedInteractionTimeoutMs;
    if (timeout === undefined) {
        return undefined;
    }
    if (!Number.isInteger(timeout) || timeout < 0 || timeout > 0xffff) {
        throw new ImplementationError(`A timed interaction timeout must be an integer from 0 to 65535, not ${timeout}`);
    }
    return timeout;
}
