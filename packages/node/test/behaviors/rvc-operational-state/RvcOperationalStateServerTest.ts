/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RvcOperationalStateServer } from "#behaviors/rvc-operational-state";
import { RvcOperationalState } from "#clusters/rvc-operational-state";
import { RvcRunMode } from "#clusters/rvc-run-mode";
import { RoboticVacuumCleanerDevice } from "#devices/robotic-vacuum-cleaner";
import { Endpoint } from "#endpoint/Endpoint.js";
import { NotImplementedError } from "#general";
import { MockServerNode } from "../../node/mock-server-node.js";

const DeviceType = RoboticVacuumCleanerDevice;

async function createNode(options?: Endpoint.Options<typeof DeviceType>) {
    const node = await MockServerNode.create();
    if (!options) {
        options = {};
    }

    const rvcRunMode = options.rvcRunMode ?? {};
    options.rvcRunMode = {
        supportedModes: [
            {
                label: "Idle",
                mode: 0,
                modeTags: [{ value: RvcRunMode.ModeTag.Idle }],
            },
            {
                label: "Cleaning",
                mode: 1,
                modeTags: [{ value: RvcRunMode.ModeTag.Cleaning }],
            },
        ],
        currentMode: 0,
        ...rvcRunMode,
    };

    const rvcOperationalState = options.rvcOperationalState ?? {};
    options.rvcOperationalState = {
        operationalStateList: [{ operationalStateId: RvcOperationalState.OperationalState.Error }],
        operationalState: RvcOperationalState.OperationalState.Error,
        ...rvcOperationalState,
    };

    const endpoint = await node.add(DeviceType, options);

    return { node, endpoint };
}

describe("RvcOperationalState", () => {
    it("supports base commands", async () => {
        const { endpoint } = await createNode();
        await endpoint.act(agent => {
            expect(typeof agent.rvcOperationalState.pause).equals("function");
            expect(() => agent.rvcOperationalState.pause()).throws(NotImplementedError);
        });
    });

    it("knows methods are methods", () => {
        // Type-only test to ensure override works
        class MyOperationalStateServer extends RvcOperationalStateServer {
            override pause() {
                return {} as RvcOperationalState.OperationalCommandResponse;
            }
        }

        MyOperationalStateServer satisfies {};
    });
});
