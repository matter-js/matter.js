/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Datasource } from "#behavior/state/managed/Datasource.js";
import { ClientStructure } from "#node/client/ClientStructure.js";
import { MockServerNode } from "@matter/node/testing";
import { Val } from "@matter/protocol";
import { EndpointNumber } from "@matter/types";

/** Records what each behavior's store is asked to hold, and under which keys */
function recordingStructure(node: MockServerNode) {
    const stores = new Map<string, Val.Struct>();

    const structure = new ClientStructure(node, (_endpoint, behaviorId) => {
        const values = {} as Val.Struct;
        stores.set(behaviorId, values);
        return {
            initialValues: values,
            version: 0,
            externalSet: async (incoming: Val.StructMap) => {
                for (const [key, value] of incoming) {
                    values[String(key)] = value;
                }
            },
        } as unknown as Datasource.ExternallyMutableStore;
    });

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

    it("keys a cluster it cannot resolve by property name", async () => {
        const node = await MockServerNode.createOnline();
        try {
            const { structure, stores } = recordingStructure(node);

            // The unresolved cluster carries a placeholder ID, so a name the placeholder's schema happens to define
            // must not be taken for that schema's attribute
            await structure.applyWireChanges([
                {
                    kind: "update",
                    node: node.id,
                    endpoint: EndpointNumber(1),
                    version: 1,
                    behavior: "somethingUnresolvable",
                    changes: { identifyTime: 7, clusterRevision: 5 },
                },
            ]);

            expect(Object.keys(stores.get("somethingUnresolvable") ?? {}).sort()).deep.equals([
                "__version__",
                "clusterRevision",
                "identifyTime",
            ]);
        } finally {
            await node.close();
        }
    });
});
