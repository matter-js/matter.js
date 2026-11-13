/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OccurrenceManager } from "@matter/main/protocol";
import { NodeTestInstance } from "../../src/NodeTestInstance.js";

describe("BINFO", () => {
    chip("BINFO/*").exclude("BINFO/2.2");

    // For BINFO 2.2 we need to clear events because otherwise test will fail due to duplicate startup events
    chip("BINFO/2.2").beforeStart(subject =>
        (subject as NodeTestInstance).node.env.get(OccurrenceManager).clear({ keepNumbering: true }),
    );
});
