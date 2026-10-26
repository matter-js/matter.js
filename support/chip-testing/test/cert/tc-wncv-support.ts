/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize } from "@matter/main";
import { Matter } from "@matter/model";
import type { CertStepContext } from "@matter/testing";
import { commissionThStep } from "./tc-dd-support.js";
import { attempt, CommissionedRefs, describeValue, record, requireId } from "./tc-support.js";

export const WINDOW_COVERING = Matter.clusters.require("WindowCovering");

/** Both THs put WindowCovering on endpoint 1. */
export const WINDOW_COVERING_ENDPOINT = 1;

/**
 * A precondition step for the WindowCovering client cases: the DUT commissions the TH (see {@link commissionThStep}),
 * reads the TH's FeatureMap, and fails when `unmet` names a precondition the TH's features do not meet.
 *
 * `unmet` gets the names of the features the TH has, as the model names them (`lift`, `positionAwareLift`, …).
 */
export function windowCoveringPreconditions(
    commissioned: CommissionedRefs,
    unmet: (features: ReadonlySet<string>) => string | undefined,
): (cx: CertStepContext) => Promise<void> {
    const commission = commissionThStep(commissioned);
    return async cx => {
        await commission(cx);

        const read = await attempt(
            () =>
                cx.controllers.dut.node(commissioned.require("dut")).readAttribute({
                    endpoint: WINDOW_COVERING_ENDPOINT,
                    cluster: requireId(WINDOW_COVERING.id, "WindowCovering cluster"),
                    attribute: requireId(
                        WINDOW_COVERING.attributes.require("featureMap").id,
                        "WindowCovering.featureMap",
                    ),
                }),
            value => `FeatureMap=${describeValue(value)}`,
        );
        if (!read.ok) {
            record(cx, read.check, "WindowCovering FeatureMap read");
            return;
        }

        const featureMap = read.value;
        const features = featureNames(featureMap);
        const failure =
            features === undefined
                ? `FeatureMap is ${describeValue(featureMap)}, which names no features`
                : unmet(features);
        record(
            cx,
            {
                type: "response",
                verdict: failure === undefined ? "pass" : "fail",
                detail: failure ?? `FeatureMap=${describeValue(featureMap)}`,
            },
            "the TH's WindowCovering features meet the preconditions",
        );
    };
}

/**
 * The names of the features a FeatureMap value sets, as the model names them, from either the decoded object of named
 * bits or the raw bitmap; `undefined` for a value that is neither.
 */
function featureNames(featureMap: unknown): ReadonlySet<string> | undefined {
    if (typeof featureMap === "number") {
        return new Set(
            WINDOW_COVERING.features
                .filter(
                    ({ constraint }) => typeof constraint.value === "number" && featureMap & (1 << constraint.value),
                )
                .map(feature => camelize(feature.title ?? feature.name)),
        );
    }
    if (typeof featureMap === "object" && featureMap !== null) {
        return new Set(
            Object.entries(featureMap)
                .filter(([, set]) => set === true)
                .map(([name]) => name),
        );
    }
    return undefined;
}
