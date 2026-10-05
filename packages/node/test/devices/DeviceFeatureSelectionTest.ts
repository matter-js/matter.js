/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import { EndpointType } from "#endpoint/type/EndpointType.js";
import { ClusterModel, FeatureSelectionErrors } from "@matter/model";
import * as devices from "../../src/devices/index.js";

/**
 * A device type's default behaviors must present a legal feature selection.  Codegen omits a cluster from the defaults
 * when the application has to choose features, so anything remaining must stand on its own.
 */
describe("device type feature selection", () => {
    it("every device type's default behaviors conform", () => {
        const offenders = new Array<string>();
        let judged = 0;

        for (const [name, device] of Object.entries(devices)) {
            if (!EndpointType.is(device)) {
                continue;
            }

            for (const type of Object.values(device.behaviors)) {
                if (!ClusterBehavior.is(type)) {
                    continue;
                }

                const schema = type.schema;
                if (!(schema instanceof ClusterModel)) {
                    continue;
                }

                judged++;
                for (const error of FeatureSelectionErrors(schema)) {
                    offenders.push(`${name}.${type.id}: ${error}`);
                }
            }
        }

        expect(judged, "judges the default cluster behaviors of the generated device types").greaterThan(100);
        expect(offenders).deep.equals([]);
    });

    // A device type that fixes the features of a mandatory cluster leaves the application nothing to choose
    it("includes a mandatory cluster whose features the device type fixes", () => {
        expect(defaultFeaturesOf(devices.WaterHeaterDevice, "thermostat")).deep.equals(["HEAT"]);
        expect(defaultFeaturesOf(devices.TemperatureControlledCabinetDevice, "temperatureControl")).deep.equals(["TN"]);
    });
});

function defaultFeaturesOf(device: EndpointType, behaviorId: string) {
    const type = device.behaviors[behaviorId];
    if (type === undefined || !ClusterBehavior.is(type)) {
        expect.fail(`${device.name} has no default ${behaviorId} cluster behavior`);
    }
    const schema = type.schema;
    expect(schema).instanceof(ClusterModel);
    return schema instanceof ClusterModel ? [...schema.supportedFeatures] : [];
}
