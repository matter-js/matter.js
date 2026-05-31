/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "CertificationTypeEnum", xref: "core§11.23.5.9.1",

    children: [
        { tag: "field", name: "DeviceAttestationPki", description: "used for Device Attestation PKI (PAA/PAI)" },
        { tag: "field", name: "OperationalPki", description: "used for Operational PKI (RCAC/ICAC)" },
        {
            tag: "field", name: "VidSignerPki",
            description: "used for Vendor ID Verification Signer Certificate (VVSC)"
        }
    ]
});
