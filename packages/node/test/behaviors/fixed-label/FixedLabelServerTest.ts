/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FixedLabelServer } from "#behaviors/fixed-label";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Endpoint } from "#endpoint/Endpoint.js";
import { ServerNode } from "#node/ServerNode.js";
import { MockSite } from "@matter/node/testing";
import { Read, ReadResult, Write } from "@matter/protocol";
import { EndpointNumber, Status } from "@matter/types";
import { FixedLabel } from "@matter/types/clusters/fixed-label";

const labelList = { endpoint: EndpointNumber(1), cluster: FixedLabel, attributes: "labelList" as const };

const FIXED = [
    { label: "room", value: "bedroom 2" },
    { label: "orientation", value: "up" },
];

function lightWithFixedLabels(initial?: typeof FIXED) {
    return new Endpoint(OnOffLightDevice.with(FixedLabelServer), {
        id: "ep1",
        number: 1,
        ...(initial === undefined ? {} : { fixedLabel: { labelList: initial } }),
    });
}

describe("FixedLabelServer", () => {
    before(() => {
        MockTime.init();
    });

    // Spec 9.8.4: LabelList "list[LabelStruct], quality N, access R V"
    it("serves the labels of the application to a controller", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({
            device: { type: ServerNode.RootEndpoint, device: lightWithFixedLabels(FIXED) },
        });
        const peer = controller.peers.get("peer1")!;

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
        expect(report?.kind === "attr-value" ? report.value : undefined).deep.equals(FIXED);
    });

    // Spec 9.8.4: access "R V" has no write privilege
    // A single REPLACE_ALL is a form a client must not send for non-ACL lists (spec 10.6.4.3.1: "This option SHALL NOT
    // be used in a WriteRequestMessage for other list attributes"); that case checks that the server tolerates it.
    for (const [name, request, listIndexes] of [
        [
            "REPLACE_ALL",
            () => Write({ chunkLists: false }, Write.Attribute({ ...labelList, value: [FIXED[0]] })),
            [undefined],
        ],
        [
            "REPLACE_ALL followed by ADD",
            () => Write({ chunkLists: true }, Write.Attribute({ ...labelList, value: [FIXED[0]] })),
            [undefined, null],
        ],
    ] as const) {
        it(`refuses a controller ${name} with UNSUPPORTED_WRITE and keeps the labels`, async () => {
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: { type: ServerNode.RootEndpoint, device: lightWithFixedLabels(FIXED) },
            });
            const peer = controller.peers.get("peer1")!;

            const result = await MockTime.resolve(peer.interaction.write(request()));

            expect(result.map(({ path, status }) => ({ listIndex: path.listIndex, status }))).deep.equals(
                listIndexes.map(listIndex => ({ listIndex, status: Status.UnsupportedWrite })),
            );
            expect(device.parts.get(1)!.stateOf(FixedLabelServer).labelList).deep.equals(FIXED);
        });
    }

    // Spec 9.8.4: quality "N".  matter.js persists nonvolatile attributes, but only values that were written.  Nothing
    // writes the application's initial labels to storage, so a changed application value wins after a restart.
    // Characterization
    it("takes the labels from the application after a restart", async () => {
        await using site = new MockSite();
        const { device } = await site.addCommissionedPair({
            device: { type: ServerNode.RootEndpoint, device: lightWithFixedLabels(FIXED) },
        });
        await MockTime.resolve(device.close(), { macrotasks: true });

        const changed = [{ label: "room", value: "kitchen" }];
        const restarted = await site.addNode(undefined, {
            id: device.id,
            device: lightWithFixedLabels(changed),
            commissioning: { enabled: false },
        });
        expect(restarted.parts.get(1)!.stateOf(FixedLabelServer).labelList).deep.equals(changed);
    });
});
