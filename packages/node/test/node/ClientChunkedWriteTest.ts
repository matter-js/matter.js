/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserLabelServer } from "#behaviors/user-label";
import { OnOffLightDevice } from "#devices/on-off-light";
import { ServerNode } from "#node/ServerNode.js";
import { MAX_UDP_MESSAGE_SIZE, MockNetwork, Network } from "@matter/general";
import { Specification } from "@matter/model";
import { MockSite } from "@matter/node/testing";
import { MATTER_MESSAGE_OVERHEAD, Read, ReadResult, Write } from "@matter/protocol";
import { AttributeId, ClusterId, EndpointNumber, Status, TlvString, TlvWriteRequest } from "@matter/types";
import { BasicInformation } from "@matter/types/clusters/basic-information";
import { UserLabel } from "@matter/types/clusters/user-label";

/** Each label encodes to about 40 bytes, so 50 labels need more than one UDP message. */
function labels(count: number) {
    return Array.from({ length: count }, (_, i) => ({
        label: `label${String(i).padStart(11, "0")}`,
        value: `value${String(i).padStart(11, "0")}`,
    }));
}

type Labels = ReturnType<typeof labels>;

const labelList = { endpoint: EndpointNumber(1), cluster: UserLabel, attributes: "labelList" as const };

async function withPair<T>(
    actor: (pair: Awaited<ReturnType<MockSite["addCommissionedPair"]>>) => Promise<T>,
): Promise<T> {
    await using site = new MockSite();
    const pair = await site.addCommissionedPair({
        device: {
            type: ServerNode.RootEndpoint,
            device: OnOffLightDevice.with(UserLabelServer),
        },
    });

    // A real network or peer drops what does not fit one UDP datagram; the simulator does not
    const oversized = new Array<number>();
    const network = pair.device.env.get(Network);
    if (!(network instanceof MockNetwork)) {
        expect.fail("device network is not simulated");
    }
    network.simulator.router.intercept((packet, route) => {
        if (packet.kind === "udp" && packet.payload.byteLength > MAX_UDP_MESSAGE_SIZE) {
            oversized.push(packet.payload.byteLength);
            return;
        }
        route(packet);
    });

    const result = await actor(pair);
    expect(oversized).deep.equals([]);
    return result;
}

async function writeLabels(value: Labels, options: Write.Options = {}, version?: (current: number) => number) {
    return withPair(async ({ controller, device }) => {
        const peer1 = controller.peers.get("peer1")!;

        let dataVersion: number | undefined;
        if (version !== undefined) {
            const reports = new Array<ReadResult.Report>();
            await MockTime.resolve(
                (async () => {
                    for await (const chunk of peer1.interaction.read(Read(Read.Attribute(labelList)))) {
                        for await (const report of chunk) {
                            reports.push(report);
                        }
                    }
                })(),
            );
            const report = reports.find(report => report.kind === "attr-value");
            expect(report?.kind).equals("attr-value");
            if (report?.kind === "attr-value") {
                dataVersion = version(report.version);
            }
        }

        const result = await MockTime.resolve(
            peer1.interaction.write(Write(options, Write.Attribute({ ...labelList, value, version: dataVersion }))),
        );

        return {
            statuses: result.map(({ status }) => status),
            labelList: device.parts.get(1)!.stateOf(UserLabelServer).labelList,
        };
    });
}

function expectWritten({ statuses, labelList }: Awaited<ReturnType<typeof writeLabels>>, value: Labels) {
    expect(statuses.length).greaterThan(0);
    expect(statuses.filter(status => status !== Status.Success)).deep.equals([]);
    expect(labelList).deep.equals(value);
}

describe("ClientChunkedWrite", () => {
    before(() => {
        MockTime.init();
    });

    it("writes a list larger than one message as an empty REPLACE and ADDs across chunks", async () => {
        expectWritten(await writeLabels(labels(50)), labels(50));
    });

    it("writes a whole list larger than one message as an empty REPLACE and ADDs across chunks", async () => {
        expectWritten(await writeLabels(labels(50), { chunkLists: false }), labels(50));
    });

    it("writes a list with a matching data version that fits one message", async () => {
        expectWritten(await writeLabels(labels(3), {}, current => current), labels(3));
    });

    it("writes a list with a matching data version across chunks", async () => {
        expectWritten(await writeLabels(labels(50), {}, current => current), labels(50));
    });

    it("rejects every entry of a list write with a stale data version", async () => {
        const { statuses, labelList } = await writeLabels(labels(3), {}, current => current - 1);

        expect(statuses).deep.equals(new Array(4).fill(Status.DataVersionMismatch));
        expect(labelList).deep.equals([]);
    });

    it("writes small values whose statuses do not fit one WriteResponse although the request does", async () => {
        // Each status of a short value encodes larger than its AttributeDataIB
        const nodeLabel = { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), attributeId: AttributeId(5) };
        const requestSize = (count: number) =>
            TlvWriteRequest.encode({
                timedRequest: false,
                interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                moreChunkedMessages: false,
                writeRequests: Array.from({ length: count }, () => ({
                    path: nodeLabel,
                    data: TlvString.encodeTlv(""),
                })),
            }).byteLength;
        let count = 1;
        while (requestSize(count + 1) <= MAX_UDP_MESSAGE_SIZE - MATTER_MESSAGE_OVERHEAD) {
            count++;
        }

        const statuses = await withPair(async ({ controller }) => {
            const peer1 = controller.peers.get("peer1")!;
            const write = Write(
                ...Array.from({ length: count }, () =>
                    Write.Attribute({
                        endpoint: EndpointNumber(0),
                        cluster: BasicInformation,
                        attributes: "nodeLabel",
                        value: "",
                    }),
                ),
            );
            const result = await MockTime.resolve(peer1.interaction.write(write));
            return result.map(({ status }) => status);
        });

        expect(statuses).deep.equals(new Array(count).fill(Status.Success));
    });
});
