/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdPeerAsleepError } from "#behavior/system/icd/IcdPeerAsleepError.js";
import { Seconds } from "@matter/general";
import { PeerAddress } from "@matter/protocol";
import { FabricIndex, NodeId } from "@matter/types";

describe("IcdPeerAsleepError", () => {
    it("renders the peer address in the message", () => {
        // A plain object, as read off #node.state.commissioning.peerAddress, not an interned PeerAddress.
        const address = { fabricIndex: FabricIndex(1), nodeId: NodeId(0x2fn) };
        const err = new IcdPeerAsleepError(address, Seconds(5));
        expect(err.message).to.contain("@1:2f");
        expect(err.message).to.not.contain("[object Object]");
    });

    it("also renders correctly for an already-interned PeerAddress", () => {
        const address = PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(0x2fn) });
        const err = new IcdPeerAsleepError(address, Seconds(5));
        expect(err.message).to.contain("@1:2f");
    });
});
