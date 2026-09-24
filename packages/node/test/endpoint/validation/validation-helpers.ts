/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DescriptorServer } from "#behaviors/descriptor";
import { RefrigeratorDevice } from "#devices/refrigerator";
import { TemperatureControlledCabinetDevice } from "#devices/temperature-controlled-cabinet";
import { Endpoint } from "#endpoint/Endpoint.js";
import { ConditionAssertions } from "#endpoint/validation/ConditionAssertions.js";
import { DeviceTypeConformance } from "#endpoint/validation/DeviceTypeConformance.js";
import { ImplementationError } from "@matter/general";
import { Matter, MatterModel } from "@matter/model";
import { DeviceTypeId } from "@matter/types";
import { MockServerNode } from "../../node/mock-server-node.js";

/**
 * A started node whose root carries no application endpoint, so each test builds exactly the tree it describes.
 */
export async function createNode() {
    return MockServerNode.createOnline(undefined, { device: undefined });
}

/**
 * A Descriptor `DeviceTypeList` of standard device types named as the model names them, or of raw IDs for device
 * types the model does not define.
 */
export function deviceTypeList(...deviceTypes: (string | number)[]) {
    return deviceTypes.map(deviceType => {
        if (typeof deviceType === "number") {
            return { deviceType: DeviceTypeId(deviceType), revision: 1 };
        }

        const model = Matter.deviceTypes(deviceType);
        if (model === undefined) {
            throw new ImplementationError(`Test fixture names unknown device type ${deviceType}`);
        }
        return { deviceType: DeviceTypeId(model.id), revision: model.revision };
    });
}

/**
 * A refrigerator with {@link cabinets} temperature controlled cabinets as its children.
 *
 * With {@link fullFamily} the refrigerator also lists the Aggregator device type, which composes its `PartsList` of
 * every descendant rather than its children.
 */
export async function addRefrigerator(
    parent: Endpoint,
    { cabinets = 2, fullFamily = false }: { cabinets?: number; fullFamily?: boolean } = {},
) {
    const fridge = await parent.add(RefrigeratorDevice.with(DescriptorServer), {
        id: "fridge",
        ...(fullFamily ? { descriptor: { deviceTypeList: deviceTypeList("Refrigerator", "Aggregator") } } : {}),
    });

    const added = new Array<Endpoint>();
    for (let i = 0; i < cabinets; i++) {
        added.push(await addCabinet(fridge, `cabinet${i}`));
    }

    return { fridge, cabinets: added };
}

/**
 * A temperature controlled cabinet with a valid temperature range.
 */
export async function addCabinet(parent: Endpoint, id: string) {
    return parent.add(TemperatureControlledCabinetDevice, {
        id,
        temperatureControl: { minTemperature: 0, maxTemperature: 1000, temperatureSetpoint: 400 },
    });
}

/**
 * The violations {@link DeviceTypeConformance.check} finds on {@link endpoint}, with conditions collected across the
 * node scope of the tree's root, both resolved in {@link model}.
 */
export function violationsOf(endpoint: Endpoint, model: MatterModel = Matter) {
    let root = endpoint;
    while (root.owner !== undefined) {
        root = root.owner;
    }
    return DeviceTypeConformance.check(endpoint, ConditionAssertions.collect(root, model).conditions, model);
}
