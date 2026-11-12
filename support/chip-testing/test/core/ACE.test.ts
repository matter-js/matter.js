/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { edit } from "@matter/testing";

describe("ACE", () => {
    before(() =>
        chip.testFor("ACE/2.2").edit(
            edit.js(
                // Allow current Spec check order and old order
                // see https://github.com/project-chip/connectedhomeip/issues/33735
                str =>
                    str.replace(
                        "if resp[0].Status != Status.UnsupportedWrite:",
                        "if (resp[0].Status != Status.UnsupportedWrite and resp[0].Status != Status.UnsupportedAccess):",
                    ),
            ),
        ),
    );

    chip("ACE/*");

    // run1 = all-clusters-no-groupcast (legacy Groups path),
    // run2 = all-devices on-off-light + --groupcast (groupcast path).
    chip("ACE/*/run1");
    chip("ACE/*/run2");

    // Selects the remaining runs of multi-run tests
    chip("ACE/*/run*").exclude(
        "ACE/*/run1",
        "ACE/*/run2",

        // Runs for the CHIP camera app, which matter.js has no test subject for
        "ACE/1.6/run4",
    );
});
