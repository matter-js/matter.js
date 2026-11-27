/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DishwasherModeServer } from "#behaviors/dishwasher-mode";
import { OnOffPlugInUnitDevice } from "#devices/on-off-plug-in-unit";
import { Environment, LogLevel, MockStorageService, StorageService } from "@matter/general";
import { captureLog, MockServerNode } from "@matter/node/testing";
import { DishwasherMode } from "@matter/types/clusters/dishwasher-mode";

const DeviceType = OnOffPlugInUnitDevice.with(DishwasherModeServer);

function modes(...numbers: number[]) {
    return numbers.map(mode => ({
        label: `Mode ${mode}`,
        mode,
        modeTags: [{ value: DishwasherMode.ModeTag.Normal }],
    }));
}

async function createNode(supportedModes: number[], environment: Environment) {
    const node = await MockServerNode.createOnline(undefined, { id: "dishwasher", environment });
    await node.add(DeviceType, {
        id: "washer",
        dishwasherMode: { currentMode: supportedModes[0], supportedModes: modes(...supportedModes) },
    });
    return node;
}

describe("DishwasherModeServer", () => {
    // SupportedModes is fixed per firmware, so a stored CurrentMode can become unsupported after an update
    it("starts with the first supported mode when the stored CurrentMode is no longer supported", async () => {
        const environment = new Environment("test");
        environment.set(StorageService, new MockStorageService(environment));

        {
            await using node = await createNode([0, 1], environment);
            await node.parts.get("washer")!.act(agent => agent.get(DishwasherModeServer).changeToMode({ newMode: 1 }));
            expect(node.parts.get("washer")!.stateOf(DishwasherModeServer).currentMode).equals(1);
        }

        {
            using log = captureLog(LogLevel.WARN);
            await using node = await createNode([0, 2], environment);
            expect(node.parts.get("washer")!.stateOf(DishwasherModeServer).currentMode).equals(0);
            expect(log.messages.filter(message => message.includes("is not in supportedModes"))).length(1);
        }
    });
});
