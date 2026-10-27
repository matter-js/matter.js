/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Fabric } from "#fabric/Fabric.js";
import { FabricManager, FabricTableFullError } from "#fabric/FabricManager.js";
import { TestFabric } from "#fabric/TestFabric.js";
import {
    Bytes,
    ImplementationError,
    MatterFlowError,
    MemoryStorageDriver,
    StandardCrypto,
    StorageManager,
} from "@matter/general";
import { EndpointNumber, FabricIndex, GroupId, NodeId, SubjectId } from "@matter/types";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";
import { IcdManagement } from "@matter/types/clusters/icd-management";

const GROUP = GroupId(0x0101);
const KEY_SET_ID = 0x1a1;
const REGISTRATION = {
    checkInNodeId: NodeId(7),
    monitoredSubject: SubjectId(7),
    key: Bytes.fromHex("00112233445566778899aabbccddeeff"),
    clientType: IcdManagement.ClientType.Permanent,
};

async function provisionGroup(fabric: Fabric) {
    await fabric.groups.setFromGroupKeySet({
        groupKeySetId: KEY_SET_ID,
        groupKeySecurityPolicy: GroupKeyManagement.GroupKeySecurityPolicy.TrustFirst,
        epochKey0: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
        epochStartTime0: 1n,
        epochKey1: null,
        epochStartTime1: null,
        epochKey2: null,
        epochStartTime2: null,
    });
    fabric.groups.groupKeyIdMap.set(GROUP, KEY_SET_ID);
    fabric.groups.endpoints.set(GROUP, [EndpointNumber(1)]);
    fabric.groups.setGroupMulticastPolicy(GROUP, "ianaAddr");
}

describe("FabricManager", () => {
    const crypto = new StandardCrypto();
    let storage: MemoryStorageDriver;
    let storageManager: StorageManager;
    let fabrics: FabricManager;

    beforeEach(async () => {
        storage = new MemoryStorageDriver();
        storageManager = new StorageManager(storage);
        await storageManager.initialize();
        fabrics = new FabricManager(crypto, storageManager.createContext("Context"));
        await fabrics.construction.ready;
    });

    describe("adding Fabrics", () => {
        it("add a new fabric (but not persist directly)", async () => {
            const fabric = await TestFabric();
            fabrics.addFabric(fabric);

            expect(fabrics.fabrics).to.deep.equal([fabric]);

            expect(storage.get(["Context"], "fabrics")).to.be.undefined;
        });

        it("adding a fabric with same index twice throws error", async () => {
            const storage = new StorageManager(new MemoryStorageDriver());
            await storage.initialize();
            const fabricManager = new FabricManager(crypto, storage.createContext("Context"));
            await fabricManager.construction.ready;
            const fabric = await TestFabric();
            fabricManager.addFabric(fabric);

            expect(() => fabricManager.addFabric(fabric)).to.throw(
                MatterFlowError,
                `Fabric with index 1 already exists.`,
            );
        });
    });

    describe("persistence", () => {
        it("add a new fabric and persist", async () => {
            const fabric = await TestFabric();
            fabrics.addFabric(fabric);
            await fabrics.persistFabrics();

            expect(fabrics.fabrics).to.deep.equal([fabric]);

            expect(storage.get(["Context"], "fabrics")).to.deep.equal([fabric.config]);
        });

        it("restore a fabric from storage", async () => {
            const fabric = await TestFabric();
            storage.set(["Context"], "fabrics", [fabric.config]);

            fabrics = new FabricManager(crypto, storageManager.createContext("Context"));
            await fabrics.construction.ready;
            expect(fabrics.fabrics.length).to.equal(1);
            expect(fabrics.fabrics[0].config).to.deep.equal(fabric.config);
        });
    });

    describe("removing Fabrics", () => {
        it("remove an added fabric", async () => {
            const fabric = await TestFabric();
            fabrics.addFabric(fabric);
            await fabric.delete();

            expect(fabrics.fabrics).to.deep.equal([]);
        });
    });

    describe("replacing Fabrics", () => {
        async function replaceable() {
            const fabric = await TestFabric({ fabrics });
            await provisionGroup(fabric);
            fabric.icd.setRegistration(REGISTRATION);
            return { fabric, replacement: new Fabric(crypto, fabric.config) };
        }

        it("shares groups, access control and ICD state with the replacement before it reports it", async () => {
            const { fabric, replacement } = await replaceable();
            const operationalKey = fabric.groups.currentKeyForGroup(GROUP).key;
            let seen: { keySetId: number; endpoints?: EndpointNumber[]; address: string } | undefined;
            fabrics.events.replaced.on(replaced => {
                seen = {
                    keySetId: replaced.groups.currentKeyForGroup(GROUP).keySetId,
                    endpoints: replaced.groups.endpoints.get(GROUP),
                    address: replaced.groups.multicastAddressFor(GROUP),
                };
            });

            await fabrics.replaceFabric(replacement);

            expect(seen).deep.equals({ keySetId: KEY_SET_ID, endpoints: [EndpointNumber(1)], address: "ff05::fa" });
            expect(replacement.groups).equals(fabric.groups);
            expect(replacement.accessControl).equals(fabric.accessControl);
            expect(replacement.icd).equals(fabric.icd);
            expect(replacement.icd.registrations).deep.equals([REGISTRATION]);
            expect(Bytes.areEqual(replacement.groups.currentKeyForGroup(GROUP).key, operationalKey)).true;
        });

        it("keeps group changes made while replaced when the previous fabric is restored", async () => {
            const { fabric, replacement } = await replaceable();
            await fabrics.replaceFabric(replacement);
            replacement.groups.groupKeyIdMap.delete(GROUP);

            await fabrics.replaceFabric(fabric);

            expect(fabrics.for(fabric.fabricIndex)).equals(fabric);
            expect(fabric.groups.groupKeyIdMap.has(GROUP)).false;
        });

        it("forwards the events of a replaced and restored fabric once and those of a replaced object never", async () => {
            const { fabric, replacement } = await replaceable();
            await fabrics.replaceFabric(replacement);
            await fabrics.replaceFabric(fabric);
            const events = new Array<string>();
            fabrics.events.replaced.on(() => void events.push("replaced"));
            fabrics.events.leaving.on(() => void events.push("leaving"));
            fabrics.events.deleting.on(() => void events.push("deleting"));
            fabrics.events.deleted.on(() => void events.push("deleted"));

            await replacement.setLabel("stale");
            await replacement.leave();
            expect(events).deep.equals([]);

            await fabric.leave();
            expect(events).deep.equals(["leaving", "deleting", "deleted"]);
        });

        it("releases the ICD state only when the fabric in the table is deleted", async () => {
            const { fabric, replacement } = await replaceable();
            await fabrics.replaceFabric(replacement);

            await fabric.delete();
            expect(replacement.icd.registrations).deep.equals([REGISTRATION]);

            await replacement.delete();
            expect(replacement.icd.registrations).deep.equals([]);
        });

        it("releases the ICD state when the fabrics are cleared", async () => {
            const { replacement } = await replaceable();
            await fabrics.replaceFabric(replacement);

            await fabrics.clear();

            expect(replacement.icd.registrations).deep.equals([]);
        });

        it("refuses a replacement from another root", async () => {
            const { fabric } = await replaceable();
            const otherRoot = await TestFabric({ index: fabric.fabricIndex });
            const other = new Fabric(crypto, {
                ...otherRoot.config,
                identityProtectionKey: fabric.identityProtectionKey,
            });
            expect(other.globalId).not.equals(fabric.globalId);

            await expect(fabrics.replaceFabric(other)).rejectedWith(ImplementationError);
            expect(fabrics.for(fabric.fabricIndex)).equals(fabric);
        });

        it("refuses a replacement with another IPK", async () => {
            const { fabric } = await replaceable();
            const other = new Fabric(crypto, { ...fabric.config, identityProtectionKey: new Uint8Array(16) });

            await expect(fabrics.replaceFabric(other)).rejectedWith(ImplementationError);
            expect(fabrics.for(fabric.fabricIndex)).equals(fabric);
        });
    });

    describe("determine next FabricIndex", () => {
        it("get next fabric index initially", async () => {
            expect(fabrics.allocateFabricIndex()).to.equal(1);
        });

        it("get next fabric index after adding fabric", async () => {
            await TestFabric({ fabrics });

            expect(fabrics.allocateFabricIndex()).to.equal(2);
        });

        it("get next fabric index after adding fabric and removing it", async () => {
            const fabric = await TestFabric({ fabrics });
            await fabric.delete();

            expect(fabrics.allocateFabricIndex()).to.equal(2);
        });

        it("get next fabric index after adding fabric and revoking it", async () => {
            const fabric = await TestFabric({ fabrics });
            await fabric.delete();

            expect(fabrics.allocateFabricIndex()).to.equal(2);
        });

        it("get jumps over one fabric index after adding fabric and revoking it", async () => {
            const fabric = await TestFabric({ fabrics }); // Index 1
            await TestFabric({ fabrics }); // Index 2
            await fabric.delete(); // We do not remove the last generated Index

            expect(fabrics.allocateFabricIndex()).to.equal(3); // So index now changed
        });

        it("it find first open slot for next index", async () => {
            for (let i = 1; i < 255; i++) {
                await TestFabric({ fabrics });
            }
            await fabrics.for(FabricIndex(100)).delete();

            expect(fabrics.allocateFabricIndex()).to.equal(100);
        });

        it("it find first open slot for next index id including overflow", async () => {
            for (let i = 1; i < 255; i++) {
                await TestFabric({ fabrics });
            }
            await fabrics.for(FabricIndex(1)).delete();

            expect(fabrics.allocateFabricIndex()).to.equal(1);
        });

        it("throws when table is full", async () => {
            for (let i = 1; i < 255; i++) {
                await TestFabric({ fabrics });
            }

            expect(() => fabrics.allocateFabricIndex()).to.throw(
                FabricTableFullError,
                "No free fabric index available.",
            );
        });
    });
});
