/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { MicrowaveOvenControlServer } from "@matter/main/behaviors/microwave-oven-control";
import { MicrowaveOvenModeServer } from "@matter/main/behaviors/microwave-oven-mode";
import { MicrowaveOvenMode, OperationalState } from "@matter/main/clusters";
import { MicrowaveOvenDevice } from "@matter/main/devices/microwave-oven";
import { EndpointNumber } from "@matter/main/types";
import { TestOperationalStateServer } from "../cluster/TestOperationalStateServer.js";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

// MicrowaveOvenControl has no command implementation in matter.js, so MWOCTRL tests need SetCookingParameters and
// AddMoreTime before they can run against this device.
const MicrowaveOven = MicrowaveOvenDevice.with(
    TestOperationalStateServer.enable({ attributes: { countdownTime: true } }),
    MicrowaveOvenModeServer,
    MicrowaveOvenControlServer.with("PowerInWatts"),
);

registerDeviceType({
    name: "microwave-oven",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(MicrowaveOven, {
            number: endpoint,
            operationalState: {
                phaseList: ["Starting", "Operating", "Finishing"],
                currentPhase: 0,
                operationalStateList: [
                    { operationalStateId: OperationalState.OperationalStateEnum.Stopped },
                    { operationalStateId: OperationalState.OperationalStateEnum.Running },
                    { operationalStateId: OperationalState.OperationalStateEnum.Paused },
                    { operationalStateId: OperationalState.OperationalStateEnum.Error },
                ],
                operationalState: OperationalState.OperationalStateEnum.Stopped,
                countdownTime: null,
            },
            microwaveOvenMode: {
                supportedModes: [
                    { label: "Normal", mode: 0, modeTags: [{ value: MicrowaveOvenMode.ModeTag.Normal }] },
                    { label: "Defrost", mode: 1, modeTags: [{ value: MicrowaveOvenMode.ModeTag.Defrost }] },
                ],
                currentMode: 0,
            },
            microwaveOvenControl: {
                cookTime: 30,
                maxCookTime: 3600,
                wattRating: 1000,
                supportedWatts: [1000],
                selectedWattIndex: 0,
            },
        });
        await serverNode.add(ep);

        return { endpoint: ep };
    },
});
