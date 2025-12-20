/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CertificateAuthority } from "#certificate/CertificateAuthority.js";
import { Noc } from "#certificate/kinds/Noc.js";
import { FabricAuthority } from "#fabric/FabricAuthority.js";
import { FabricManager } from "#fabric/FabricManager.js";
import { Bytes, StandardCrypto, StorageBackendMemory, StorageManager } from "#general";
import { CaseAuthenticatedTag, FabricId, FabricIndex, NodeId, VendorId } from "#types";

const crypto = new StandardCrypto();

describe("FabricAuthority", () => {
    let storage: StorageBackendMemory;
    let storageManager: StorageManager;
    let fabricManager: FabricManager;
    let ca: CertificateAuthority;
    let authority: FabricAuthority;

    beforeEach(async () => {
        storage = new StorageBackendMemory();
        storageManager = new StorageManager(storage);
        await storageManager.initialize();
        fabricManager = new FabricManager(crypto, storageManager.createContext("fabrics"));
        await fabricManager.construction.ready;
        ca = await CertificateAuthority.create(crypto, storageManager.createContext("ca"));
        authority = new FabricAuthority({ ca, fabrics: fabricManager });
        await authority.construction;
    });

    describe("keypair rotation", () => {
        it("rotates NOC keypair when getting default fabric with rotateNoc=true", async () => {
            // Create initial fabric
            const config = {
                adminFabricLabel: "test-fabric",
                adminVendorId: VendorId(0xfff1),
                adminNodeId: NodeId(100n),
                adminFabricId: FabricId(1n),
                caseAuthenticatedTags: [CaseAuthenticatedTag(0x00010001)],
            };
            const initialFabric = await authority.createFabric(config);
            const initialPublicKey = initialFabric.publicKey;
            const initialOperationalCert = initialFabric.operationalCert;

            // Get default fabric with rotation
            const rotatedFabric = await authority.defaultFabric(config, true);

            // Verify that the keypair was rotated (public key changed)
            expect(Bytes.areEqual(rotatedFabric.publicKey, initialPublicKey)).to.be.false;

            // Verify that the operational cert changed
            expect(Bytes.areEqual(rotatedFabric.operationalCert, initialOperationalCert)).to.be.false;

            // Verify fabric identity is preserved
            const rotatedNoc = Noc.fromTlv(rotatedFabric.operationalCert);
            expect(rotatedNoc.cert.subject.fabricId).to.equal(config.adminFabricId);
            expect(rotatedNoc.cert.subject.nodeId).to.equal(config.adminNodeId);
            expect(rotatedNoc.cert.subject.caseAuthenticatedTags).to.deep.equal(config.caseAuthenticatedTags);

            // Verify fabric index is preserved
            expect(rotatedFabric.fabricIndex).to.equal(initialFabric.fabricIndex);

            // Verify root node ID is preserved
            expect(rotatedFabric.rootNodeId).to.equal(initialFabric.rootNodeId);
        });

        it("rotation occurs exactly once per runtime per fabric", async () => {
            // Create initial fabric
            const config = {
                adminFabricLabel: "test-fabric",
                adminVendorId: VendorId(0xfff1),
                adminNodeId: NodeId(100n),
                adminFabricId: FabricId(1n),
            };
            await authority.createFabric(config);

            // First rotation
            const firstRotation = await authority.defaultFabric(config, true);
            const firstPublicKey = firstRotation.publicKey;

            // Second rotation attempt
            const secondRotation = await authority.defaultFabric(config, true);
            const secondPublicKey = secondRotation.publicKey;

            // Verify that the second rotation did not change the key
            expect(Bytes.areEqual(secondPublicKey, firstPublicKey)).to.be.true;

            // Third rotation attempt
            const thirdRotation = await authority.defaultFabric(config, true);
            const thirdPublicKey = thirdRotation.publicKey;

            // Verify that the third rotation did not change the key
            expect(Bytes.areEqual(thirdPublicKey, firstPublicKey)).to.be.true;
        });

        it("rotatedFabricIndices Set correctly prevents duplicate rotations", async () => {
            // Create initial fabric
            const config = {
                adminFabricLabel: "test-fabric",
                adminVendorId: VendorId(0xfff1),
                adminNodeId: NodeId(100n),
                adminFabricId: FabricId(1n),
            };
            const initialFabric = await authority.createFabric(config);
            const initialPublicKey = initialFabric.publicKey;

            // First rotation - should rotate
            const firstRotation = await authority.defaultFabric(config, true);
            const firstRotatedKey = firstRotation.publicKey;
            expect(Bytes.areEqual(firstRotatedKey, initialPublicKey)).to.be.false;

            // Second rotation - should NOT rotate (same runtime)
            const secondRotation = await authority.defaultFabric(config, true);
            const secondKey = secondRotation.publicKey;
            expect(Bytes.areEqual(secondKey, firstRotatedKey)).to.be.true;

            // Verify the fabric is the same instance after second call
            expect(secondRotation.fabricIndex).to.equal(firstRotation.fabricIndex);
        });

        it("new fabric is properly persisted after rotation", async () => {
            // Create initial fabric
            const config = {
                adminFabricLabel: "test-fabric",
                adminVendorId: VendorId(0xfff1),
                adminNodeId: NodeId(100n),
                adminFabricId: FabricId(1n),
            };
            await authority.createFabric(config);

            // Rotate the fabric
            const rotatedFabric = await authority.defaultFabric(config, true);
            const rotatedPublicKey = rotatedFabric.publicKey;
            const rotatedIndex = rotatedFabric.fabricIndex;

            // Create a new FabricManager and FabricAuthority with the same storage
            const newFabricManager = new FabricManager(crypto, storageManager.createContext("fabrics"));
            await newFabricManager.construction.ready;
            const newCa = new CertificateAuthority(crypto, storageManager.createContext("ca"));
            await newCa.construction;
            const newAuthority = new FabricAuthority({ ca: newCa, fabrics: newFabricManager });
            await newAuthority.construction;

            // Get the fabric from storage
            const loadedFabric = newFabricManager.maybeFor(rotatedIndex);
            expect(loadedFabric).to.not.be.undefined;
            expect(Bytes.areEqual(loadedFabric!.publicKey, rotatedPublicKey)).to.be.true;
        });

        it("does not rotate when rotateNoc=false", async () => {
            // Create initial fabric
            const config = {
                adminFabricLabel: "test-fabric",
                adminVendorId: VendorId(0xfff1),
                adminNodeId: NodeId(100n),
                adminFabricId: FabricId(1n),
            };
            const initialFabric = await authority.createFabric(config);
            const initialPublicKey = initialFabric.publicKey;

            // Get default fabric without rotation
            const fabric = await authority.defaultFabric(config, false);
            const publicKey = fabric.publicKey;

            // Verify that the keypair was NOT rotated
            expect(Bytes.areEqual(publicKey, initialPublicKey)).to.be.true;
        });

        it("preserves fabricId from operational certificate during rotation", async () => {
            // Create initial fabric
            const config = {
                adminFabricLabel: "test-fabric",
                adminVendorId: VendorId(0xfff1),
                adminNodeId: NodeId(100n),
                adminFabricId: FabricId(123n),
            };
            await authority.createFabric(config);

            // Rotate the fabric
            const rotatedFabric = await authority.defaultFabric(config, true);

            // Verify fabricId is preserved
            const rotatedNoc = Noc.fromTlv(rotatedFabric.operationalCert);
            expect(rotatedNoc.cert.subject.fabricId).to.equal(FabricId(123n));
        });

        it("preserves nodeId from operational certificate during rotation", async () => {
            // Create initial fabric
            const config = {
                adminFabricLabel: "test-fabric",
                adminVendorId: VendorId(0xfff1),
                adminNodeId: NodeId(999n),
                adminFabricId: FabricId(1n),
            };
            await authority.createFabric(config);

            // Rotate the fabric
            const rotatedFabric = await authority.defaultFabric(config, true);

            // Verify nodeId is preserved
            const rotatedNoc = Noc.fromTlv(rotatedFabric.operationalCert);
            expect(rotatedNoc.cert.subject.nodeId).to.equal(NodeId(999n));
        });

        it("preserves caseAuthenticatedTags during rotation", async () => {
            // Create initial fabric with CATs
            const config = {
                adminFabricLabel: "test-fabric",
                adminVendorId: VendorId(0xfff1),
                adminNodeId: NodeId(100n),
                adminFabricId: FabricId(1n),
                caseAuthenticatedTags: [CaseAuthenticatedTag(0x00010001), CaseAuthenticatedTag(0x00020002)],
            };
            await authority.createFabric(config);

            // Rotate the fabric
            const rotatedFabric = await authority.defaultFabric(config, true);

            // Verify CATs are preserved
            const rotatedNoc = Noc.fromTlv(rotatedFabric.operationalCert);
            expect(rotatedNoc.cert.subject.caseAuthenticatedTags).to.deep.equal(config.caseAuthenticatedTags);
        });

        it("handles fabric without caseAuthenticatedTags during rotation", async () => {
            // Create initial fabric without CATs
            const config = {
                adminFabricLabel: "test-fabric",
                adminVendorId: VendorId(0xfff1),
                adminNodeId: NodeId(100n),
                adminFabricId: FabricId(1n),
            };
            await authority.createFabric(config);

            // Rotate the fabric
            const rotatedFabric = await authority.defaultFabric(config, true);

            // Verify no errors and fabric is valid
            expect(rotatedFabric).to.not.be.undefined;
            expect(rotatedFabric.fabricIndex).to.be.greaterThan(0);
        });

        it("rotation works with multiple fabrics", async () => {
            // Create first fabric
            const config1 = {
                adminFabricLabel: "fabric-1",
                adminVendorId: VendorId(0xfff1),
                adminNodeId: NodeId(100n),
                adminFabricId: FabricId(1n),
                adminFabricIndex: FabricIndex(1),
            };
            const fabric1 = await authority.createFabric(config1);
            const initialKey1 = fabric1.publicKey;

            // Create second fabric with different CA
            const ca2 = await CertificateAuthority.create(crypto, storageManager.createContext("ca2"));
            const authority2 = new FabricAuthority({ ca: ca2, fabrics: fabricManager });
            await authority2.construction;
            const config2 = {
                adminFabricLabel: "fabric-2",
                adminVendorId: VendorId(0xfff1),
                adminNodeId: NodeId(200n),
                adminFabricId: FabricId(2n),
                adminFabricIndex: FabricIndex(2),
            };
            const fabric2 = await authority2.createFabric(config2);
            const initialKey2 = fabric2.publicKey;

            // Rotate first fabric
            const rotated1 = await authority.defaultFabric(config1, true);
            expect(Bytes.areEqual(rotated1.publicKey, initialKey1)).to.be.false;

            // Rotate second fabric
            const rotated2 = await authority2.defaultFabric(config2, true);
            expect(Bytes.areEqual(rotated2.publicKey, initialKey2)).to.be.false;

            // Verify both rotations are independent
            expect(rotated1.fabricIndex).to.equal(FabricIndex(1));
            expect(rotated2.fabricIndex).to.equal(FabricIndex(2));
        });
    });

    describe("fabric creation", () => {
        it("creates fabric with specified configuration", async () => {
            const config = {
                adminFabricLabel: "test-fabric",
                adminVendorId: VendorId(0xfff1),
                adminNodeId: NodeId(100n),
                adminFabricId: FabricId(1n),
            };
            const fabric = await authority.createFabric(config);

            expect(fabric.label).to.equal("test-fabric");
            expect(fabric.rootNodeId).to.equal(NodeId(100n));
        });

        it("emits fabricAdded event when creating fabric", async () => {
            const config = {
                adminFabricLabel: "test-fabric",
                adminVendorId: VendorId(0xfff1),
            };

            let emittedFabric;
            authority.fabricAdded.on(fabric => {
                emittedFabric = fabric;
            });

            const createdFabric = await authority.createFabric(config);
            expect(emittedFabric).to.equal(createdFabric);
        });
    });
});
