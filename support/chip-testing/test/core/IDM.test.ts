/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AllClustersFullMaxIntervalApp } from "../support.js";

describe("IDM", () => {
    chip("IDM/*").exclude(
        // IDM 10.4 in TC_pics_checker.py appears to fail because it needs an endpoint ID specified
        // TODO - we could look at wiring this but would need to select the endpoints to check and manually create runs
        // ...and if I was going to do anything automatically with PICS I would probably generate from device
        "IDM/10.4",
        // Our AllClustersApp has extra clusters on endpoints for testing; pass fail_on_extra_clusters:False below
        "IDM/10.5",
        // Registered below on its own subject
        "IDM/1.5",
        // Registered below with its own arguments
        "IDM/13.1",
    );
    // Selects the runs of multi-run tests, which "IDM/*" does not
    chip("IDM/*/run*").exclude("IDM/10.4/*", "IDM/10.5/*", "IDM/1.5/*").exclude("IDM/*/run1").exclude(
        // Runs for CHIP apps matter.js has no test subject for: camera, electrical-protection, evse, lighting-app-no-unique-id, lock, microwave-oven, network-management, and the all-devices default
        // device (run16)
        // run19 places every device below a bridged node ("*,parent=1,bridged"), which the all-devices app lacks
        "IDM/10.1/run19",
        "IDM/11.1/run19",
        "IDM/12.1/run19",
        "IDM/10.1/run16",
        "IDM/11.1/run16",
        "IDM/12.1/run16",
        "IDM/2.2/run3",
        "IDM/2.2/run4",
        "IDM/4.3/run3",
        "IDM/4.3/run4",
        "IDM/9.1/run3",
        "IDM/9.1/run4",
        "IDM/10.1/run2",
        "IDM/10.1/run3",
        "IDM/10.1/run4",
        "IDM/10.1/run5",
        "IDM/10.1/run6",
        "IDM/10.1/run7",
        "IDM/10.1/run8",
        "IDM/10.1/run10",
        "IDM/10.1/run12",
        "IDM/10.1/run14",
        "IDM/10.1/run15",
        "IDM/10.1/run20",
        "IDM/10.2/run1",
        "IDM/10.6/run1",
        "IDM/11.1/run2",
        "IDM/11.1/run3",
        "IDM/11.1/run4",
        "IDM/11.1/run5",
        "IDM/11.1/run6",
        "IDM/11.1/run7",
        "IDM/11.1/run8",
        "IDM/11.1/run10",
        "IDM/11.1/run12",
        "IDM/11.1/run14",
        "IDM/11.1/run15",
        "IDM/11.1/run20",
        "IDM/12.1/run2",
        "IDM/12.1/run3",
        "IDM/12.1/run4",
        "IDM/12.1/run5",
        "IDM/12.1/run6",
        "IDM/12.1/run7",
        "IDM/12.1/run8",
        "IDM/12.1/run10",
        "IDM/12.1/run12",
        "IDM/12.1/run14",
        "IDM/12.1/run15",
        "IDM/12.1/run20",
        "IDM/14.1/run1",
    );
    chip("IDM/*/run1").exclude(
        // Spec issues for DoorLock, see https://github.com/CHIP-Specifications/connectedhomeip-spec/issues/11712
        //  Summary: the command responses from command 0xa and 0x15 have "wider" conformance than the requests which
        //           leads to the effect that the responses are expected to be present but are not because we do not
        //           have the requests. After Spec fix of conformance, the chip model used in test will match again
        "IDM/10.2/*",
    );
    // AllClustersApp intentionally adds clusters beyond what OnOffLightDevice requires,
    // so disable strict extra-cluster checking
    chip("IDM/10.5").args("--bool-arg", "fail_on_extra_clusters:False");
    // No lock subject is registered, so IDM 13.1 runs on AllClustersApp, which serves CHIP's UnitTesting cluster
    chip("IDM/13.1").args("--bool-arg", "pixit_allow_unit_testing_cluster:True");
    // IDM 1.5 exercises DelayReportData, which the forward features enabled in support.ts switch on.  It asserts that the
    // negotiated MaxInterval equals its requested ceiling of 3600 s, which the default subject does not grant
    chip("IDM/1.5").subject(AllClustersFullMaxIntervalApp);
});
