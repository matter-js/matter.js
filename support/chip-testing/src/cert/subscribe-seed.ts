/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { UnexpectedDataError } from "@matter/main";
import { ReadResult, ResultStatus } from "@matter/main/protocol";
import type { AttributePathSpec } from "@matter/testing";

/**
 * The value a concrete-path subscribe resolves with, taken from its priming report.
 *
 * A status for the path, or no entry at all, rejects: the step asked for that attribute and got none, which every
 * adapter must report the same way.
 *
 * @see {@link CertNodeApi.subscribe}
 */
export function concreteSubscribeSeed(
    path: AttributePathSpec,
    values: ReadResult.AttributeValue[],
    statuses: ReadResult.AttributeStatus[],
): unknown {
    if (statuses.length > 0) {
        throw ResultStatus.errorOf(statuses[0], `subscribe ${JSON.stringify(path)} failed`);
    }
    if (values.length === 0) {
        throw new UnexpectedDataError(
            `The priming report of subscribe ${JSON.stringify(path)} has neither a value nor a status`,
        );
    }
    return values[0].value;
}
