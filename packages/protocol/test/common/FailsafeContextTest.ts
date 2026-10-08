/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FailsafeContext, MatterFabricInvalidAdminSubjectError } from "#common/FailsafeContext.js";
import { FabricManager } from "#fabric/FabricManager.js";
import { SessionParameters } from "#index.js";
import { NodeSession } from "#session/NodeSession.js";
import { SessionManager } from "#session/SessionManager.js";
import { b$, MemoryStorageDriver, Seconds, StandardCrypto, StorageContext } from "@matter/general";
import { NodeId, SubjectId, VendorId } from "@matter/types";

const KEY = b$`66951379d0a6d151cf5472cccf13f360`;

class TestFailsafeContext extends FailsafeContext {
    override async storeEndpointState() {}
    override async restoreNetworkState() {}
    override async restoreBreadcrumb() {}
}

describe("FailsafeContext", () => {
    function setup() {
        const crypto = new StandardCrypto();
        const storage = new MemoryStorageDriver();
        storage.initialize();
        const fabrics = new FabricManager(crypto);
        const sessions = new SessionManager({
            parameters: {} as SessionParameters,
            fabrics,
            storage: new StorageContext(storage, ["context"]),
        });
        const session = new NodeSession({
            crypto,
            id: 1,
            fabric: undefined,
            peerNodeId: NodeId.UNSPECIFIED_NODE_ID,
            peerSessionId: 1,
            decryptKey: KEY,
            encryptKey: KEY,
            attestationKey: new Uint8Array(),
            isInitiator: true,
        });
        return { sessions, fabrics, session };
    }

    it("detaches its closedByPeer listener on close", async () => {
        const { sessions, fabrics, session } = setup();

        expect(session.closedByPeer.isObserved).false;

        const context = new TestFailsafeContext({
            sessions,
            fabrics,
            session,
            expiryLength: Seconds(60),
            maxCumulativeFailsafe: Seconds(900),
        });
        await context.construction.ready;

        expect(session.closedByPeer.isObserved).true;

        await context.close();

        expect(session.closedByPeer.isObserved).false;
    });

    describe("buildFabric", () => {
        async function buildWithAdminSubject(caseAdminSubject: SubjectId) {
            const { sessions, fabrics, session } = setup();
            const context = new TestFailsafeContext({
                sessions,
                fabrics,
                session,
                expiryLength: Seconds(60),
                maxCumulativeFailsafe: Seconds(900),
            });
            await context.construction.ready;
            try {
                return await context
                    .buildFabric({
                        nocValue: new Uint8Array(),
                        icacValue: undefined,
                        adminVendorId: VendorId(0xfff1),
                        ipkValue: KEY,
                        caseAdminSubject,
                    })
                    .then(
                        () => undefined,
                        (error: unknown) => error,
                    );
            } finally {
                await context.close();
            }
        }

        it("refuses a CAT admin subject with version 0", async () => {
            const error = await buildWithAdminSubject(NodeId(0xffff_fffd_0001_0000n));

            expect(error).instanceOf(MatterFabricInvalidAdminSubjectError);
        });

        it("does not refuse a CAT admin subject with a version other than 0", async () => {
            const error = await buildWithAdminSubject(NodeId(0xffff_fffd_0001_0001n));

            expect(error).not.undefined;
            expect(error).not.instanceOf(MatterFabricInvalidAdminSubjectError);
        });

        it("refuses an admin subject that is neither an operational node ID nor a CAT", async () => {
            const error = await buildWithAdminSubject(NodeId(0xffff_ffff_0000_0001n));

            expect(error).instanceOf(MatterFabricInvalidAdminSubjectError);
        });
    });
});
