/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EnergyEvseModeServer } from "#behaviors/energy-evse-mode";
import { EnergyEvseMode } from "#clusters/energy-evse-mode";
import { ModeBase } from "#clusters/mode-base";
import { OnOffPlugInUnitDevice } from "#devices/on-off-plug-in-unit";
import { Endpoint } from "#endpoint/Endpoint.js";
import { MockServerNode } from "../../node/mock-server-node.js";

const DeviceType = OnOffPlugInUnitDevice.with(EnergyEvseModeServer);

async function createNode(options?: Endpoint.Options<typeof DeviceType>) {
    const node = await MockServerNode.create();
    if (!options) {
        options = {};
    }
    const energyEvseMode = options.energyEvseMode ?? {};
    options.energyEvseMode = {
        currentMode: 0,
        supportedModes: [
            {
                label: "Manual",
                mode: 0,
                modeTags: [
                    {
                        value: EnergyEvseMode.ModeTag.Manual,
                    },
                ],
            },
            {
                label: "Quick",
                mode: 1,
                modeTags: [
                    {
                        value: EnergyEvseMode.ModeTag.TimeOfUse,
                    },
                ],
            },
        ],

        ...energyEvseMode,
    };

    const endpoint = await node.add(DeviceType, options);

    return { node, endpoint };
}

describe("EnergyEvseModeServer", () => {
    it("accepts local mode tags", async () => {
        const { node } = await createNode();
        await node.start();
        await node.close();
    });

    it("supports inherited commands", async () => {
        const { endpoint } = await createNode();
        await endpoint.act(agent => {
            const { energyEvseMode } = agent;
            expect(typeof energyEvseMode.changeToMode === "function");
        });
    });

    it("supports extension of inherited commands", () => {
        // Type-only override to verify command typing
        class MyChangeToModeServer extends EnergyEvseModeServer {
            override changeToMode(): ModeBase.ChangeToModeResponse {
                return {} as ModeBase.ChangeToModeResponse;
            }
        }

        MyChangeToModeServer satisfies typeof EnergyEvseModeServer;
    });
});
