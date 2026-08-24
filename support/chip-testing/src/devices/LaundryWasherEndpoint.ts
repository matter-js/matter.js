/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { LaundryWasherControlsServer } from "@matter/main/behaviors/laundry-washer-controls";
import { LaundryWasherModeServer } from "@matter/main/behaviors/laundry-washer-mode";
import { LaundryWasherControls, LaundryWasherMode, OperationalState } from "@matter/main/clusters";
import { LaundryWasherDevice } from "@matter/main/devices/laundry-washer";
import { EndpointNumber } from "@matter/main/types";
import { TestOperationalStateServer } from "../cluster/TestOperationalStateServer.js";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

const Washer = LaundryWasherDevice.with(
    TestOperationalStateServer.enable({ attributes: { countdownTime: true } }),
    LaundryWasherModeServer,
    LaundryWasherControlsServer.with("Spin", "Rinse"),
);

registerDeviceType({
    name: "laundry-washer",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(Washer, {
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
            laundryWasherMode: {
                supportedModes: [
                    { label: "Normal", mode: 0, modeTags: [{ value: LaundryWasherMode.ModeTag.Normal }] },
                    { label: "Delicate", mode: 1, modeTags: [{ value: LaundryWasherMode.ModeTag.Delicate }] },
                    { label: "Heavy", mode: 2, modeTags: [{ value: LaundryWasherMode.ModeTag.Heavy }] },
                ],
                currentMode: 0,
            },
            laundryWasherControls: {
                spinSpeeds: ["Off", "Low", "Medium", "High"],
                spinSpeedCurrent: 0,
                numberOfRinses: LaundryWasherControls.NumberOfRinses.Normal,
                supportedRinses: [
                    LaundryWasherControls.NumberOfRinses.None,
                    LaundryWasherControls.NumberOfRinses.Normal,
                    LaundryWasherControls.NumberOfRinses.Extra,
                ],
            },
        });
        await serverNode.add(ep);

        return { endpoint: ep };
    },
});
