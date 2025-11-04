/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "OvenCavityOperationalState", pics: "OVENOPSTATE", xref: "cluster§8.10",
    details: "This cluster is derived from the Operational State cluster and provides an interface for monitoring " +
        "the operational state of an oven.",

    children: [
        { tag: "command", name: "Pause", xref: "cluster§8.10.5" },
        { tag: "command", name: "Stop", xref: "cluster§8.10.5" },
        { tag: "command", name: "Start", xref: "cluster§8.10.5" },
        { tag: "command", name: "Resume", xref: "cluster§8.10.5" },
        { tag: "command", name: "OperationalCommandResponse", xref: "cluster§8.10.5" }
    ]
});
