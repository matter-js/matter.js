/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "@matter/general";
import { MockSite } from "@matter/node/testing";
import {
    ClientRead,
    ClientSubscribe,
    Read,
    ReadResult,
    SessionClosedError,
    SessionManager,
    Subscribe,
} from "@matter/protocol";
import { EndpointNumber } from "@matter/types";
import { BasicInformation } from "@matter/types/clusters/basic-information";

const vendorName: ClientRead = {
    ...Read(Read.Attribute({ endpoint: EndpointNumber(0), cluster: BasicInformation, attributes: "vendorName" })),
    requireExistingSession: true,
};

async function drain(result: ReadResult) {
    for await (const chunk of result) {
        for await (const _report of chunk);
    }
}

describe("ClientRequest.requireExistingSession", () => {
    before(() => {
        MockTime.init();
    });

    it("reads over the existing session", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer1 = controller.peers.get("peer1")!;

        await MockTime.resolve(drain(peer1.interaction.read(vendorName)));
    });

    it("fails without a session instead of establishing one", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer1 = controller.peers.get("peer1")!;

        for (const session of controller.env.get(SessionManager).sessions) {
            await session.initiateClose();
        }

        await MockTime.resolve(expect(drain(peer1.interaction.read(vendorName))).rejectedWith(SessionClosedError));
    });

    it("is refused for a sustained subscription", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer1 = controller.peers.get("peer1")!;

        const request: ClientSubscribe = {
            ...Subscribe({ attributes: [{ endpointId: EndpointNumber(0) }] }),
            sustain: true,
            requireExistingSession: true,
        };
        await expect(peer1.interaction.subscribe(request)).rejectedWith(ImplementationError);
    });
});
