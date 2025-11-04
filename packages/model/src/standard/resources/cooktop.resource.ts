/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "Cooktop", xref: "device§13.8",
    details: "A cooktop is a cooking surface that heats food either by transferring currents from an " +
        "electromagnetic field located below the glass surface directly to the magnetic induction cookware " +
        "placed above or through traditional gas or electric burners.",
    children: [
        { tag: "requirement", name: "Identify", xref: "device§13.8.5" },
        { tag: "requirement", name: "OnOff", xref: "device§13.8.5" },
        { tag: "requirement", name: "CookSurface", xref: "device§13.8.4" }
    ]
});
