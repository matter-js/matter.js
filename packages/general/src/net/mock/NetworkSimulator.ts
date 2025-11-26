/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#util/Bytes.js";
import { hex } from "#util/String.js";
import { MockNetwork } from "./MockNetwork.js";
import { MockRouter } from "./MockRouter.js";

export class NetworkSimulator {
    readonly router = MockRouter();

    addHost(lastIdentifierByte: number) {
        const byte = hex.byte(lastIdentifierByte);
        return new MockNetwork(this, `00:11:22:33:44:${byte}`, [
            `1111:2222:3333:4444:5555:6666:7777:88${byte}`,
            `10.10.10.${lastIdentifierByte}`,
        ]);
    }
}

export namespace NetworkSimulator {
    export type Listener = (netInterface: string, peerAddress: string, peerPort: number, data: Bytes) => void;
}
