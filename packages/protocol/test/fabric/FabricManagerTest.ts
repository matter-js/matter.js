/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { FabricManager, FabricTableFullError } from "#fabric/FabricManager.js";
import { TestFabric } from "#fabric/TestFabric.js";
import { MatterFlowError, StandardCrypto, StorageBackendMemory, StorageManager } from "#general";
import { FabricIndex } from "#types";

describe("FabricManager", () => {
    const crypto = new StandardCrypto();
    let storage: StorageBackendMemory;
    let storageManager: StorageManager;
    let fabrics: FabricManager;

    beforeEach(async () => {
        storage = new StorageBackendMemory();
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
            const storage = new StorageManager(new StorageBackendMemory());
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
