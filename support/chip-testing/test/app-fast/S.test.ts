/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { edit } from "@matter/testing";

describe("S", () => {
    before(async () => {
        // Chip deprecated CurrentScene, CurrentGroup and SceneValid and expects the unset values a server reports once
        // it no longer tracks them.  We implement ScenesManagement revision 1, which still tracks them, so restore the
        // expectation for that revision.  Upstream branches on the cluster revision in
        // https://github.com/project-chip/connectedhomeip/pull/73552 — once that lands these are the values its
        // revision 1 branch asserts and this edit becomes a no-op
        await chip
            .testFor("S/2.2")
            .edit(
                edit.sed(
                    "s/CurrentScene: 0xFF,/CurrentScene: 0x01,/",
                    "s/CurrentGroup: 0x00,/CurrentGroup: G1,/",
                    "s/SceneValid: false,/SceneValid: true,/",
                ),
            );
    });

    chip("S/*");
});
