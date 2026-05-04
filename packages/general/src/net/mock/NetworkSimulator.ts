/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#util/Bytes.js";
import { hex } from "#util/String.js";
import { MockNetwork } from "./MockNetwork.js";
import { MockRouter } from "./MockRouter.js";

export class NetworkSimulator {
    readonly router = MockRouter();
    readonly #hosts = new Set<MockNetwork>();

    addHost(lastIdentifierByte: number) {
        const host = new MockNetwork(this, `00:11:22:33:44:${hex.byte(lastIdentifierByte)}`, [
            `abcd::${lastIdentifierByte.toString(16)}`,
            `10.10.10.${lastIdentifierByte}`,
        ]);
        this.#hosts.add(host);
        return host;
    }

    removeHost(host: MockNetwork) {
        this.#hosts.delete(host);
    }

    /**
     * Find the MockNetwork that owns a given IP address.
     */
    findNetwork(ip: string): MockNetwork | undefined {
        for (const host of this.#hosts) {
            if (host.shouldReceive(ip)) {
                return host;
            }
        }
        return undefined;
    }
}

export namespace NetworkSimulator {
    export type Listener = (netInterface: string, peerAddress: string, peerPort: number, data: Bytes) => void;
}
