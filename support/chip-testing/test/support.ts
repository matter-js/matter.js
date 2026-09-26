/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, RuntimeService } from "@matter/main";
import { Subject } from "@matter/testing";
import { AllClustersNoGroupcastTestInstance, AllClustersTestInstance } from "../src/AllClustersTestInstance.js";
import { AllDevicesTestInstance } from "../src/AllDevicesTestInstance.js";
import { BridgeTestInstance } from "../src/BridgeTestInstance.js";
import { DeviceTestInstanceConstructor } from "../src/GenericTestApp.js";
import { IcdTestInstance } from "../src/IcdTestInstance.js";
import { NodeTestInstance } from "../src/NodeTestInstance.js";
import { RvcTestInstance } from "../src/RvcTestInstance.js";
import { TvTestInstance } from "../src/TvTestInstance.js";

chip.onClose(async () => {
    // Terminate and/or wait for any long-running services such as MdnsService
    await Environment.default.maybeGet(RuntimeService)?.close();
});

NodeTestInstance.forceFastTimeouts = true;
NodeTestInstance.nonvolatileEvents = true;
NodeTestInstance.testEnableKey = "000102030405060708090a0b0c0d0e0f";

export function App(implementation: DeviceTestInstanceConstructor<NodeTestInstance>): Subject.Factory {
    const factory: Subject.Factory = (domain: string, options?: Subject.Options) => {
        return new implementation({
            domain,
            async commandPipeFactory(_subject, name) {
                await chip.openPipe(name);
            },
            discriminator: 3840,
            passcode: 20202021,
            appArgs: options?.appArgs,
        });
    };

    factory.pics = implementation.pics;

    return factory;
}

export const AllClustersApp = App(AllClustersTestInstance);
export const AllClustersNoGroupcastApp = App(AllClustersNoGroupcastTestInstance);
export const AllDevicesApp = App(AllDevicesTestInstance);
export const BridgeApp = App(BridgeTestInstance);
export const TvApp = App(TvTestInstance);
export const RvcApp = App(RvcTestInstance);
export const LitIcdApp = App(IcdTestInstance);

// chip-test-header app names (after generate-test-descriptor normalization: strip ${...},
// CHIP_/_APP affixes, lower-kebab-case) → factory. When a python test descriptor names an
// app via chip header `app: ${FOO_APP}`, the framework dispatches to the matching factory.
chip.subjectFor("all-clusters", AllClustersApp);
chip.subjectFor("all-clusters-no-groupcast", AllClustersNoGroupcastApp);
chip.subjectFor("all-devices", AllDevicesApp);
chip.subjectFor("bridge", BridgeApp);
chip.subjectFor("tv", TvApp);
chip.subjectFor("rvc", RvcApp);
chip.subjectFor("lit-icd", LitIcdApp);

chip.defaultSubject = AllClustersApp;
