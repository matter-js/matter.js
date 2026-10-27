/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { type CertRunSetup, flavorFamily } from "@matter/testing";

/**
 * The skip reason of a step that needs `UnitTestingCluster`, or `undefined` where the TH has it.
 *
 * Only CHIP's all-clusters app serves the cluster. The step declares this as its `notApplicable`, which the engine
 * reports before any controller gate, so on a matter.js TH the reason is the TH's and not the controller's.
 */
export function unitTestingNotApplicable(setup: Pick<CertRunSetup, "deviceFlavor">): string | undefined {
    return flavorFamily(setup.deviceFlavor) === "chip"
        ? undefined
        : "the matter.js all-clusters app has no UnitTesting cluster";
}

/** The endpoint CHIP's all-clusters app serves `UnitTestingCluster` on (`all-clusters-app.matter`). */
export const UNIT_TESTING_ENDPOINT = 1;

/**
 * The one value each entry of `list_long_octet_string` may hold: the TH rejects any other entry
 * (`WriteListLongOctetStringAttribute` in CHIP's `test-cluster-server.cpp`).
 */
export const LONG_OCTET_STRING_ENTRY = Bytes.fromString("0123456789abcdef".repeat(32));
