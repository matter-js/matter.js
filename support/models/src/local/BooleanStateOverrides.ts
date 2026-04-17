/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalMatter } from "../local.js";

LocalMatter.children.push({
    tag: "cluster",
    name: "BooleanState",

    children: [
        // Bump to revision 3: Introduced ChangeEvent feature
        { tag: "attribute", id: 0xfffd, name: "ClusterRevision", default: 3 },

        // New feature: CHGEVENT — supports reporting change events
        {
            tag: "attribute",
            id: 0xfffc,
            name: "FeatureMap",
            type: "FeatureMap",
            children: [
                {
                    tag: "field",
                    name: "CHGEVENT",
                    constraint: "0",
                    conformance: "P, M",
                    title: "ChangeEvent",
                    details: "Supports reporting change events via the StateChange event.",
                },
            ],
        },

        // StateChange event: conformance changes to require CHGEVENT feature
        // Mandatory when CHGEVENT feature active, otherwise optional (always present in type)
        { tag: "event", id: 0x00, name: "StateChange", conformance: "CHGEVENT, O" },
    ],
});
