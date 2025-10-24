/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "SoftwareVersionCertificationStatusEnum", xref: "core§11.23.8.2",
    details: "The values 0 through 2 shall correspond to the values 0 through 2 used in certification_type in the " +
        "Certification Declaration.",

    children: [
        {
            tag: "field", name: "DevTest",
            description: "used for development and test purposes (These will typically not be placed in DCL)"
        },
        {
            tag: "field", name: "Provisional",
            description: "used for a SoftwareVersion when going into certification testing (These might or might not be placed in DCL, depending on the Connectivity Standards Alliance policy and procedures)"
        },
        { tag: "field", name: "Certified", description: "used for a SoftwareVersion which has been certified" },
        { tag: "field", name: "Revoked", description: "used for a SoftwareVersion which has been revoked" }
    ]
});
