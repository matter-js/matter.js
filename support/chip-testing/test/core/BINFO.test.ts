/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OccurrenceManager } from "@matter/main/protocol";
import { edit } from "@matter/testing";
import { NodeTestInstance } from "../../src/NodeTestInstance.js";

describe("BINFO", () => {
    // When CHIP moves to a newer protocol that we don't support we can move CHIP's version back here
    before(() =>
        chip.testFor("BINFO/2.1").edit(
            edit
                .sed
                //"s/value: 19/value: 18/",
                //"s/minValue: 0x01040000/minValue: 0x01030000/",
                //"s/maxValue: 0x0104FF00/maxValue: 0x0103FF00/",
                (),
        ),
    );

    chip("BINFO/*").exclude("BINFO/2.2");

    // For BINFO 2.2 we need to clear events because otherwise test will fail due to duplicate startup events
    chip("BINFO/2.2").beforeStart(subject => (subject as NodeTestInstance).node.env.get(OccurrenceManager).clear());
});
