/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalActorContext } from "#behavior/context/server/LocalActorContext.js";
import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import { Api } from "#behavior/system/remote/api/Api.js";
import type { RemoteRequest } from "#behavior/system/remote/api/RemoteRequest.js";
import { AccessControlClient, AccessControlServer } from "#behaviors/access-control";
import { OperationalCredentialsClient } from "#behaviors/operational-credentials";
import { UserLabelClient, UserLabelServer } from "#behaviors/user-label";
import { OnOffLightDevice } from "#devices/on-off-light";
import type { ClientNode } from "#node/ClientNode.js";
import { ServerNode } from "#node/ServerNode.js";
import { RemoteWriter } from "#storage/client/RemoteWriter.js";
import { LogLevel, MaybePromise, Millis, Seconds } from "@matter/general";
import { MockSite, captureLog, clientStructureOf, seedPeerCache, settled, subscribedPeer } from "@matter/node/testing";
import { Write, WriteError } from "@matter/protocol";
import { EndpointNumber, FabricIndex, NodeId, Status, StatusResponseError, SubjectId, TlvOfModel } from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { OperationalCredentials } from "@matter/types/clusters/operational-credentials";

type AclEntry = AccessControl.AccessControlEntry;

const OURS = FabricIndex(1);
const FOREIGN = FabricIndex(2);
const FOREIGN_SUBJECT = NodeId(0x200n);
const OWN_SUBJECT = NodeId(0x101n);
const NEW_SUBJECT = NodeId(0x102n);
const ACL_ID = String(AccessControl.attributes.acl.id);

function aclEntry(
    subject: SubjectId,
    fabricIndex: FabricIndex,
    privilege = AccessControl.AccessControlEntryPrivilege.View,
): AclEntry {
    return {
        privilege,
        authMode: AccessControl.AccessControlEntryAuthMode.Case,
        subjects: [subject],
        targets: null,
        fabricIndex,
    };
}

function adminEntry(subject: SubjectId) {
    return aclEntry(subject, OURS, AccessControl.AccessControlEntryPrivilege.Administer);
}

/** An entry of another fabric as a peer of our fabric reads it: the device leaves out its fabric-sensitive fields. */
const foreignAsReported = { fabricIndex: FOREIGN };

const foreignOnDevice = aclEntry(FOREIGN_SUBJECT, FOREIGN);

const own = aclEntry(OWN_SUBJECT, OURS);
const added = aclEntry(NEW_SUBJECT, OURS);

/** The entries of {@link list} as plain objects without the fields that hold no value. */
function entriesOf(list: readonly object[]) {
    return list.map(entry => Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)));
}

function deviceAcl(device: ServerNode) {
    return entriesOf(device.stateOf(AccessControlServer).acl);
}

function cachedAcl(peer: ClientNode) {
    return entriesOf(peer.stateOf(AccessControlClient).acl);
}

/** The ACL of {@link device} as a peer of our fabric reads it without fabric filtering. */
function aclAsReported(device: ServerNode) {
    return deviceAcl(device).map(entry => (entry.fabricIndex === OURS ? entry : { fabricIndex: entry.fabricIndex }));
}

async function settle(...nodes: Parameters<typeof settled>) {
    await MockTime.resolve(settled(...nodes), { macrotasks: true });
}

/** Waits until the cache of {@link peer} holds the ACL of {@link device}. */
async function reported(peer: ClientNode, device: ServerNode) {
    for (let wait = 0; wait < 100; wait++) {
        if (JSON.stringify(cachedAcl(peer), bigints) === JSON.stringify(aclAsReported(device), bigints)) {
            return;
        }
        await MockTime.resolve(MockTime.sleep("acl report pending", Millis(100)));
    }
    expect(cachedAcl(peer)).deep.equals(aclAsReported(device));
}

function bigints(_key: string, value: unknown) {
    return typeof value === "bigint" ? value.toString() : value;
}

/**
 * Commissions a pair on {@link site} and returns a peer whose cache is not fabric-filtered and holds
 * `[admin, foreign, own]`, where `foreign` is an entry of another fabric.  The device also has a user label list on
 * endpoint 1.  The peer has no subscription, so the cache holds a written value until a test reports another.
 */
async function unfilteredPeer(site: MockSite) {
    const { controller, device } = await site.addCommissionedPair({
        device: { type: ServerNode.RootEndpoint, device: OnOffLightDevice.with(UserLabelServer) },
    });
    const peer = await subscribedPeer(controller, "peer1");

    await MockTime.resolve(peer.set({ network: { defaultSubscription: { fabricFilter: false } } }));
    await settle(controller, device, peer);
    expect(clientStructureOf(peer).cacheFabricFiltered).false;
    expect(peer.state.commissioning.fabricIndexOnPeer).equals(OURS);

    const [deviceAdmin] = device.stateOf(AccessControlServer).acl;
    const admin = adminEntry(deviceAdmin.subjects![0]);
    expect(entriesOf([deviceAdmin])).deep.equals([admin]);
    await MockTime.resolve(device.setStateOf(AccessControlServer, { acl: [admin, foreignOnDevice, own] }));
    await reported(peer, device);
    expect(cachedAcl(peer)).deep.equals([admin, foreignAsReported, own]);

    await MockTime.resolve(peer.set({ network: { autoSubscribe: false } }));
    await settle(controller, device, peer);
    expect(clientStructureOf(peer).cacheFabricFiltered).false;

    return { controller, device, peer, admin };
}

/** Records the Write Requests {@link peer} sends. */
function recordWrites(peer: ClientNode) {
    const requests = new Array<Write>();
    const { interaction } = peer;
    const write = interaction.write.bind(interaction);
    interaction.write = request => {
        requests.push(request);
        return write(request);
    };
    return requests;
}

/** The ACL entries {@link request} carries on the wire, which leaves out FabricIndex in a write. */
function sentAcl(request: Write) {
    const [{ data }] = request.writeRequests;
    const value: unknown = TlvOfModel(AccessControl.attributes.acl).decodeTlv(data);
    if (!Array.isArray(value)) {
        expect.fail("Expected the request to carry a list");
    }
    return entriesOf(value);
}

/** {@link entries} as the wire carries them in a write. */
function withoutFabricIndex(entries: AclEntry[]) {
    return entries.map(({ fabricIndex: _, ...entry }) => entry);
}

/** Makes {@link peer} forget its fabric index on the device, as before it was known. */
async function forgetOurFabricIndex(peer: ClientNode) {
    await seedPeerCache(
        peer,
        peer,
        OperationalCredentialsClient,
        new Map([[OperationalCredentials.attributes.currentFabricIndex.id, FabricIndex.NO_FABRIC]]),
    );
    await MockTime.resolve(peer.setStateOf(CommissioningClient, { fabricIndexOnPeer: undefined }));
    expect(peer.clientPeerContext).deep.equals({});
}

/** Records the ACL of every change {@link peer} announces. */
function aclChanges(peer: ClientNode) {
    const changes = new Array<object[]>();
    peer.eventsOf(AccessControlClient).acl$Changed.on(acl => {
        changes.push(entriesOf(acl));
    });
    return changes;
}

async function captureRejection(write: () => MaybePromise<unknown>) {
    try {
        await MockTime.resolve(Promise.resolve(write()));
    } catch (e) {
        return e;
    }
    expect.fail("Expected the write to be refused");
}

function expectRefusedUnknownIndex(caught: unknown) {
    if (!(caught instanceof WriteError)) {
        expect.fail(`Expected a WriteError, got ${String(caught)}`);
    }
    expect(caught.code).equals(Status.ConstraintError);
    expect(caught.message).contains("our fabric index on the peer");
    expect(caught.message).contains("is not known yet; read operationalCredentials.currentFabricIndex first");
}

const MAY_HAVE_CHANGED = "may have changed since the list was read, so read it again and retry";

/**
 * Expects a refusal for an entry of fabric {@link written}, which says the cached entries of that fabric may have
 * changed if the cache holds some.
 */
function expectRefusedIndex(caught: unknown, written: FabricIndex, cachesWritten: boolean) {
    if (!(caught instanceof WriteError)) {
        expect.fail(`Expected a WriteError, got ${String(caught)}`);
    }
    expect(caught.code).equals(Status.ConstraintError);
    expect(caught.message).contains(
        written === FabricIndex.NO_FABRIC
            ? "Cannot write an entry of no fabric (FabricIndex.NO_FABRIC):"
            : `Cannot write an entry with fabricIndex ${written}:`,
    );
    expect(caught.message).contains(`our fabric index on the peer is ${OURS}`);
    if (cachesWritten) {
        expect(caught.message).contains(MAY_HAVE_CHANGED);
    } else {
        expect(caught.message).not.contains(MAY_HAVE_CHANGED);
    }
}

/** Expects {@link write} to be refused as {@link expectRefusedIndex} says, with nothing sent or cached. */
async function expectRefusedWrite(
    device: ServerNode,
    peer: ClientNode,
    written: FabricIndex,
    cachesWritten: boolean,
    write: () => MaybePromise<unknown>,
) {
    const onDevice = deviceAcl(device);
    const cached = cachedAcl(peer);
    const writes = recordWrites(peer);
    const changes = aclChanges(peer);

    expectRefusedIndex(await captureRejection(write), written, cachesWritten);

    expect(writes).length(0);
    expect(changes).deep.equals([]);
    expect(deviceAcl(device)).deep.equals(onDevice);
    expect(cachedAcl(peer)).deep.equals(cached);
}

function labelsOf(node: ServerNode | ClientNode) {
    const endpoint = node.parts.get(1)!;
    const state = node instanceof ServerNode ? endpoint.stateOf(UserLabelServer) : endpoint.stateOf(UserLabelClient);
    return entriesOf(state.labelList);
}

async function execute(controller: ServerNode, request: RemoteRequest) {
    const response = await MockTime.resolve(Api.execute("test", controller, request, new AbortController().signal), {
        macrotasks: true,
    });
    expect(response.kind, response.kind === "error" ? response.error.message : undefined).not.equals("error");
    return response;
}

/** {@link value} as JSON, as the Remote API reads and writes it. */
function asJson(value: unknown) {
    const parsed: unknown = JSON.parse(JSON.stringify(value, bigints));
    return parsed;
}

/** {@link list} as JSON with subjects as strings, as a subject the Remote API wrote may be a number or a bigint. */
function comparable(list: object[]) {
    return asJson(
        list.map(entry =>
            "subjects" in entry && Array.isArray(entry.subjects)
                ? { ...entry, subjects: entry.subjects.map(String) }
                : entry,
        ),
    );
}

describe("ClientNode fabric-scoped list write", () => {
    // Matter § 7.19.1.8.2: a write to a fabric-scoped list is fabric-filtered, so the device replaces only our entries
    // and ignores all others; Matter § 7.13.6: it stores every written entry under our fabric

    before(() => {
        MockTime.init();
    });

    it("shows every entry to an act and announces the full list", async () => {
        await using site = new MockSite();
        const { device, peer, admin } = await unfilteredPeer(site);
        const changes = aclChanges(peer);

        await MockTime.resolve(
            peer.act(agent => {
                const { acl } = agent.get(AccessControlClient).state;
                expect(entriesOf(acl)).deep.equals([admin, foreignAsReported, own]);
                acl.push(aclEntry(NEW_SUBJECT, FabricIndex.OMIT_FABRIC));
            }),
        );

        expect(deviceAcl(device)).deep.equals([admin, foreignOnDevice, own, added]);
        expect(cachedAcl(peer)).deep.equals([admin, foreignAsReported, own, added]);
        expect(changes).deep.equals([[admin, foreignAsReported, own, added]]);
    });

    it("writes back the full list with a new entry, sending only our entries", async () => {
        await using site = new MockSite();
        const { device, peer, admin } = await unfilteredPeer(site);
        const writes = recordWrites(peer);
        using log = captureLog(LogLevel.DEBUG);

        await MockTime.resolve(
            peer.act(agent => {
                const state = agent.get(AccessControlClient).state;
                state.acl = [...state.acl, aclEntry(NEW_SUBJECT, FabricIndex.OMIT_FABRIC)];
            }),
        );

        expect(writes).length(1);
        expect(sentAcl(writes[0])).deep.equals(withoutFabricIndex([admin, own, added]));
        expect(deviceAcl(device)).deep.equals([admin, foreignOnDevice, own, added]);
        expect(cachedAcl(peer)).deep.equals([admin, foreignAsReported, own, added]);
        const lines = log.messages.filter(message => message.includes("Leaving 1 entries not of our fabric"));
        expect(lines).length(1);
        expect(lines[0]).contains(" DEBUG ");
    });

    it("logs nothing about other fabrics when the written list holds none", async () => {
        await using site = new MockSite();
        const { peer, admin } = await unfilteredPeer(site);
        using log = captureLog(LogLevel.DEBUG);

        await MockTime.resolve(peer.setStateOf(AccessControlClient, { acl: [admin, own] }));

        expect(log.messages.filter(message => message.includes("entries not of our fabric"))).deep.equals([]);
    });

    it("writes two fabric-scoped lists of one cluster and keeps the other fabric's entry in both caches", async () => {
        await using site = new MockSite();
        const { device, peer, admin } = await unfilteredPeer(site);
        const extension = { data: new Uint8Array([0x17, 0x18]), fabricIndex: OURS };

        await MockTime.resolve(
            peer.act(agent => {
                const state = agent.get(AccessControlClient).state;
                state.acl.splice(1, 1);
                state.extension!.push({ ...extension, fabricIndex: FabricIndex.OMIT_FABRIC });
            }),
        );

        expect(deviceAcl(device)).deep.equals([admin, foreignOnDevice, own]);
        expect(cachedAcl(peer)).deep.equals([admin, foreignAsReported, own]);
        expect(entriesOf(device.stateOf(AccessControlServer).extension!)).deep.equals([extension]);
        expect(entriesOf(peer.stateOf(AccessControlClient).extension!)).deep.equals([extension]);
    });

    it("keeps the cache unchanged when the device declines the list", async () => {
        await using site = new MockSite();
        const { device, peer, admin } = await unfilteredPeer(site);
        const onDevice = deviceAcl(device);
        const cached = cachedAcl(peer);
        const tooMany = Array.from({ length: 40 }, (_, index) => aclEntry(NodeId(0x300 + index), OURS));

        const caught = await captureRejection(() => peer.setStateOf(AccessControlClient, { acl: [admin, ...tooMany] }));

        if (!(caught instanceof StatusResponseError)) {
            expect.fail(`Expected the device's status, got ${String(caught)}`);
        }
        expect(caught.code).not.equals(Status.Success);

        expect(deviceAcl(device)).deep.equals(onDevice);
        expect(cachedAcl(peer)).deep.equals(cached);
    });

    it("writes back the full list from a session opened by a reactor, without a peer context", async () => {
        await using site = new MockSite();
        const { device, peer, admin } = await unfilteredPeer(site);

        await MockTime.resolve(
            Promise.resolve(
                LocalActorContext.act("reactor-like", context => {
                    const state = peer.agentFor(context).get(AccessControlClient).state;
                    state.acl = [...state.acl, aclEntry(NEW_SUBJECT, FabricIndex.OMIT_FABRIC)];
                }),
            ),
        );

        expect(deviceAcl(device)).deep.equals([admin, foreignOnDevice, own, added]);
        expect(cachedAcl(peer)).deep.equals([admin, foreignAsReported, own, added]);
    });

    it("replaces only our entries on a whole-list write without the other fabric's entry", async () => {
        await using site = new MockSite();
        const { device, peer, admin } = await unfilteredPeer(site);
        const changes = aclChanges(peer);

        await MockTime.resolve(
            peer.setStateOf(AccessControlClient, { acl: [admin, aclEntry(NEW_SUBJECT, FabricIndex.OMIT_FABRIC)] }),
        );

        expect(deviceAcl(device)).deep.equals([admin, foreignOnDevice, added]);
        expect(cachedAcl(peer)).deep.equals([admin, foreignAsReported, added]);
        expect(changes).deep.equals([[admin, foreignAsReported, added]]);
    });

    describe("refuses without sending anything", () => {
        it("a pushed entry of another fabric", async () => {
            await using site = new MockSite();
            const { device, peer } = await unfilteredPeer(site);

            await expectRefusedWrite(device, peer, FOREIGN, true, () =>
                peer.act(agent => {
                    agent.get(AccessControlClient).state.acl.push(aclEntry(NEW_SUBJECT, FOREIGN));
                }),
            );
        });

        it("an entry with a wrong explicit fabric index, such as the controller's own index", async () => {
            await using site = new MockSite();
            const { device, peer, admin } = await unfilteredPeer(site);
            const localIndex = FabricIndex(5);

            await expectRefusedWrite(device, peer, localIndex, false, () =>
                peer.setStateOf(AccessControlClient, { acl: [admin, own, aclEntry(NEW_SUBJECT, localIndex)] }),
            );
        });

        it("an edited entry of another fabric", async () => {
            await using site = new MockSite();
            const { device, peer, admin } = await unfilteredPeer(site);

            await expectRefusedWrite(device, peer, FOREIGN, true, () =>
                peer.setStateOf(AccessControlClient, { acl: [admin, aclEntry(FOREIGN_SUBJECT, FOREIGN), own] }),
            );
        });

        it("an entry with FabricIndex.NO_FABRIC", async () => {
            await using site = new MockSite();
            const { device, peer, admin } = await unfilteredPeer(site);

            await expectRefusedWrite(device, peer, FabricIndex.NO_FABRIC, false, () =>
                peer.act(agent => {
                    const state = agent.get(AccessControlClient).state;
                    state.acl = [admin, own, aclEntry(NEW_SUBJECT, FabricIndex.NO_FABRIC)];
                }),
            );
        });
    });

    it("keeps the other fabric's entry in the cache when an act removes it", async () => {
        await using site = new MockSite();
        const { device, peer, admin } = await unfilteredPeer(site);

        await MockTime.resolve(
            peer.act(agent => {
                agent.get(AccessControlClient).state.acl.splice(1, 2);
            }),
        );

        expect(deviceAcl(device)).deep.equals([admin, foreignOnDevice]);
        expect(cachedAcl(peer)).deep.equals([admin, foreignAsReported]);
    });

    it("writes back a list read before a report changed the other fabric's entry", async () => {
        await using site = new MockSite();
        const { device, peer, admin } = await unfilteredPeer(site);
        const reportedForeign = { fabricIndex: FOREIGN, privilege: 3 };
        const writes = recordWrites(peer);

        await MockTime.resolve(
            peer.act(async agent => {
                const state = agent.get(AccessControlClient).state;
                const read = [...state.acl];
                await seedPeerCache(
                    peer,
                    peer,
                    AccessControlClient,
                    new Map([[ACL_ID, [admin, reportedForeign, own]]]),
                );
                state.acl = [...read, aclEntry(NEW_SUBJECT, FabricIndex.OMIT_FABRIC)];
            }),
        );

        expect(writes).length(1);
        expect(deviceAcl(device)).deep.equals([admin, foreignOnDevice, own, added]);
        expect(cachedAcl(peer)).deep.equals([admin, reportedForeign, own, added]);
    });

    it("refuses a write back of copied entries after a report changed the other fabric's entry", async () => {
        await using site = new MockSite();
        const { device, peer, admin } = await unfilteredPeer(site);
        const reportedAcl = [admin, { fabricIndex: FOREIGN, privilege: 3 }, own];
        const onDevice = deviceAcl(device);
        const writes = recordWrites(peer);

        const caught = await captureRejection(() =>
            peer.act(async agent => {
                const state = agent.get(AccessControlClient).state;
                const copied = state.acl.map(entry => ({ ...entry }));
                await seedPeerCache(peer, peer, AccessControlClient, new Map([[ACL_ID, reportedAcl]]));
                state.acl = [...copied, aclEntry(NEW_SUBJECT, FabricIndex.OMIT_FABRIC)];
            }),
        );

        expectRefusedIndex(caught, FOREIGN, true);
        expect(writes).length(0);
        expect(deviceAcl(device)).deep.equals(onDevice);
        expect(cachedAcl(peer)).deep.equals(reportedAcl);
    });

    it("keeps the other fabrics' entries of a report that arrives during the act", async () => {
        await using site = new MockSite();
        const { device, peer, admin } = await unfilteredPeer(site);
        const reportedForeign = { fabricIndex: FabricIndex(3) };

        await MockTime.resolve(
            peer.act(async agent => {
                agent.get(AccessControlClient).state.acl.push(aclEntry(NEW_SUBJECT, FabricIndex.OMIT_FABRIC));
                await seedPeerCache(
                    peer,
                    peer,
                    AccessControlClient,
                    new Map([[ACL_ID, [admin, foreignAsReported, reportedForeign, own]]]),
                );
            }),
        );

        expect(deviceAcl(device)).deep.equals([admin, foreignOnDevice, own, added]);
        expect(cachedAcl(peer)).deep.equals([admin, foreignAsReported, reportedForeign, own, added]);
    });

    it("writes when a report changes the other fabric's entry during the act and caches that entry", async () => {
        await using site = new MockSite();
        const { device, peer, admin } = await unfilteredPeer(site);
        const reportedForeign = { fabricIndex: FOREIGN, privilege: 3 };

        await MockTime.resolve(
            peer.act(async agent => {
                agent.get(AccessControlClient).state.acl.push(aclEntry(NEW_SUBJECT, FabricIndex.OMIT_FABRIC));
                await seedPeerCache(
                    peer,
                    peer,
                    AccessControlClient,
                    new Map([[ACL_ID, [admin, reportedForeign, own]]]),
                );
            }),
        );

        expect(deviceAcl(device)).deep.equals([admin, foreignOnDevice, own, added]);
        expect(cachedAcl(peer)).deep.equals([admin, reportedForeign, own, added]);
    });

    it("keeps a report that arrives while the write is in flight", async () => {
        await using site = new MockSite();
        const { peer, admin } = await unfilteredPeer(site);

        const reportedAcl = [own, foreignAsReported, admin];
        const { interaction } = peer;
        const write = interaction.write.bind(interaction);
        interaction.write = async <T extends Write>(request: T) => {
            const result = await write(request);
            await seedPeerCache(peer, peer, AccessControlClient, new Map([[ACL_ID, reportedAcl]]));
            return result;
        };

        await MockTime.resolve(
            peer.act(agent => {
                agent.get(AccessControlClient).state.acl.push(aclEntry(NEW_SUBJECT, FabricIndex.OMIT_FABRIC));
            }),
        );

        expect(cachedAcl(peer)).deep.equals(reportedAcl);
    });

    // Characterization: a report replaces the cached list whatever was written before
    it("takes a later report as the device sends it, in its order and with the other fabric's entry", async () => {
        await using site = new MockSite();
        const { device, peer, admin } = await unfilteredPeer(site);

        await MockTime.resolve(
            peer.act(agent => {
                agent.get(AccessControlClient).state.acl.push(aclEntry(NEW_SUBJECT, FabricIndex.OMIT_FABRIC));
            }),
        );
        await MockTime.resolve(device.setStateOf(AccessControlServer, { acl: [foreignOnDevice, added, admin, own] }));
        await MockTime.resolve(peer.set({ network: { autoSubscribe: true } }));
        await reported(peer, device);

        expect(cachedAcl(peer)).deep.equals([foreignAsReported, added, admin, own]);
    });

    it("writes a fabric-scoped list and a plain list in one request", async () => {
        await using site = new MockSite();
        const { device, peer, admin } = await unfilteredPeer(site);
        const writes = recordWrites(peer);
        const label = { label: "room", value: "kitchen" };

        await MockTime.resolve(
            peer.act(agent => {
                agent.get(AccessControlClient).state.acl.push(aclEntry(NEW_SUBJECT, FabricIndex.OMIT_FABRIC));
                peer.parts.get(1)!.agentFor(agent.context).get(UserLabelClient).state.labelList.push(label);
            }),
        );

        expect(writes).length(1);
        expect(deviceAcl(device)).deep.equals([admin, foreignOnDevice, own, added]);
        expect(cachedAcl(peer)).deep.equals([admin, foreignAsReported, own, added]);
        expect(labelsOf(device)).deep.equals([label]);
        expect(labelsOf(peer)).deep.equals([label]);
    });

    describe("through the Remote API", () => {
        // Characterization: the Remote API shows every entry
        it("reads the entries of every fabric", async () => {
            await using site = new MockSite();
            const { controller, admin } = await unfilteredPeer(site);

            const response = await execute(controller, {
                target: "peers/peer1/0/accessControl/acl",
                method: "read",
            });

            expect(response.kind === "value" && response.value.js).deep.equals(
                asJson([admin, { fabricIndex: 2 }, own]),
            );
        });

        it("adds an entry while the cache holds an entry of another fabric", async () => {
            await using site = new MockSite();
            const { controller, device, peer, admin } = await unfilteredPeer(site);
            const { fabricIndex: _, ...entry } = added;

            await execute(controller, {
                target: "peers/peer1/0/accessControl/acl",
                method: "add",
                value: asJson(entry),
            });

            expect(comparable(deviceAcl(device))).deep.equals(comparable([admin, foreignOnDevice, own, added]));
            expect(comparable(cachedAcl(peer))).deep.equals(comparable([admin, foreignAsReported, own, added]));
        });

        it("writes back the list it read with a new entry", async () => {
            await using site = new MockSite();
            const { controller, device, peer, admin } = await unfilteredPeer(site);
            const read = await execute(controller, { target: "peers/peer1/0/accessControl/acl", method: "read" });
            const list = read.kind === "value" && Array.isArray(read.value.js) ? read.value.js : [];

            await execute(controller, {
                target: "peers/peer1/0/accessControl/acl",
                method: "write",
                value: [...list, asJson(added)],
            });

            expect(comparable(deviceAcl(device))).deep.equals(comparable([admin, foreignOnDevice, own, added]));
            expect(comparable(cachedAcl(peer))).deep.equals(comparable([admin, foreignAsReported, own, added]));
        });

        it("keeps the other fabric's entry in the cache when a delete names it", async () => {
            await using site = new MockSite();
            const { controller, device, peer, admin } = await unfilteredPeer(site);

            await execute(controller, { target: "peers/peer1/0/accessControl/acl/1", method: "delete" });

            expect(deviceAcl(device)).deep.equals([admin, foreignOnDevice, own]);
            expect(cachedAcl(peer)).deep.equals([admin, foreignAsReported, own]);
        });
    });

    describe("with our fabric index unknown", () => {
        it("refuses a whole-list write without sending anything when the cache is not fabric-filtered", async () => {
            await using site = new MockSite();
            const { device, peer, admin } = await unfilteredPeer(site);
            await forgetOurFabricIndex(peer);
            const onDevice = deviceAcl(device);
            const cached = cachedAcl(peer);
            const writes = recordWrites(peer);
            const changes = aclChanges(peer);

            const caught = await captureRejection(() =>
                peer.setStateOf(AccessControlClient, {
                    acl: [admin, aclEntry(NEW_SUBJECT, FabricIndex.OMIT_FABRIC)],
                }),
            );

            expectRefusedUnknownIndex(caught);
            expect(writes).length(0);
            expect(changes).deep.equals([]);
            expect(deviceAcl(device)).deep.equals(onDevice);
            expect(cachedAcl(peer)).deep.equals(cached);
        });

        it("refuses an act that edits only a fabric-scoped list", async () => {
            await using site = new MockSite();
            const { device, peer } = await unfilteredPeer(site);
            await forgetOurFabricIndex(peer);
            const onDevice = deviceAcl(device);
            const cached = cachedAcl(peer);
            const writes = recordWrites(peer);
            const changes = aclChanges(peer);

            const caught = await captureRejection(() =>
                peer.act(agent => {
                    agent.get(AccessControlClient).state.acl.pop();
                }),
            );

            expectRefusedUnknownIndex(caught);
            expect(writes).length(0);
            expect(changes).deep.equals([]);
            expect(deviceAcl(device)).deep.equals(onDevice);
            expect(cachedAcl(peer)).deep.equals(cached);
        });

        it("refuses an edit together with a plain list, sending nothing", async () => {
            await using site = new MockSite();
            const { device, peer } = await unfilteredPeer(site);
            await forgetOurFabricIndex(peer);
            const onDevice = deviceAcl(device);
            const cached = cachedAcl(peer);
            const writes = recordWrites(peer);

            const caught = await captureRejection(() =>
                peer.act(agent => {
                    agent.get(AccessControlClient).state.acl.pop();
                    peer.parts
                        .get(1)!
                        .agentFor(agent.context)
                        .get(UserLabelClient)
                        .state.labelList.push({ label: "room", value: "kitchen" });
                }),
            );

            expectRefusedUnknownIndex(caught);
            expect(writes).length(0);
            expect(deviceAcl(device)).deep.equals(onDevice);
            expect(cachedAcl(peer)).deep.equals(cached);
            expect(labelsOf(device)).deep.equals([]);
            expect(labelsOf(peer)).deep.equals([]);
        });

        it("writes a plain list", async () => {
            await using site = new MockSite();
            const { device, peer } = await unfilteredPeer(site);
            await forgetOurFabricIndex(peer);
            const label = { label: "room", value: "kitchen" };

            await MockTime.resolve(peer.parts.get(1)!.setStateOf(UserLabelClient, { labelList: [label] }));

            expect(labelsOf(device)).deep.equals([label]);
            expect(labelsOf(peer)).deep.equals([label]);
        });

        it("refuses a write without sending anything when the cache is fabric-filtered", async () => {
            // Without a subscription no report replaces the cached value
            await using site = new MockSite();
            const { controller, device } = await site.addUncommissionedPair();
            await controller.start();
            const { passcode, discriminator } = device.state.commissioning;
            await MockTime.resolve(
                controller.peers.commission({ passcode, discriminator, timeout: Seconds(90), autoSubscribe: false }),
                { macrotasks: true },
            );
            const peer = controller.peers.get("peer1")!;
            expect(clientStructureOf(peer).cacheFabricFiltered).true;
            const [admin] = deviceAcl(device);
            await forgetOurFabricIndex(peer);
            const cached = cachedAcl(peer);
            const writes = recordWrites(peer);
            const changes = aclChanges(peer);

            const caught = await captureRejection(() =>
                peer.setStateOf(AccessControlClient, {
                    acl: [admin, aclEntry(NEW_SUBJECT, FabricIndex.OMIT_FABRIC)],
                }),
            );

            expectRefusedUnknownIndex(caught);
            expect(writes).length(0);
            expect(changes).deep.equals([]);
            expect(deviceAcl(device)).deep.equals([admin]);
            expect(cachedAcl(peer)).deep.equals(cached);
        });
    });

    describe("a value the validator refuses, in a writer request", () => {
        function writeAcl(peer: ClientNode, acl: unknown) {
            return RemoteWriter(
                peer,
                clientStructureOf(peer),
            )([
                {
                    number: EndpointNumber(0),
                    behaviorId: String(AccessControl.id),
                    values: { [ACL_ID]: acl },
                    cached: undefined,
                },
            ]);
        }

        function nullAcl(peer: ClientNode) {
            return writeAcl(peer, null);
        }

        it("refuses an entry that is not a struct before anything is sent", async () => {
            await using site = new MockSite();
            const { peer } = await unfilteredPeer(site);
            const writes = recordWrites(peer);

            const caught = await captureRejection(() => writeAcl(peer, [5]));

            if (!(caught instanceof WriteError)) {
                expect.fail(`Expected a WriteError, got ${String(caught)}`);
            }
            expect(caught.message).contains("Cannot write an entry that is not a struct");
            expect(writes).length(0);
        });

        it("is refused while our fabric index on the peer is unknown", async () => {
            await using site = new MockSite();
            const { peer } = await unfilteredPeer(site);
            await forgetOurFabricIndex(peer);
            const writes = recordWrites(peer);

            const caught = await captureRejection(() => nullAcl(peer));

            expectRefusedUnknownIndex(caught);
            expect(writes).length(0);
        });
    });
});
