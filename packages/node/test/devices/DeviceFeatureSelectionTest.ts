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

        for (const [name, device] of Object.entries(devices)) {
            if (typeof device !== "function" || !("behaviors" in device)) {
                continue;
            }

            for (const type of Object.values((device as EndpointType).behaviors ?? {})) {
                if (!ClusterBehavior.is(type)) {
                    continue;
                }

                const schema = type.schema;
                if (!(schema instanceof ClusterModel)) {
                    continue;
                }

                for (const error of FeatureSelectionErrors(schema)) {
                    offenders.push(`${name}.${type.id}: ${error}`);
                }
            }
        }

        expect(offenders).deep.equals([]);
    });
});
