/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LossKind } from "#util/model-digest.js";

/**
 * Removals from the generated model that we have looked at and accepted.
 *
 * Regenerating against a newer specification drops whatever that specification dropped, silently. An entry here is the
 * record that a particular loss was intended, and it is the only place the reason survives — the markdown the model is
 * generated from does not carry it.
 *
 * A `key` matches the path {@link digestOf} builds, which identifies an element by the identifier the specification
 * reserves for it — `datatype:status/field#140`, not its name, because a rename keeps the reservation. An element
 * with no identifier is keyed by name. A `revision` names the specification revision that removed it, so an entry
 * can be retired once we no longer generate that revision.
 *
 * Do not add an entry to make a build pass. An unexplained removal is the case this guard exists to catch.
 */
export interface AcknowledgedRemoval {
    key: string;

    /** What was lost. An entry excuses only the kind it names */
    kind: LossKind;

    /** The specification revision that removed it. An entry applies only while generating that revision */
    revision: string;

    reason: string;
}

export const AcknowledgedRemovals: AcknowledgedRemoval[] = [
    {
        key: "datatype:status/field#140",
        kind: "element",
        revision: "1.6.1",
        reason:
            "UnreportableAttribute. Matter 1.6.1 deletes status code 0x8c from the interaction model status " +
            "table. It remains in the 1.6.0 model because 1.6.0 defines it.",
    },
    {
        key: "datatype:status/field#197",
        kind: "element",
        revision: "1.6.1",
        reason:
            "NoUpstreamSubscription. Matter 1.6.1 deletes status code 0xc5 from the interaction model status " +
            "table. It remains in the 1.6.0 model because 1.6.0 defines it.",
    },
];
