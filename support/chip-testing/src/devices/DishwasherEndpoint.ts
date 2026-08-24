/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import { DishwasherMode, OperationalState } from "@matter/main/clusters";
import { DishwasherDevice } from "@matter/main/devices/dishwasher";
import { EndpointNumber } from "@matter/main/types";
import { BackchannelCommand } from "@matter/testing";
import { TestDishwasherModeServer } from "../cluster/TestDishwasherModeServer.js";
import { TestOperationalStateServer } from "../cluster/TestOperationalStateServer.js";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

const Dishwasher = DishwasherDevice.with(TestOperationalStateServer, TestDishwasherModeServer);

registerDeviceType({
    name: "dishwasher",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(Dishwasher, {
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
            },
            dishwasherMode: {
                supportedModes: [
                    { label: "Normal", mode: 0, modeTags: [{ value: DishwasherMode.ModeTag.Normal }] },
                    {
                        label: "Heavy",
                        mode: 1,
                        modeTags: [{ value: DishwasherMode.ModeTag.Heavy }, { value: DishwasherMode.ModeTag.Max }],
                    },
                    { label: "Light", mode: 2, modeTags: [{ value: DishwasherMode.ModeTag.Light }] },
                ],
                currentMode: 0,
            },
        });
        await serverNode.add(ep);

        return {
            endpoint: ep,
            async handleBackchannel(command: BackchannelCommand) {
                if (command.name !== "modeChange" || command.device !== "DishWasher") return;
                if (command.type !== "ToggleFailTransition") return;
                await ep.setStateOf(TestDishwasherModeServer, {
                    failTransition: !ep.stateOf(TestDishwasherModeServer).failTransition,
                });
                return true;
            },
        };
    },
});
