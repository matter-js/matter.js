/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Datasource } from "#behavior/state/managed/Datasource.js";
import { ClientStructure } from "#node/client/ClientStructure.js";
import { ImplementationError } from "@matter/general";
import { MockServerNode } from "@matter/node/testing";
import { Val } from "@matter/protocol";
import { EndpointNumber } from "@matter/types";

/** Records what each behavior's store is asked to hold, and under which keys */
function recordingStructure(node: MockServerNode) {
    const stores = new Map<string, Val.Struct>();

    const structure = new ClientStructure(
        node,
        (_endpoint, behaviorId) => {
            const values: Val.Struct = {};
            stores.set(behaviorId, values);
            const store: Datasource.ExternallyMutableStore = {
                initialValues: values,
                version: 0,
                set: async () => {},
                externalSet: async (incoming: Val.StructMap) => {
                    for (const [key, value] of incoming) {
                        values[String(key)] = value;
                    }
                    return {};
                },
                forgetVersion: async () => {},
            };
            return store;
        },
        { cacheRecord: { recordCacheFabricFiltered: async () => {} } },
    );

    return { structure, stores };
}

describe("wire change keys", () => {
    it("keys a cluster it resolves by attribute ID", async () => {
        const node = await MockServerNode.createOnline();
        try {
            const { structure, stores } = recordingStructure(node);

            await structure.applyWireChanges([
                {
                    kind: "update",
                    node: node.id,
                    endpoint: EndpointNumber(1),
                    version: 1,
                    behavior: "identify",
                    changes: { identifyTime: 7, clusterRevision: 5 },
                },
            ]);

            expect(Object.keys(stores.get("3") ?? {}).sort()).deep.equals(["0", "65533", "__version__"]);
        } finally {
            await node.close();
        }
    });

    it("refuses a wire change for a behavior it cannot resolve to a cluster", async () => {
        const node = await MockServerNode.createOnline();
        try {
            const { structure, stores } = recordingStructure(node);

            await expect(
                structure.applyWireChanges([
                    {
                        kind: "update",
                        node: node.id,
                        endpoint: EndpointNumber(1),
                        version: 1,
                        behavior: "somethingUnresolvable",
                        changes: { identifyTime: 7, clusterRevision: 5 },
                    },
                ]),
            ).rejectedWith(ImplementationError, /names no cluster/);
            expect(stores.has("somethingUnresolvable")).false;
        } finally {
            await node.close();
        }
    });
});
