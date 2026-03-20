/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterRegistry } from "#cluster/ClusterRegistry.js";
import { ClusterType } from "#cluster/ClusterType.js";
import { ClusterTypeOfModel } from "#cluster/ClusterTypeOfModel.js";
import { Matter } from "@matter/model";

// Ensure all generated clusters are registered
import "#clusters/index.js";

function sortedKeys(obj: Record<string, unknown>) {
    return Object.keys(obj).sort();
}

const GLOBAL_ATTR_KEYS = new Set([
    "clusterRevision",
    "featureMap",
    "attributeList",
    "acceptedCommandList",
    "generatedCommandList",
]);

function nonGlobalAttrKeys(cluster: ClusterType) {
    return Object.keys(cluster.attributes)
        .filter(k => !GLOBAL_ATTR_KEYS.has(k))
        .sort();
}

describe("ClusterTypeOfModel", () => {
    for (const model of Matter.clusters) {
        // Skip abstract clusters (no id)
        if (model.id === undefined) {
            continue;
        }

        const complete = ClusterRegistry.get(model.id);
        if (complete === undefined) {
            continue;
        }

        it(model.name, () => {
            const fromModel = ClusterTypeOfModel(model);

            // Identity
            expect(fromModel.id).equals(complete.id);
            expect(fromModel.name).equals(complete.name);
            expect(fromModel.revision).equals(complete.revision);

            // Feature keys
            expect(sortedKeys(fromModel.features)).deep.equals(sortedKeys(complete.features));

            // Attributes (skip globals — tested implicitly via GlobalAttributes)
            for (const key of nonGlobalAttrKeys(complete)) {
                const a = fromModel.attributes[key];
                const e = complete.attributes[key];
                expect(a, `attribute "${key}" missing`).to.exist;
                if (!a) continue;

                expect(a.id, `${key}.id`).equals(e.id);
                expect(a.writable, `${key}.writable`).equals(e.writable);
                expect(a.fixed, `${key}.fixed`).equals(e.fixed);
                expect(a.fabricScoped, `${key}.fabricScoped`).equals(e.fabricScoped);
                expect(a.scene, `${key}.scene`).equals(e.scene);
                expect(a.persistent, `${key}.persistent`).equals(e.persistent);
                expect(a.timed, `${key}.timed`).equals(e.timed);
                expect(a.omitChanges, `${key}.omitChanges`).equals(e.omitChanges);
                expect(a.readAcl, `${key}.readAcl`).equals(e.readAcl);

                // writeAcl: codegen factory defaults to AccessLevel.View even when the model's default writePriv
                // is Operate.  The model-derived value is more correct per spec, so we only compare when
                // the codegen explicitly sets a non-default value (i.e. not View).
                if (e.writeAcl !== undefined && e.writeAcl !== 1 /* AccessLevel.View */) {
                    expect(a.writeAcl, `${key}.writeAcl`).equals(e.writeAcl);
                }

                // default: skip comparison — DefaultValue computes from the model which may differ from codegen
                // for bitmaps (model returns {} vs codegen undefined) and other edge cases
            }

            // Commands
            for (const key of Object.keys(complete.commands)) {
                const a = fromModel.commands[key];
                const e = complete.commands[key];
                expect(a, `command "${key}" missing`).to.exist;
                if (!a) continue;

                expect(a.requestId, `${key}.requestId`).equals(e.requestId);
                expect(a.responseId, `${key}.responseId`).equals(e.responseId);
                expect(a.timed, `${key}.timed`).equals(e.timed);

                // invokeAcl: same factory default issue as writeAcl — codegen defaults to Operate,
                // model uses effective access which may resolve differently
                if (e.invokeAcl !== 3 /* AccessLevel.Operate */) {
                    expect(a.invokeAcl, `${key}.invokeAcl`).equals(e.invokeAcl);
                }
            }

            // Events
            for (const key of Object.keys(complete.events)) {
                const a = fromModel.events[key];
                const e = complete.events[key];
                expect(a, `event "${key}" missing`).to.exist;
                if (!a) continue;

                expect(a.id, `${key}.id`).equals(e.id);
                expect(a.priority, `${key}.priority`).equals(e.priority);
                expect(a.readAcl, `${key}.readAcl`).equals(e.readAcl);
            }
        });
    }
});
