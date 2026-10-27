/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningServer } from "#behavior/system/commissioning/CommissioningServer.js";
import { AccessControlServer } from "#behaviors/access-control";
import { GeneralCommissioningClient } from "#behaviors/general-commissioning";
import { GroupKeyManagementServer } from "#behaviors/group-key-management";
import { GroupcastClient, GroupcastServer } from "#behaviors/groupcast";
import { OperationalCredentialsClient, OperationalCredentialsServer } from "#behaviors/operational-credentials";
import { OnOffLightDevice } from "#devices/on-off-light";
import { ClientNode } from "#node/ClientNode.js";
import { ServerNode } from "#node/ServerNode.js";
import { Bytes, Crypto, LogLevel } from "@matter/general";
import { AccessLevel, DataModelPath } from "@matter/model";
import { captureLog, FAILSAFE_LENGTH_S, MockServerNode, MockSite } from "@matter/node/testing";
import {
    AccessControl,
    Certificate,
    Fabric,
    FabricAuthority,
    FabricManager,
    IANA_GROUPCAST_MULTICAST_ADDRESS,
    TestFabric,
    TlvCertSigningRequest,
} from "@matter/protocol";
import {
    EndpointNumber,
    FabricId,
    FabricIndex,
    GroupId,
    NodeId,
    Status,
    StatusResponseError,
    SubjectId,
    VendorId,
} from "@matter/types";
import { Groupcast } from "@matter/types/clusters/groupcast";
import { OnOff } from "@matter/types/clusters/on-off";
import { OperationalCredentials } from "@matter/types/clusters/operational-credentials";
import { recordMembershipChanges } from "../groupcast/multicast-helpers.js";

describe("OperationalCredentialsServer", () => {
    before(() => {
        MockTime.init();
    });

    async function statusOf(call: (peer: ClientNode) => Promise<unknown>) {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer = controller.peers.get("peer1")!;
        const error = await call(peer).then(
            () => undefined,
            (error: unknown) => error,
        );
        return error instanceof StatusResponseError ? error.code : error;
    }

    function addNocWith(adminVendorId: VendorId) {
        return statusOf(peer =>
            peer.commandsOf(OperationalCredentialsClient).addNoc({
                nocValue: Bytes.of(new Uint8Array(10)),
                ipkValue: Bytes.of(new Uint8Array(16)),
                caseAdminSubject: NodeId(1n),
                adminVendorId,
            }),
        );
    }

    describe("addNoc", () => {
        it("refuses the Matter Standard vendor ID as admin vendor ID", async () => {
            expect(await addNocWith(VendorId(0))).equals(Status.InvalidCommand);
        });

        it("refuses a reserved vendor ID as admin vendor ID", async () => {
            expect(await addNocWith(VendorId(0xfff5, false))).equals(Status.InvalidCommand);
        });

        it("checks the fail-safe after a valid admin vendor ID", async () => {
            expect(await addNocWith(VendorId(0xfff1))).equals(Status.FailsafeRequired);
        });
    });

    describe("addNoc certificate checks", () => {
        async function addNocStatus({
            nocNodeId,
            caseAdminSubject,
        }: {
            nocNodeId: NodeId;
            caseAdminSubject: SubjectId;
        }) {
            const authority = await TestFabric.Authority({ index: 1 });
            const fabric = await authority.createFabric({
                adminFabricLabel: "test",
                adminVendorId: VendorId(0xfff1),
                adminFabricIndex: FabricIndex(1),
                adminFabricId: FabricId(1),
            });
            await using node = await MockServerNode.createOnline();
            const context = { exchange: await node.createExchange(), command: true };
            const crypto = node.env.get(Crypto);

            await node.online(context, agent =>
                agent.generalCommissioning.armFailSafe({ expiryLengthSeconds: FAILSAFE_LENGTH_S, breadcrumb: 1 }),
            );
            const { nocsrElements } = await node.online(context, agent =>
                agent.operationalCredentials.csrRequest({ csrNonce: crypto.randomBytes(32) }),
            );
            await node.online(context, agent =>
                agent.operationalCredentials.addTrustedRootCertificate({ rootCaCertificate: authority.ca.rootCert }),
            );

            const { certSigningRequest } = TlvCertSigningRequest.decode(nocsrElements);
            const publicKey = await Certificate.getPublicKeyFromCsr(crypto, certSigningRequest);
            const noc = await authority.ca.generateNoc(publicKey, fabric.fabricId, nocNodeId);

            const { statusCode } = await node.online(context, agent =>
                agent.operationalCredentials.addNoc({
                    nocValue: noc,
                    icacValue: fabric.intermediateCACert,
                    ipkValue: fabric.identityProtectionKey,
                    caseAdminSubject,
                    adminVendorId: VendorId(0xfff1),
                }),
            );
            return statusCode;
        }

        it("answers InvalidNodeOpId for a NOC whose node ID is outside the operational range", async () => {
            const status = await addNocStatus({
                nocNodeId: NodeId(0xffff_ffff_0000_0001n),
                caseAdminSubject: NodeId(100),
            });

            expect(status).equals(OperationalCredentials.NodeOperationalCertStatus.InvalidNodeOpId);
        });

        it("answers InvalidAdminSubject for a CAT admin subject with version 0", async () => {
            const status = await addNocStatus({
                nocNodeId: NodeId(1),
                caseAdminSubject: NodeId(0xffff_fffd_0001_0000n),
            });

            expect(status).equals(OperationalCredentials.NodeOperationalCertStatus.InvalidAdminSubject);
        });

        it("adds the fabric for a valid NOC and admin subject", async () => {
            const status = await addNocStatus({ nocNodeId: NodeId(1), caseAdminSubject: NodeId(100) });

            expect(status).equals(OperationalCredentials.NodeOperationalCertStatus.Ok);
        });
    });

    describe("setVidVerificationStatement", () => {
        it("refuses the Matter Standard vendor ID", async () => {
            const status = await statusOf(peer =>
                peer.commandsOf(OperationalCredentialsClient).setVidVerificationStatement({ vendorId: VendorId(0) }),
            );

            expect(status).equals(Status.ConstraintError);
        });
    });

    describe("UpdateNOC", () => {
        const GroupcastDeviceRoot = MockServerNode.RootEndpoint.with(
            GroupcastServer.with("Listener", "Sender"),
            GroupKeyManagementServer,
            AccessControlServer.with("Extension", "Auxiliary"),
        );
        const GROUP = GroupId(0x0001);

        function peerOf(controller: ServerNode) {
            const peer = controller.peers.get("peer1");
            if (peer === undefined) {
                expect.fail("The controller has no commissioned peer");
            }
            return peer;
        }

        /** Runs UpdateNOC from the controller with a NOC for `fabricId`, by default the fabric's own. */
        async function updateNoc(controller: ServerNode, device: ServerNode, fabricId?: FabricId) {
            const peer = peerOf(controller);
            // Mock crypto would derive the operational key pair the fabric already holds
            const crypto = device.env.get(Crypto);
            if (!("entropic" in crypto)) {
                expect.fail("The device does not use mock crypto");
            }
            crypto.entropic = true;

            await peer
                .commandsOf(GeneralCommissioningClient)
                .armFailSafe({ expiryLengthSeconds: FAILSAFE_LENGTH_S, breadcrumb: 1 });
            const commands = peer.commandsOf(OperationalCredentialsClient);
            const { nocsrElements } = await commands.csrRequest({
                csrNonce: crypto.randomBytes(32),
                isForUpdateNoc: true,
            });
            const fabric = device.env.get(FabricManager).fabrics[0];
            const { certSigningRequest } = TlvCertSigningRequest.decode(nocsrElements);
            const publicKey = await Certificate.getPublicKeyFromCsr(crypto, certSigningRequest);
            const noc = await controller.env
                .get(FabricAuthority)
                .ca.generateNoc(publicKey, fabricId ?? fabric.fabricId, fabric.nodeId);

            return await commands.updateNoc({ nocValue: noc, icacValue: fabric.intermediateCACert });
        }

        /** A device on the controller's fabric with a Groupcast group on endpoint 1 with an auxiliary ACL entry. */
        async function deviceWithGroup(site: MockSite) {
            const { controller, device } = await site.addCommissionedPair({
                device: { type: GroupcastDeviceRoot, device: OnOffLightDevice },
            });
            await peerOf(controller)
                .commandsOf(GroupcastClient)
                .joinGroup({
                    groupId: GROUP,
                    endpoints: [EndpointNumber(1)],
                    keySetId: 1,
                    key: new Uint8Array(16),
                    useAuxiliaryAcl: true,
                    mcastAddrPolicy: Groupcast.MulticastAddrPolicy.IanaAddr,
                });
            await MockTime.yield3();
            const fabrics = device.env.get(FabricManager);
            return { controller, device, fabrics, previous: fabrics.fabrics[0] };
        }

        /** What a group message for {@link GROUP} would meet on `fabric`: key, endpoints, address and ACL. */
        function groupStateOf(fabric: Fabric) {
            const { keySetId, key } = fabric.groups.currentKeyForGroup(GROUP);
            const session: AccessControl.RemoteActorSession = {
                fabric: fabric.fabricIndex,
                subject: fabric.groups.subjectForGroup(GROUP, key),
                authorityAt: () => AccessControl.Authority.Granted,
            };
            return {
                keySetId,
                endpoints: fabric.groups.endpoints.get(GROUP),
                address: fabric.groups.multicastAddressFor(GROUP),
                onOffAccess: fabric.accessControl.accessLevelsFor(
                    session,
                    { path: DataModelPath.none, endpoint: EndpointNumber(1), cluster: OnOff.Cluster.id },
                    { id: EndpointNumber(1), deviceTypes: [] },
                ),
            };
        }

        const expectedGroupState = {
            keySetId: 1,
            endpoints: [EndpointNumber(1)],
            address: IANA_GROUPCAST_MULTICAST_ADDRESS,
            onOffAccess: [AccessLevel.Operate, AccessLevel.View],
        };

        it("keeps group keys, endpoints, multicast policy and group ACL of the fabric", async () => {
            await using site = new MockSite();
            const { controller, device, fabrics, previous } = await deviceWithGroup(site);
            expect(groupStateOf(previous)).deep.equals(expectedGroupState);
            const { network, changes } = recordMembershipChanges(device);
            expect(network.isMemberOf(IANA_GROUPCAST_MULTICAST_ADDRESS)).true;
            const atReplacement = new Array<unknown>();
            fabrics.events.replaced.on(fabric => void atReplacement.push(groupStateOf(fabric)));

            const { statusCode } = await updateNoc(controller, device);

            expect(statusCode).equals(OperationalCredentials.NodeOperationalCertStatus.Ok);
            expect(fabrics.fabrics[0]).not.equals(previous);
            expect(atReplacement).deep.equals([expectedGroupState]);
            for (let i = 0; i < 20; i++) {
                await MockTime.yield3();
            }
            expect(changes).deep.equals([]);
            expect(network.isMemberOf(IANA_GROUPCAST_MULTICAST_ADDRESS)).true;
        });

        it("keeps the group state when the fail-safe expires and restores the previous credentials", async () => {
            await using site = new MockSite();
            const { controller, device, fabrics, previous } = await deviceWithGroup(site);
            const restored = new Promise<void>(resolve =>
                fabrics.events.replaced.on(fabric => {
                    if (fabric === previous) {
                        resolve();
                    }
                }),
            );

            await updateNoc(controller, device);
            const replacement = fabrics.fabrics[0];
            expect(replacement).not.equals(previous);
            replacement.groups.endpoints.set(GROUP, [EndpointNumber(1), EndpointNumber(2)]);
            await MockTime.resolve(restored, { macrotasks: true });

            expect(fabrics.fabrics[0]).equals(previous);
            expect(groupStateOf(previous)).deep.equals({
                ...expectedGroupState,
                endpoints: [EndpointNumber(1), EndpointNumber(2)],
            });

            const events = new Array<string>();
            fabrics.events.deleting.on(fabric => void events.push(`deleting ${fabric.fabricIndex}`));
            fabrics.events.deleted.on(fabric => void events.push(`deleted ${fabric.fabricIndex}`));
            await previous.delete();
            expect(events).deep.equals([`deleting ${previous.fabricIndex}`, `deleted ${previous.fabricIndex}`]);
        });

        it("rejects a NOC for another fabric ID with InvalidNOC", async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair();
            const fabric = device.env.get(FabricManager).fabrics[0];

            const { statusCode } = await updateNoc(controller, device, FabricId(fabric.fabricId + 1n));

            expect(statusCode).equals(OperationalCredentials.NodeOperationalCertStatus.InvalidNoc);
            expect(device.env.get(FabricManager).fabrics[0]).equals(fabric);
        });
    });

    describe("while a fail-safe without AddNOC or UpdateNOC is armed", () => {
        function commandsOf(peer: ClientNode) {
            return peer.commandsOf(OperationalCredentialsClient);
        }

        async function changeFabric(change: (commands: ReturnType<typeof commandsOf>) => Promise<unknown>) {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair();
            const peer = controller.peers.get("peer1")!;
            const commands = commandsOf(peer);
            await peer
                .commandsOf(GeneralCommissioningClient)
                .armFailSafe({ expiryLengthSeconds: FAILSAFE_LENGTH_S, breadcrumb: 1 });

            const changes = new Array<string>();
            device.events.commissioning.fabricsChanged.on((index, action) => void changes.push(`${index} ${action}`));
            using log = captureLog(LogLevel.ERROR);

            await change(commands);

            expect(log.messages).deep.equals([]);
            expect(changes).deep.equals([`${FabricIndex(1)} updated`]);
            expect(device.stateOf(CommissioningServer).commissioned).true;
            return device.stateOf(OperationalCredentialsServer).fabrics[0];
        }

        it("treats UpdateFabricLabel as a final fabric change", async () => {
            const fabric = await changeFabric(commands => commands.updateFabricLabel({ label: "renamed" }));

            expect(fabric.label).equals("renamed");
        });

        it("treats SetVIDVerificationStatement as a final fabric change", async () => {
            const fabric = await changeFabric(commands =>
                commands.setVidVerificationStatement({ vendorId: VendorId(0xfff2) }),
            );

            expect(fabric.vendorId).equals(VendorId(0xfff2));
        });
    });
});
