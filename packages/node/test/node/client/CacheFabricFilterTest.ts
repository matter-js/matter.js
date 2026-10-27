/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Datasource } from "#behavior/state/managed/Datasource.js";
import { ClientStructure } from "#node/client/ClientStructure.js";
import { DatasourceCache } from "#storage/client/DatasourceCache.js";
import { MatterError } from "@matter/general";
import { MockServerNode } from "@matter/node/testing";
import { Read, ReadResult, Val } from "@matter/protocol";
import { AttributeId, ClusterId, EndpointNumber, TlvAny } from "@matter/types";

class StorageFailedError extends MatterError {}

/** A cluster store whose version cannot be forgotten in storage. */
class UnwritableStore implements Datasource.ExternallyMutableStore {
    initialValues: Val.Struct = {};
    version = 5;

    async set() {}

    async externalSet() {
        return {};
    }

    async forgetVersion() {
        throw new StorageFailedError("Storage refused the write");
    }
}

/** A cluster store whose version can be forgotten only once {@link release} is called. */
class GatedStore implements Datasource.ExternallyMutableStore {
    initialValues: Val.Struct = {};
    version = 5;
    written = new Array<Val.StructMap>();
    release!: () => void;
    #released = new Promise<void>(resolve => (this.release = resolve));

    async set() {}

    async externalSet(values: Val.StructMap) {
        this.written.push(values);
        return {};
    }

    forgetting = false;

    async forgetVersion() {
        this.forgetting = true;
        await this.#released;
        this.version = Datasource.UNKNOWN_VERSION;
    }
}

async function untilForgetting(store: GatedStore) {
    while (!store.forgetting) {
        await MockTime.yield();
    }
}

/** A cluster store that remembers what it was asked to hold and forgets its version at once. */
class RecordingStore implements Datasource.ExternallyMutableStore {
    initialValues: Val.Struct = {};
    version = 5;
    written = new Array<Val.StructMap>();

    async set() {}

    async externalSet(values: Val.StructMap) {
        this.written.push(values);
        const version = values.get(DatasourceCache.VERSION_KEY);
        if (typeof version === "number") {
            this.version = version;
        }
        return {};
    }

    async forgetVersion() {
        this.version = Datasource.UNKNOWN_VERSION;
    }
}

class Record implements ClientStructure.CacheRecord {
    cacheFabricFiltered?: boolean = true;
    recorded = new Array<boolean>();

    async recordCacheFabricFiltered(fabricFiltered: boolean) {
        this.recorded.push(fabricFiltered);
        this.cacheFabricFiltered = fabricFiltered;
    }
}

describe("cache fabric filter", () => {
    it("keeps the old record when a data version cannot be forgotten", async () => {
        const node = await MockServerNode.createOnline();
        try {
            const cacheRecord = new Record();
            const structure = new ClientStructure(node, () => new UnwritableStore(), { cacheRecord });
            await structure.applyWireChanges([
                {
                    kind: "update",
                    node: node.id,
                    endpoint: EndpointNumber(1),
                    version: 5,
                    behavior: "identify",
                    changes: { identifyTime: 7 },
                },
            ]);

            await expect(structure.adoptFabricFilter(false)).rejectedWith(StorageFailedError);

            expect(cacheRecord.recorded).deep.equals([]);
            expect(structure.cacheFabricFiltered).true;
        } finally {
            await node.close();
        }
    });

    it("applies data reported while it switches the fabric filter but records no version", async () => {
        const node = await MockServerNode.createOnline();
        try {
            const store = new GatedStore();
            const structure = new ClientStructure(node, () => store, { cacheRecord: new Record() });
            await structure.applyWireChanges([
                {
                    kind: "update",
                    node: node.id,
                    endpoint: EndpointNumber(1),
                    version: 5,
                    behavior: "identify",
                    changes: { identifyTime: 7 },
                },
            ]);
            const identify = { endpointId: EndpointNumber(1), clusterId: ClusterId(3) };

            const switching = structure.adoptFabricFilter(false);
            await untilForgetting(store);
            expect(structure.injectVersionFilters(Read({ attributes: [identify] })).dataVersionFilters).undefined;

            // Reported while switching, applied once the switch completed
            let finish!: () => void;
            const finished = new Promise<void>(resolve => (finish = resolve));
            async function* report(): ReadResult {
                yield [
                    {
                        kind: "attr-value",
                        path: { ...identify, attributeId: AttributeId(0) },
                        value: 9,
                        version: 6,
                        tlv: TlvAny,
                    },
                ];
                await finished;
            }
            const iterator = structure.mutate(Read({ attributes: [{}] }), report())[Symbol.asyncIterator]();
            await iterator.next();

            store.release();
            await switching;
            finish();
            while (!(await iterator.next()).done);

            const applied = store.written[store.written.length - 1];
            expect(applied.get(0)).equals(9);
            expect(applied.get(DatasourceCache.VERSION_KEY)).equals(Datasource.UNKNOWN_VERSION);
        } finally {
            await node.close();
        }
    });

    it("switches one fabric filter at a time against the stored record", async () => {
        const node = await MockServerNode.createOnline();
        try {
            const store = new GatedStore();
            const cacheRecord = new Record();
            const structure = new ClientStructure(node, () => store, { cacheRecord });
            await structure.applyWireChanges([
                {
                    kind: "update",
                    node: node.id,
                    endpoint: EndpointNumber(1),
                    version: 5,
                    behavior: "identify",
                    changes: { identifyTime: 7 },
                },
            ]);

            const first = structure.adoptFabricFilter(false);
            const second = structure.adoptFabricFilter(true);
            await untilForgetting(store);
            store.release();
            await Promise.all([first, second]);

            expect(cacheRecord.recorded).deep.equals([false, true]);
            expect(structure.cacheFabricFiltered).true;
        } finally {
            await node.close();
        }
    });

    it("records no version for an earlier interaction when the first recorded filter differs from the default", async () => {
        const node = await MockServerNode.createOnline();
        try {
            const store = new GatedStore();
            const cacheRecord = new Record();
            cacheRecord.cacheFabricFiltered = undefined;
            const structure = new ClientStructure(node, () => store, { cacheRecord });
            const identify = { endpointId: EndpointNumber(1), clusterId: ClusterId(3) };

            let finish!: () => void;
            const finished = new Promise<void>(resolve => (finish = resolve));
            async function* report(): ReadResult {
                yield [];
                await finished;
                yield [
                    {
                        kind: "attr-value",
                        path: { ...identify, attributeId: AttributeId(0) },
                        value: 9,
                        version: 6,
                        tlv: TlvAny,
                    },
                ];
            }
            const iterator = structure
                .mutate(Read({ attributes: [{}], fabricFilter: false }), report())
                [Symbol.asyncIterator]();
            await iterator.next();

            await structure.adoptFabricFilter(false);
            finish();
            while (!(await iterator.next()).done);

            const applied = store.written[store.written.length - 1];
            expect(applied.get(0)).equals(9);
            expect(applied.get(DatasourceCache.VERSION_KEY)).equals(Datasource.UNKNOWN_VERSION);
        } finally {
            await node.close();
        }
    });

    describe("without a recorded filter", () => {
        async function unrecorded(node: MockServerNode) {
            const store = new RecordingStore();
            const cacheRecord = new Record();
            cacheRecord.cacheFabricFiltered = undefined;
            const structure = new ClientStructure(node, () => store, { cacheRecord });
            await structure.applyWireChanges([
                {
                    kind: "update",
                    node: node.id,
                    endpoint: EndpointNumber(1),
                    version: 5,
                    behavior: "identify",
                    changes: { identifyTime: 7 },
                },
            ]);
            return { store, cacheRecord, structure };
        }

        for (const fabricFiltered of [true, false]) {
            it(`keeps data versions and records the adopted filter ${fabricFiltered ? "with" : "without"} fabric filter`, async () => {
                const node = await MockServerNode.createOnline();
                try {
                    const { store, cacheRecord, structure } = await unrecorded(node);

                    await structure.adoptFabricFilter(fabricFiltered);

                    expect(store.version).equals(5);
                    expect(cacheRecord.recorded).deep.equals([fabricFiltered]);
                    expect(structure.cacheFabricFiltered).equals(fabricFiltered);
                } finally {
                    await node.close();
                }
            });
        }
    });

    it("records no version for data applied while the switch still forgets other clusters", async () => {
        const node = await MockServerNode.createOnline();
        try {
            const forgottenFirst = new RecordingStore();
            const forgottenLast = new GatedStore();
            const stores = [forgottenFirst, forgottenLast];
            const structure = new ClientStructure(node, () => stores.shift()!, { cacheRecord: new Record() });
            await structure.applyWireChanges([
                {
                    kind: "update",
                    node: node.id,
                    endpoint: EndpointNumber(1),
                    version: 5,
                    behavior: "identify",
                    changes: { identifyTime: 7 },
                },
                {
                    kind: "update",
                    node: node.id,
                    endpoint: EndpointNumber(1),
                    version: 5,
                    behavior: "onOff",
                    changes: { onOff: false },
                },
            ]);
            const identify = { endpointId: EndpointNumber(1), clusterId: ClusterId(3) };

            const switching = structure.adoptFabricFilter(false);
            await untilForgetting(forgottenLast);
            expect(forgottenFirst.version).equals(Datasource.UNKNOWN_VERSION);

            async function* report(): ReadResult {
                yield [
                    {
                        kind: "attr-value",
                        path: { ...identify, attributeId: AttributeId(0) },
                        value: 9,
                        version: 6,
                        tlv: TlvAny,
                    },
                ];
            }
            for await (const _chunk of structure.mutate(Read({ attributes: [{}] }), report()));

            forgottenLast.release();
            await switching;

            expect(forgottenFirst.version).equals(Datasource.UNKNOWN_VERSION);
        } finally {
            await node.close();
        }
    });
});
