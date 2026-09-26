/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ActionContext } from "#behavior/context/ActionContext.js";
import { ControllerBehavior } from "#behavior/system/controller/ControllerBehavior.js";
import { AccessControlClient, AccessControlServer } from "#behaviors/access-control";
import { ServerNode } from "#node/ServerNode.js";
import { Environment, InternalError, ObservableValue } from "@matter/general";
import {
    AclEndpointContext,
    AclEntry,
    AclList,
    Fabric,
    FabricManager,
    IncomingSubjectDescriptor,
} from "@matter/protocol";
import { ClusterId, EndpointNumber, FabricIndex, NodeId, Status, StatusResponseError } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { MockServerNode } from "../../node/mock-server-node.js";
import { MockSite } from "../../node/mock-site.js";

type Entry = AccessControl.AccessControlEntry;

const AuxiliaryRoot = ServerNode.RootEndpointWithoutGroupcast.with(
    ControllerBehavior,
    AccessControlServer.with("Extension", "Auxiliary"),
);
const PlainRoot = ServerNode.RootEndpointWithoutGroupcast.with(ControllerBehavior);

function createProvider(): AccessControlServer.AuxAclObservable {
    return ObservableValue<[Entry[], ActionContext?]>([]);
}

function auxEntry(fabricIndex: FabricIndex, endpoints: number[], groups = [0x0101]): Entry {
    return {
        privilege: AccessControl.AccessControlEntryPrivilege.Operate,
        authMode: AccessControl.AccessControlEntryAuthMode.Group,
        subjects: groups.map(g => NodeId(BigInt(g))),
        targets: endpoints.map(ep => ({ cluster: null, endpoint: EndpointNumber(ep), deviceType: null })),
        auxiliaryType: AccessControl.AccessControlAuxiliaryType.Groupcast,
        fabricIndex,
    };
}

/** Records every effective ACL installed on a fabric's access control, in order. */
function recordAcl(fabric: Fabric) {
    const installed = new Array<Entry[]>();
    const accessControl = fabric.accessControl;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(accessControl), "aclList")?.set;
    if (setter === undefined) {
        throw new InternalError("FabricAccessControl.aclList setter not found");
    }
    Object.defineProperty(accessControl, "aclList", {
        configurable: true,
        set(list: Entry[]) {
            installed.push(list);
            setter.call(accessControl, list);
        },
    });
    return installed;
}

type WithAuxiliaryType = { readonly auxiliaryType?: AccessControl.AccessControlAuxiliaryType };
const auxOf = <T extends WithAuxiliaryType>(list: readonly T[] | undefined) =>
    (list ?? []).filter(e => e.auxiliaryType !== undefined);
const realOf = <T extends WithAuxiliaryType>(list: readonly T[] | undefined) =>
    (list ?? []).filter(e => e.auxiliaryType === undefined);

describe("AccessControlServer auxiliary ACL", () => {
    before(() => {
        MockTime.init();
    });

    it("installs provider entries together with the real entries", async () => {
        await using node = await MockServerNode.createOnline(AuxiliaryRoot, { device: undefined });
        const fabric = await node.addFabric();
        const installed = recordAcl(fabric);
        const provider = createProvider();
        await node.act(agent => agent.get(AccessControlServer).registerAuxAclProvider(provider));

        provider.emit([auxEntry(fabric.fabricIndex, [1])]);
        await MockTime.yield3();

        const effective = installed.at(-1);
        expect(auxOf(effective)).deep.equals([auxEntry(fabric.fabricIndex, [1])]);
        expect(realOf(effective)).deep.equals(node.stateOf(AccessControlServer).acl);
        expect(node.stateOf(AccessControlServer).auxiliaryAcl).deep.equals([auxEntry(fabric.fabricIndex, [1])]);
    });

    it("installs unchanged provider entries after a restart", async () => {
        const environment = new Environment("test");
        const options = { id: "aux-restart", device: undefined, environment };
        const entries = new Array<Entry>();
        {
            await using node = await MockServerNode.createOnline(AuxiliaryRoot, options);
            const fabric = await node.addFabric();
            entries.push(auxEntry(fabric.fabricIndex, [1]));
            const provider = createProvider();
            await node.act(agent => agent.get(AccessControlServer).registerAuxAclProvider(provider));
            provider.emit([...entries]);
            await MockTime.yield3();
            expect(node.stateOf(AccessControlServer).auxiliaryAcl).deep.equals(entries);
        }

        await using node = await MockServerNode.createOnline(AuxiliaryRoot, options);
        const [fabric] = [...node.env.get(FabricManager)];
        const installed = recordAcl(fabric);
        const provider = createProvider();
        provider.emit([...entries]);
        await node.act(agent => agent.get(AccessControlServer).registerAuxAclProvider(provider));
        await MockTime.yield3();

        expect(auxOf(installed.at(-1))).deep.equals(entries);
    });

    it("keeps auxiliary entries when the ACL is written locally", async () => {
        await using node = await MockServerNode.createOnline(AuxiliaryRoot, { device: undefined });
        const fabric = await node.addFabric();
        const installed = recordAcl(fabric);
        const provider = createProvider();
        await node.act(agent => agent.get(AccessControlServer).registerAuxAclProvider(provider));
        provider.emit([auxEntry(fabric.fabricIndex, [1])]);
        await MockTime.yield3();

        const viewEntry: Entry = {
            privilege: AccessControl.AccessControlEntryPrivilege.View,
            authMode: AccessControl.AccessControlEntryAuthMode.Case,
            subjects: [NodeId(0x1234n)],
            targets: null,
            fabricIndex: fabric.fabricIndex,
        };
        await node.setStateOf(AccessControlServer, { acl: [...node.stateOf(AccessControlServer).acl, viewEntry] });

        const effective = installed.at(-1);
        expect(realOf(effective)).deep.equals(node.stateOf(AccessControlServer).acl);
        expect(realOf(effective).map(e => e.subjects)).deep.includes([NodeId(0x1234n)]);
        expect(auxOf(effective)).deep.equals([auxEntry(fabric.fabricIndex, [1])]);
    });

    it("rejects a local ACL write with an entry that includes AuxiliaryType with FAILURE", async () => {
        await using node = await MockServerNode.createOnline(AuxiliaryRoot, { device: undefined });
        const fabric = await node.addFabric();
        const before = node.stateOf(AccessControlServer).acl;

        const error = await node
            .setStateOf(AccessControlServer, {
                acl: [
                    ...before,
                    {
                        privilege: AccessControl.AccessControlEntryPrivilege.View,
                        authMode: AccessControl.AccessControlEntryAuthMode.Case,
                        subjects: [NodeId(0x1234n)],
                        targets: null,
                        auxiliaryType: AccessControl.AccessControlAuxiliaryType.Groupcast,
                        fabricIndex: fabric.fabricIndex,
                    },
                ],
            })
            .then(
                () => undefined,
                (e: unknown) => e,
            );

        expect(error instanceof StatusResponseError && error.code).equals(Status.Failure);
        expect(node.stateOf(AccessControlServer).acl).deep.equals(before);
    });

    it("splits provider entries to the per-entry subject and target limits", async () => {
        await using node = await MockServerNode.createOnline(AuxiliaryRoot, { device: undefined });
        const fabric = await node.addFabric();
        const installed = recordAcl(fabric);
        const provider = createProvider();
        await node.act(agent => agent.get(AccessControlServer).registerAuxAclProvider(provider));

        provider.emit([auxEntry(fabric.fabricIndex, [1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5])]);
        await MockTime.yield3();

        const expected = [
            auxEntry(fabric.fabricIndex, [1, 2, 3, 4], [1, 2, 3, 4]),
            auxEntry(fabric.fabricIndex, [5, 6], [1, 2, 3, 4]),
            auxEntry(fabric.fabricIndex, [1, 2, 3, 4], [5]),
            auxEntry(fabric.fabricIndex, [5, 6], [5]),
        ];
        expect(auxOf(installed.at(-1))).deep.equals(expected);
        expect(node.stateOf(AccessControlServer).auxiliaryAcl).deep.equals(expected);
    });

    it("ignores provider entries without AuxiliaryType", async () => {
        await using node = await MockServerNode.createOnline(AuxiliaryRoot, { device: undefined });
        const fabric = await node.addFabric();
        const installed = recordAcl(fabric);
        const provider = createProvider();
        await node.act(agent => agent.get(AccessControlServer).registerAuxAclProvider(provider));

        const { auxiliaryType: _, ...untyped } = auxEntry(fabric.fabricIndex, [2]);
        provider.emit([untyped, auxEntry(fabric.fabricIndex, [1])]);
        await MockTime.yield3();

        expect(
            installed.at(-1)?.filter(e => e.authMode === AccessControl.AccessControlEntryAuthMode.Group),
        ).deep.equals([auxEntry(fabric.fabricIndex, [1])]);
        expect(node.stateOf(AccessControlServer).auxiliaryAcl).deep.equals([auxEntry(fabric.fabricIndex, [1])]);
    });

    it("does not install provider entries without the Auxiliary feature", async () => {
        await using node = await MockServerNode.createOnline(PlainRoot, { device: undefined });
        const fabric = await node.addFabric();
        const installed = recordAcl(fabric);
        const provider = createProvider();
        await node.act(agent => agent.get(AccessControlServer).registerAuxAclProvider(provider));

        provider.emit([auxEntry(fabric.fabricIndex, [1])]);
        await MockTime.yield3();
        await node.setStateOf(AccessControlServer, {
            acl: [
                ...node.stateOf(AccessControlServer).acl,
                {
                    privilege: AccessControl.AccessControlEntryPrivilege.View,
                    authMode: AccessControl.AccessControlEntryAuthMode.Case,
                    subjects: [NodeId(0x1234n)],
                    targets: null,
                    fabricIndex: fabric.fabricIndex,
                },
            ],
        });

        expect(installed.length).greaterThan(0);
        expect(installed.every(list => auxOf(list).length === 0)).true;
    });

    describe("controller writes", () => {
        async function commissionedPair() {
            const site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({ device: { type: AuxiliaryRoot } });
            const peer = controller.peers.get("peer1");
            if (peer === undefined) {
                throw new InternalError("peer1 missing");
            }
            const [fabric] = [...device.env.get(FabricManager)];
            return { site, device, peer, fabric };
        }

        it("keeps auxiliary entries across a controller ACL write", async () => {
            const { site, device, peer, fabric } = await commissionedPair();
            await using _site = site;
            const installed = recordAcl(fabric);
            const provider = createProvider();
            await device.act(agent => agent.get(AccessControlServer).registerAuxAclProvider(provider));
            provider.emit([auxEntry(fabric.fabricIndex, [1])]);
            await MockTime.yield3();

            const acl = peer.stateOf(AccessControlClient).acl;
            const viewEntry: Entry = {
                privilege: AccessControl.AccessControlEntryPrivilege.View,
                authMode: AccessControl.AccessControlEntryAuthMode.Case,
                subjects: [NodeId(0x1234n)],
                targets: null,
                fabricIndex: fabric.fabricIndex,
            };
            await MockTime.resolve(peer.setStateOf(AccessControlClient, { acl: [...acl, viewEntry] }));

            const effective = installed.at(-1);
            expect(realOf(effective)).length(2);
            expect(auxOf(effective)).deep.equals([auxEntry(fabric.fabricIndex, [1])]);
        });

        it("keeps the applied real entries when auxiliary entries change during a controller ACL write", async () => {
            const { site, device, peer, fabric } = await commissionedPair();
            await using _site = site;
            const provider = createProvider();
            await device.act(agent => agent.get(AccessControlServer).registerAuxAclProvider(provider));
            await MockTime.yield3();

            const appliedBefore = realOf(device.stateOf(AccessControlServer).acl);
            const installed = recordAcl(fabric);

            device.eventsOf(AccessControlServer).acl$Changed.on(() => {
                provider.emit([auxEntry(fabric.fabricIndex, [1])]);
            });

            const acl = peer.stateOf(AccessControlClient).acl;
            const viewEntry: Entry = {
                privilege: AccessControl.AccessControlEntryPrivilege.View,
                authMode: AccessControl.AccessControlEntryAuthMode.Case,
                subjects: [NodeId(0x1234n)],
                targets: null,
                fabricIndex: fabric.fabricIndex,
            };
            await MockTime.resolve(peer.setStateOf(AccessControlClient, { acl: [...acl, viewEntry] }));

            // The auxiliary change lands before the delayed write is applied
            const auxChange = installed.findIndex(list => auxOf(list).length > 0);
            expect(auxChange).within(0, installed.length - 2);
            expect(realOf(installed[auxChange])).deep.equals(appliedBefore);
            const effective = installed.at(-1);
            expect(realOf(effective)).length(2);
            expect(auxOf(effective)).deep.equals([auxEntry(fabric.fabricIndex, [1])]);
        });

        it("rejects a written ACL entry that includes AuxiliaryType with FAILURE", async () => {
            const { site, peer, fabric } = await commissionedPair();
            await using _site = site;

            const acl = peer.stateOf(AccessControlClient).acl;
            const write = peer.setStateOf(AccessControlClient, {
                acl: [
                    ...acl,
                    {
                        privilege: AccessControl.AccessControlEntryPrivilege.View,
                        authMode: AccessControl.AccessControlEntryAuthMode.Case,
                        subjects: [NodeId(0x1234n)],
                        targets: null,
                        auxiliaryType: AccessControl.AccessControlAuxiliaryType.Groupcast,
                        fabricIndex: fabric.fabricIndex,
                    },
                ],
            });

            const error = await MockTime.resolve(write).then(
                () => undefined,
                (e: unknown) => e,
            );
            expect(error instanceof StatusResponseError && error.code).equals(Status.Failure);
        });
    });

    it("applies an overridden extension access check to a fabric commissioned after startup", async () => {
        const checkedFabrics = new Set<FabricIndex>();
        class CheckingAccessControlServer extends AccessControlServer {
            protected override extensionEntryAccessCheck(
                _aclList: AclList,
                aclEntry: AclEntry,
                _subjectDesc: IncomingSubjectDescriptor,
                _endpoint: AclEndpointContext,
                _clusterId: ClusterId,
            ) {
                checkedFabrics.add(aclEntry.fabricIndex);
                return true;
            }
        }

        await using site = new MockSite();
        const { device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpointWithoutGroupcast.with(CheckingAccessControlServer.with("Extension")),
            },
        });

        const [fabric] = [...device.env.get(FabricManager)];
        expect(checkedFabrics.has(fabric.fabricIndex)).true;
    });
});
