/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, MockNetwork, Network } from "@matter/general";

/** Records every multicast join and leave of the node's mock network from now on, as "join <ip>" / "leave <ip>". */
export function recordMembershipChanges(node: { env: Environment }) {
    const network = node.env.get(Network);
    if (!(network instanceof MockNetwork)) {
        expect.fail("The node does not run on a MockNetwork");
    }
    const changes = new Array<string>();
    const addMembership = network.addMembership.bind(network);
    const dropMembership = network.dropMembership.bind(network);
    network.addMembership = (...ips: string[]) => {
        changes.push(`join ${ips.join()}`);
        addMembership(...ips);
    };
    network.dropMembership = (...ips: string[]) => {
        changes.push(`leave ${ips.join()}`);
        dropMembership(...ips);
    };
    return { network, changes };
}
