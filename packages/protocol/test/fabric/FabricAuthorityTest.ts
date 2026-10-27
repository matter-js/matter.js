/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CertificateAuthority } from "#certificate/CertificateAuthority.js";
import { Noc } from "#certificate/kinds/Noc.js";
import { FabricBuilder } from "#fabric/Fabric.js";
import { FabricAuthority } from "#fabric/FabricAuthority.js";
import { FabricManager } from "#fabric/FabricManager.js";
import {
    Bytes,
    CertificateError,
    createPromise,
    ImplementationError,
    MemoryStorageDriver,
    StandardCrypto,
    StorageError,
    StorageManager,
    SupportedStorageTypes,
} from "@matter/general";
import { CaseAuthenticatedTag, FabricId, GroupId, NodeId, VendorId } from "@matter/types";
import { GroupKeyManagement } from "@matter/types/clusters/group-key-management";

const crypto = new StandardCrypto();

async function createAuthority(driver: MemoryStorageDriver) {
    const storageManager = new StorageManager(driver);
    await storageManager.initialize();
    const fabrics = new FabricManager(crypto, storageManager.createContext("fabrics"));
    await fabrics.construction.ready;
    const ca = await CertificateAuthority.create(crypto, storageManager.createContext("ca"));
    const authority = new FabricAuthority({ ca, fabrics });
    await authority.construction;
    return { authority, fabrics };
}

describe("FabricAuthority", () => {
    let storage: MemoryStorageDriver;
    let storageManager: StorageManager;
    let fabricManager: FabricManager;
    let ca: CertificateAuthority;
    let authority: FabricAuthority;

    beforeEach(async () => {
        storage = new MemoryStorageDriver();
        storageManager = new StorageManager(storage);
        await storageManager.initialize();
        fabricManager = new FabricManager(crypto, storageManager.createContext("fabrics"));
        await fabricManager.construction.ready;
        ca = await CertificateAuthority.create(crypto, storageManager.createContext("ca"));
        authority = new FabricAuthority({ ca, fabrics: fabricManager });
        await authority.construction;
    });

    describe("createFabric", () => {
        it("refuses the Matter Standard vendor ID as admin vendor ID", async () => {
            await expect(
                authority.createFabric({ adminFabricLabel: "test-fabric", adminVendorId: VendorId(0) }),
            ).rejectedWith(ImplementationError, /Admin vendor ID 0x0 is reserved/);
        });

        it("refuses a vendor ID above 0xFFF4 as admin vendor ID", async () => {
            await expect(
                authority.createFabric({ adminFabricLabel: "test-fabric", adminVendorId: VendorId(0xfff5, false) }),
            ).rejectedWith(ImplementationError, /Admin vendor ID 0xfff5 is reserved/);
        });

        it("completes once the fabric list is persisted and reports the fabric only as added", async () => {
            const writing = createPromise<void>();
            const release = createPromise<void>();
            class GatedDriver extends MemoryStorageDriver {
                override set(
                    contexts: string[],
                    keyOrValues: string | Record<string, SupportedStorageTypes>,
                    value?: SupportedStorageTypes,
                ) {
                    if (contexts.includes("fabrics")) {
                        writing.resolver();
                        return release.promise.then(() => super.set(contexts, keyOrValues, value));
                    }
                    return super.set(contexts, keyOrValues, value);
                }
            }
            const { authority, fabrics } = await createAuthority(new GatedDriver());

            const events = new Array<string>();
            fabrics.events.added.on(fabric => void events.push(`added ${fabric.fabricIndex}`));
            fabrics.events.replaced.on(fabric => void events.push(`replaced ${fabric.fabricIndex}`));

            let completed = false;
            const created = authority.createFabric({ adminFabricLabel: "test-fabric" }).then(fabric => {
                completed = true;
                return fabric;
            });
            await writing.promise;
            await MockTime.yield3();
            expect(completed).false;

            release.resolver();
            const fabric = await created;

            expect(events).deep.equals([`added ${fabric.fabricIndex}`]);
        });

        it("rejects when the fabric list cannot be persisted", async () => {
            class FailingDriver extends MemoryStorageDriver {
                override set(
                    contexts: string[],
                    keyOrValues: string | Record<string, SupportedStorageTypes>,
                    value?: SupportedStorageTypes,
                ) {
                    if (contexts.includes("fabrics")) {
                        return Promise.reject(new StorageError("Disk full"));
                    }
                    return super.set(contexts, keyOrValues, value);
                }
            }
            const { authority } = await createAuthority(new FailingDriver());

            await expect(authority.createFabric({ adminFabricLabel: "test-fabric" })).rejectedWith(
                StorageError,
                "Disk full",
            );
        });
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

        it("rotated fabric sends to a group at once with the keys of the previous fabric", async () => {
            const config = { adminFabricLabel: "test-fabric", adminFabricId: FabricId(1n) };
            const initialFabric = await authority.createFabric(config);
            await initialFabric.groups.setFromGroupKeySet({
                groupKeySetId: 0x1a1,
                groupKeySecurityPolicy: GroupKeyManagement.GroupKeySecurityPolicy.TrustFirst,
                epochKey0: Bytes.fromHex("d0d1d2d3d4d5d6d7d8d9dadbdcdddedf"),
                epochStartTime0: 1n,
                epochKey1: null,
                epochStartTime1: null,
                epochKey2: null,
                epochStartTime2: null,
            });
            initialFabric.groups.groupKeyIdMap.set(GroupId(7), 0x1a1);
            const { key, sessionId } = initialFabric.groups.currentKeyForGroup(GroupId(7));

            const rotatedFabric = await authority.defaultFabric(config, true);

            expect(rotatedFabric).not.equals(initialFabric);
            const current = rotatedFabric.groups.currentKeyForGroup(GroupId(7));
            expect(Bytes.areEqual(current.key, key)).true;
            expect(current.sessionId).equals(sessionId);
        });

        it("rotated fabric keeps receiving Check-Ins of the ICD peers of the previous fabric", async () => {
            const config = { adminFabricLabel: "test-fabric", adminFabricId: FabricId(1n) };
            const initialFabric = await authority.createFabric(config);
            const peer = {
                peerNodeId: NodeId(0x55n),
                key: Bytes.fromHex("00112233445566778899aabbccddeeff"),
                counterStart: 0,
                lastOffset: 0,
            };
            initialFabric.icd.addPeer(peer, () => {});

            const rotatedFabric = await authority.defaultFabric(config, true);

            expect(rotatedFabric).not.equals(initialFabric);
            expect(rotatedFabric.icdActive).true;
            expect(rotatedFabric.icd.peerFor(peer.peerNodeId)?.peerNodeId).equals(peer.peerNodeId);
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
            };
            const fabric1 = await authority.createFabric(config1);
            const initialKey1 = fabric1.publicKey;
            const fabricIndex1 = fabric1.fabricIndex;

            // Create second fabric with different CA
            const ca2 = await CertificateAuthority.create(crypto, storageManager.createContext("ca2"));
            const authority2 = new FabricAuthority({ ca: ca2, fabrics: fabricManager });
            await authority2.construction;
            const config2 = {
                adminFabricLabel: "fabric-2",
                adminVendorId: VendorId(0xfff1),
                adminNodeId: NodeId(200n),
                adminFabricId: FabricId(2n),
            };
            const fabric2 = await authority2.createFabric(config2);
            const initialKey2 = fabric2.publicKey;
            const fabricIndex2 = fabric2.fabricIndex;

            // Rotate first fabric
            const rotated1 = await authority.defaultFabric(config1, true);
            expect(Bytes.areEqual(rotated1.publicKey, initialKey1)).to.be.false;

            // Rotate second fabric
            const rotated2 = await authority2.defaultFabric(config2, true);
            expect(Bytes.areEqual(rotated2.publicKey, initialKey2)).to.be.false;

            // Verify both rotations are independent and preserve their fabric indices
            expect(rotated1.fabricIndex).to.equal(fabricIndex1);
            expect(rotated2.fabricIndex).to.equal(fabricIndex2);
            expect(fabricIndex1).to.not.equal(fabricIndex2);
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

    describe("FabricBuilder.updateOperationalCert", () => {
        it("refuses a NOC for another fabric ID and takes over nothing", async () => {
            const fabric = await authority.createFabric({
                adminFabricLabel: "test-fabric",
                adminFabricId: FabricId(1n),
            });
            const builder = await FabricBuilder.create(crypto);
            const noc = await ca.generateNoc(builder.publicKey, FabricId(2n), fabric.nodeId);

            await expect(builder.updateOperationalCert(fabric, noc, fabric.intermediateCACert)).rejectedWith(
                CertificateError,
                /fabric ID 2/,
            );
            expect(builder.rootCert).undefined;
            expect(builder.fabricId).undefined;
        });
    });
});
