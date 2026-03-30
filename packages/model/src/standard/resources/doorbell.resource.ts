/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "Doorbell", xref: "device§16.9",
    details: "A Doorbell device is a switch which when pressed usually causes a Chime to activate.",
    children: [
        { tag: "requirement", name: "Identify", xref: "device§16.9.2.1" },
        { tag: "requirement", name: "Switch", xref: "device§16.9.2.1" },
        { tag: "requirement", name: "Chime", xref: "device§16.9.2.1" }
    ]
});
