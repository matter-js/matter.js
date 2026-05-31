/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PeerAddress } from "#peer/PeerAddress.js";
import { ObservablePeerDescriptor, OperationalAddress } from "#peer/PeerDescriptor.js";
import { Millis, type ServerAddressIp } from "@matter/general";
import { CaseAuthenticatedTag, FabricIndex, NodeId } from "@matter/types";

const udp: OperationalAddress = { type: "udp", ip: "1.2.3.4", port: 5540 };

describe("OperationalAddress.from", () => {
    it("returns undefined for a missing or non-IP address", () => {
        expect(OperationalAddress.from(undefined)).undefined;
        expect(OperationalAddress.from({ type: "ble" } as never)).undefined;
    });

    it("passes a tagged IP address through", () => {
        expect(OperationalAddress.from(udp)).deep.equal(udp);
    });

    it("defaults a missing transport type to udp", () => {
        const untagged = { ip: "1.2.3.4", port: 5540 } as ServerAddressIp;

        expect(OperationalAddress.from(untagged)).deep.equal({ ip: "1.2.3.4", port: 5540, type: "udp" });
    });
});

describe("ObservablePeerDescriptor", () => {
    const address = { fabricIndex: FabricIndex(1), nodeId: NodeId(5n) };

    function descriptor() {
        let changes = 0;
        const d = new ObservablePeerDescriptor({ address }, () => changes++);
        return { d, changeCount: () => changes };
    }

    it("interns the address", () => {
        const { d } = descriptor();
        expect(d.address).equal(PeerAddress(address));
    });

    it("notifies and copies on operationalAddress change", () => {
        const { d, changeCount } = descriptor();

        d.operationalAddress = udp;

        expect(changeCount()).equal(1);
        expect(d.operationalAddress).deep.equal(udp);
        expect(d.operationalAddress).not.equal(udp); // stored as a copy
    });

    it("suppresses notification when the value is unchanged", () => {
        const { d, changeCount } = descriptor();

        d.operationalAddress = udp;
        d.operationalAddress = { type: "udp", ip: "1.2.3.4", port: 5540 };

        expect(changeCount()).equal(1);
    });

    it("merges discovery data", () => {
        const { d, changeCount } = descriptor();

        d.discoveryData = { SII: Millis(100) };
        d.discoveryData = { SAI: Millis(200) };

        expect(changeCount()).equal(2);
        expect(d.discoveryData).deep.contain({ SII: Millis(100), SAI: Millis(200) });
    });

    it("notifies on CAT change", () => {
        const { d, changeCount } = descriptor();

        d.caseAuthenticatedTags = [CaseAuthenticatedTag(1)];

        expect(changeCount()).equal(1);
        expect(d.caseAuthenticatedTags).deep.equal([CaseAuthenticatedTag(1)]);
    });
});
