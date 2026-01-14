/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "ScenesManagement",

    children: [
        /*
        This override is currently inactive till it is decided how names will be.

        In https://github.com/project-chip/connectedhomeip/pull/38003 SDK was adjusted to be like spec why this
        override is obsolete when it stays that way.

        Discussion is still open in see https://github.com/CHIP-Specifications/connectedhomeip-spec/issues/11386
        TODO Remove the override or not depending on outcome of above issue in Spec.

        // Field name for AddScene and ViewSceneResponse needs to be adjusted to match the 1.4 spec
        // ExtensionFieldSetStruct -> ExtensionFieldSets
        {
            tag: "command",
            id: 0x00,
            name: "AddScene",
            children: [{ tag: "field", id: 0x4, name: "ExtensionFieldSets" }],
        },
        {
            tag: "command",
            id: 0x01,
            name: "ViewSceneResponse",
            children: [{ tag: "field", id: 0x5, name: "ExtensionFieldSets" }],
        },
        */
    ],
});
