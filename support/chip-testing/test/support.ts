/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, RuntimeService, StorageBackendMemory } from "@matter/main";
import { Subject } from "@matter/testing";
import { AllClustersTestInstance } from "../src/AllClustersTestInstance.js";
import { BridgeTestInstance } from "../src/BridgeTestInstance.js";
import { DeviceTestInstanceConstructor } from "../src/GenericTestApp.js";
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
    const factory = (domain: string) => {
        return new implementation({
            domain,
            storage: new StorageBackendMemory(),
            async commandPipeFactory(_subject, name) {
                await chip.openPipe(name);
            },
            discriminator: 3840,
            passcode: 20202021,
        });
    };

    factory.pics = implementation.pics;

    return factory;
}

export const AllClustersApp = App(AllClustersTestInstance);
export const BridgeApp = App(BridgeTestInstance);
export const TvApp = App(TvTestInstance);
export const RvcApp = App(RvcTestInstance);

chip.defaultSubject = AllClustersApp;
