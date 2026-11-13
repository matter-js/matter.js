/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccessControlServer } from "#behaviors/access-control";
import { UserLabelServer } from "#behaviors/user-label";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Endpoint } from "#endpoint/Endpoint.js";
import { ServerNode } from "#node/ServerNode.js";
import { MockSite } from "@matter/node/testing";
import { Read, ReadResult, Write } from "@matter/protocol";
import {
    AttributeId,
    EndpointNumber,
    FabricIndex,
    Status,
    TlvArray,
    TlvField,
    TlvObject,
    TlvString,
} from "@matter/types";
import { AccessControl } from "@matter/types/clusters/access-control";
import { Label } from "@matter/types/clusters/label";
import { UserLabel } from "@matter/types/clusters/user-label";

const labelList = { endpoint: EndpointNumber(1), cluster: UserLabel, attributes: "labelList" as const };

function labels(count: number) {
    return Array.from({ length: count }, (_, i) => ({ label: `label${i}`, value: `value${i}` }));
}

function lightWithLabels(maxLabels?: number) {
    return new Endpoint(OnOffLightDevice.with(UserLabelServer), {
        id: "ep1",
        number: 1,
        ...(maxLabels === undefined ? {} : { userLabel: { maxLabels } }),
    });
}

/** Commissions a light with a UserLabel server and returns a way to write and read as the controller does. */
async function labelDevice(site: MockSite, maxLabels?: number) {
    const { controller, device } = await site.addCommissionedPair({
        device: { type: ServerNode.RootEndpoint, device: lightWithLabels(maxLabels) },
    });
    const peer = controller.peers.get("peer1")!;

    return {
        device,

        /** The labels held by the device, not what the controller has cached */
        stored: () => device.parts.get(1)!.stateOf(UserLabelServer).labelList,

        /** Sends the write and returns the status of each write path, in order */
        async write(request: Write) {
            const result = await MockTime.resolve(peer.interaction.write(request));
            return result.map(({ path, status }) => ({ listIndex: path.listIndex, status }));
        },

        /** Reads LabelList over the wire */
        async read() {
            const reports = new Array<ReadResult.Report>();
            await MockTime.resolve(
                (async () => {
                    for await (const chunk of peer.interaction.read(Read(Read.Attribute(labelList)))) {
                        for await (const report of chunk) {
                            reports.push(report);
                        }
                    }
                })(),
            );
            const report = reports.find(report => report.kind === "attr-value");
            if (report?.kind !== "attr-value") {
                expect.fail("LabelList read returned no value");
            }
            return report.value;
        },
    };
}

/**
 * Whole list in one write request (single REPLACE_ALL).  Spec 10.6.4.3.1: "This option SHALL NOT be used in a
 * WriteRequestMessage for other list attributes", so a client must not send this form for LabelList.  Tests using it
 * check that the server tolerates it.
 */
function replaceAll(value: Label.LabelStruct[]) {
    return Write({ chunkLists: false }, Write.Attribute({ ...labelList, value }));
}

/** REPLACE_ALL with an empty list followed by one ADD per entry, the form clients send for LabelList */
function replaceAllThenAppend(value: Label.LabelStruct[]) {
    return Write({ chunkLists: true }, Write.Attribute({ ...labelList, value }));
}

/** Entry schemas without length limits, and one without the mandatory value, so tests can send what a client must not */
const UnconstrainedLabel = TlvObject({ label: TlvField(0, TlvString), value: TlvField(1, TlvString) });
const LabelWithoutValue = TlvObject({ label: TlvField(0, TlvString) });
const LabelWithoutLabel = TlvObject({ value: TlvField(1, TlvString) });

type RawEntry = { label: string; value: string };

/**
 * Write paths with hand-made TLV.  Combining a non-empty REPLACE_ALL with ADDs is a form a client must not send for
 * non-ACL lists (spec 10.6.4.3.1, see {@link replaceAll}); tests using it check that the server tolerates it.
 */
function rawWrite(
    ...writes: Array<{ listIndex: null | undefined; data: ReturnType<typeof UnconstrainedLabel.encodeTlv> }>
) {
    const options: Write.Options = {
        writes: writes.map(({ listIndex, data }) => ({
            path: { endpointId: EndpointNumber(1), clusterId: UserLabel.id, attributeId: AttributeId(0), listIndex },
            data,
        })),
    };
    return Write(options);
}

const replaceAllWith = (entries: RawEntry[]) => ({
    listIndex: undefined,
    data: TlvArray(UnconstrainedLabel).encodeTlv(entries),
});

const appendOf = (entry: RawEntry) => ({ listIndex: null, data: UnconstrainedLabel.encodeTlv(entry) });

describe("UserLabelServer", () => {
    before(() => {
        MockTime.init();
    });

    describe("writes within the limit", () => {
        it("stores a single REPLACE_ALL", async () => {
            await using site = new MockSite();
            const { write, stored, read } = await labelDevice(site);

            expect(await write(replaceAll(labels(3)))).deep.equals([{ listIndex: undefined, status: Status.Success }]);
            expect(stored()).deep.equals(labels(3));
            expect(await read()).deep.equals(labels(3));
        });

        it("stores REPLACE_ALL followed by ADD", async () => {
            await using site = new MockSite();
            const { write, stored, read } = await labelDevice(site);

            const statuses = await write(replaceAllThenAppend(labels(3)));
            expect(statuses.map(({ listIndex }) => listIndex)).deep.equals([undefined, null, null, null]);
            expect(statuses.every(({ status }) => status === Status.Success)).true;
            expect(stored()).deep.equals(labels(3));
            expect(await read()).deep.equals(labels(3));
        });

        it("replaces earlier labels and accepts an empty list", async () => {
            await using site = new MockSite();
            const { write, stored } = await labelDevice(site);

            expect(await write(replaceAll(labels(3)))).deep.equals([{ listIndex: undefined, status: Status.Success }]);
            expect(stored()).deep.equals(labels(3));
            expect(await write(replaceAll([]))).deep.equals([{ listIndex: undefined, status: Status.Success }]);
            expect(stored()).deep.equals([]);
        });

        it("accepts labels and values of exactly 16 characters", async () => {
            await using site = new MockSite();
            const { write, stored } = await labelDevice(site);

            const entry = { label: "l".repeat(16), value: "v".repeat(16) };
            await write(replaceAll([entry]));
            expect(stored()).deep.equals([entry]);
        });
    });

    // Spec 9.9.4.1: "The server SHALL support the storage of up to 4 list entries in this attribute."
    // Spec 9.9.4.1: "If an attempt is made to write to this attribute with a list length that is not supported by the
    // server, the server SHALL respond with RESOURCE_EXHAUSTED."
    describe("list length limit", () => {
        it("accepts exactly 4 entries when maxLabels is the spec minimum", async () => {
            await using site = new MockSite();
            const { write, stored } = await labelDevice(site, 4);

            expect(await write(replaceAll(labels(4)))).deep.equals([{ listIndex: undefined, status: Status.Success }]);
            expect(stored()).deep.equals(labels(4));
        });

        it("refuses a single REPLACE_ALL above maxLabels with RESOURCE_EXHAUSTED and keeps the old list", async () => {
            await using site = new MockSite();
            const { write, stored } = await labelDevice(site, 4);

            await write(replaceAll(labels(2)));
            expect(await write(replaceAll(labels(5)))).deep.equals([
                { listIndex: undefined, status: Status.ResourceExhausted },
            ]);
            expect(stored()).deep.equals(labels(2));
        });

        it("refuses the ADD that crosses maxLabels and keeps the entries before it", async () => {
            await using site = new MockSite();
            const { write, stored, read } = await labelDevice(site, 4);

            const statuses = await write(replaceAllThenAppend(labels(6)));
            expect(statuses.map(({ status }) => status)).deep.equals([
                Status.Success, // REPLACE_ALL with []
                Status.Success,
                Status.Success,
                Status.Success,
                Status.Success,
                Status.ResourceExhausted,
                Status.ResourceExhausted,
            ]);
            expect(stored()).deep.equals(labels(4));
            expect(await read()).deep.equals(labels(4));
        });

        it("defaults to a maximum of 255 entries", async () => {
            await using site = new MockSite();
            const { write, stored } = await labelDevice(site);

            const statuses = await write(replaceAllThenAppend(labels(256)));
            expect(statuses.length).equals(257);
            expect(statuses.filter(({ status }) => status === Status.ResourceExhausted).length).equals(1);
            expect(statuses[256].status).equals(Status.ResourceExhausted);
            expect(stored().length).equals(255);
        });
    });

    // Spec 9.7.4.1 LabelStruct: Label "string, max 16, conformance M"; Value "string, max 16, conformance M"
    describe("LabelStruct constraints", () => {
        const tooLong = "x".repeat(17);

        for (const [name, entry] of [
            ["label", { label: tooLong, value: "v" }],
            ["value", { label: "l", value: tooLong }],
        ] as const) {
            it(`rejects a ${name} of 17 characters in a REPLACE_ALL`, async () => {
                await using site = new MockSite();
                const { write, stored } = await labelDevice(site);

                await write(replaceAll([{ label: "keep", value: "me" }]));
                const statuses = await write(rawWrite(replaceAllWith([entry])));
                expect(statuses.map(({ status }) => status)).deep.equals([Status.ConstraintError]);
                expect(stored()).deep.equals([{ label: "keep", value: "me" }]);
            });

            it(`rejects a ${name} of 17 characters in an ADD`, async () => {
                await using site = new MockSite();
                const { write, stored } = await labelDevice(site);

                const statuses = await write(
                    rawWrite(replaceAllWith([{ label: "keep", value: "me" }]), appendOf(entry)),
                );
                expect(statuses.map(({ status }) => status)).deep.equals([Status.Success, Status.ConstraintError]);
                expect(stored()).deep.equals([{ label: "keep", value: "me" }]);
            });
        }

        // Characterization of a difference from CHIP, which decodes a LabelStruct without Value as empty and accepts it.
        // Spec 9.7.4.1 makes Value mandatory (M), so matter.js refuses it.
        it("rejects an entry without value in a REPLACE_ALL", async () => {
            await using site = new MockSite();
            const { write, stored } = await labelDevice(site);

            const statuses = await write(
                rawWrite({ listIndex: undefined, data: TlvArray(LabelWithoutValue).encodeTlv([{ label: "a" }]) }),
            );
            expect(statuses.map(({ status }) => status)).deep.equals([Status.ConstraintError]);
            expect(stored()).deep.equals([]);
        });

        // Characterization of the same difference from CHIP
        it("rejects an entry without value in an ADD", async () => {
            await using site = new MockSite();
            const { write, stored } = await labelDevice(site);

            const statuses = await write(
                rawWrite(replaceAllWith([]), { listIndex: null, data: LabelWithoutValue.encodeTlv({ label: "a" }) }),
            );
            expect(statuses.map(({ status }) => status)).deep.equals([Status.Success, Status.ConstraintError]);
            expect(stored()).deep.equals([]);
        });

        it("rejects an entry without label like one without value", async () => {
            await using site = new MockSite();
            const { write, stored } = await labelDevice(site);

            const withoutLabel = await write(
                rawWrite({ listIndex: undefined, data: TlvArray(LabelWithoutLabel).encodeTlv([{ value: "a" }]) }),
            );
            const withoutValue = await write(
                rawWrite({ listIndex: undefined, data: TlvArray(LabelWithoutValue).encodeTlv([{ label: "a" }]) }),
            );
            expect(withoutLabel).deep.equals(withoutValue);
            expect(withoutLabel.map(({ status }) => status)).deep.equals([Status.ConstraintError]);
            expect(stored()).deep.equals([]);
        });
    });

    describe("write rules of the interaction model", () => {
        // CHIP WriteHandler.cpp and InteractionServer answer BUSY for an ADD not preceded by a REPLACE_ALL of the same
        // attribute in the same request.
        // Characterization
        it("answers a lone ADD to a non-empty list with BUSY and keeps the list", async () => {
            await using site = new MockSite();
            const { write, stored } = await labelDevice(site);

            await write(replaceAll(labels(2)));
            expect(await write(rawWrite(appendOf(labels(3)[2])))).deep.equals([{ listIndex: null, status: 0x9c }]);
            expect(stored()).deep.equals(labels(2));
        });

        // Spec 9.9.4: LabelList access "RW VM", so writing needs Manage
        it("refuses a writer with only Operate privilege with UNSUPPORTED_ACCESS", async () => {
            await using site = new MockSite();
            const { write, stored, device } = await labelDevice(site);

            await device.act("operate-only", agent => {
                agent.get(AccessControlServer).state.acl = [
                    new AccessControl.AccessControlEntry({
                        privilege: AccessControl.AccessControlEntryPrivilege.Operate,
                        authMode: AccessControl.AccessControlEntryAuthMode.Case,
                        subjects: null,
                        targets: null,
                        fabricIndex: FabricIndex(1),
                    }),
                ];
            });

            expect(await write(replaceAll(labels(2)))).deep.equals([
                { listIndex: undefined, status: Status.UnsupportedAccess },
            ]);
            expect(stored()).deep.equals([]);
        });
    });

    // Spec 9.9.4 attribute table: LabelList quality "N" (non-volatile)
    describe("persistence", () => {
        for (const [name, request] of [
            ["a single REPLACE_ALL", () => replaceAll(labels(3))],
            ["REPLACE_ALL followed by ADD", () => replaceAllThenAppend(labels(3))],
        ] as const) {
            it(`keeps labels written with ${name} across a restart`, async () => {
                await using site = new MockSite();
                const { write, device } = await labelDevice(site);

                await write(request());
                await MockTime.resolve(device.close(), { macrotasks: true });

                const restarted = await MockTime.resolve(
                    site.addNode(undefined, {
                        id: device.id,
                        device: lightWithLabels(),
                        commissioning: { enabled: false },
                    }),
                    { macrotasks: true },
                );
                expect(restarted.parts.get(1)!.stateOf(UserLabelServer).labelList).deep.equals(labels(3));
            });
        }
    });
});
