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
});
