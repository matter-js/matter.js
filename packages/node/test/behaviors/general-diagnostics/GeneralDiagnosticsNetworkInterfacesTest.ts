/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeneralDiagnosticsServer } from "#behaviors/general-diagnostics";
import { MockNetwork, Network } from "@matter/general";
import { MockServerNode } from "@matter/node/testing";

const ADDED_ADDRESS = "2001:db8:5::99";

let node: MockServerNode | undefined;

async function createNode() {
    node = await MockServerNode.createOnline();
    const network = node.env.get(Network);
    if (!(network instanceof MockNetwork)) {
        expect.fail("The mock node uses a mock network");
    }
    return { node, network };
}

function ipv6Count(node: MockServerNode) {
    return node.stateOf(GeneralDiagnosticsServer).networkInterfaces[0].iPv6Addresses.length;
}

describe("GeneralDiagnosticsServer network interfaces", () => {
    beforeEach(() => {
        MockTime.reset();
    });

    afterEach(async () => {
        await node?.close();
        node = undefined;
    });

    it("follows an address change while online", async () => {
        const { node, network } = await createNode();
        const before = ipv6Count(node);

        network.addAddr(ADDED_ADDRESS);
        await network.checkInterfaces();

        expect(ipv6Count(node)).equals(before + 1);
    });

    it("reads the interfaces again when the node comes online", async () => {
        const { node, network } = await createNode();
        const before = ipv6Count(node);

        await node.stop();
        network.addAddr(ADDED_ADDRESS);
        await network.checkInterfaces();
        expect(ipv6Count(node)).equals(before);

        await node.start();
        expect(ipv6Count(node)).equals(before + 1);
    });
});
