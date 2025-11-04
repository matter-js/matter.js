/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "RoboticVacuumCleaner", xref: "device§12.1",
    details: "This defines conformance for the Robotic Vacuum Cleaner device type.",

    children: [
        { tag: "requirement", name: "Identify", xref: "device§12.1.4" },
        { tag: "requirement", name: "RvcRunMode", xref: "device§12.1.4" },
        { tag: "requirement", name: "RvcCleanMode", xref: "device§12.1.4" },
        { tag: "requirement", name: "RvcOperationalState", xref: "device§12.1.4" },
        { tag: "requirement", name: "ServiceArea", xref: "device§12.1.4" }
    ]
});
