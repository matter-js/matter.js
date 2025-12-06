/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

describe("IDM", () => {
    chip("IDM/*").exclude(
        // IDM 10.4 in TC_pics_checker.py appears to fail because it needs an endpoint ID specified
        // TODO - we could look at wiring this but would need to select the endpoints to check and manually create runs
        // ...and if I was going to do anything automatically with PICS I would probably generate from device
        "IDM/10.4",
    );
    chip("IDM/*/run1").exclude(
        // Spec issues for DoorLock, see https://github.com/CHIP-Specifications/connectedhomeip-spec/issues/11712
        //  Summary: the command responses from command 0xa and 0x15 have "wider" conformance than the requests which
        //           leads to the effect that the responses are expected to be present but are not because we do not
        //           have the requests. After Spec fix of conformance, the chip model used in test will match again
        "IDM/10.2/*",
    );
});
