/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { holdUntilIcdPeerAwake } from "#behavior/system/icd/holdUntilIcdPeerAwake.js";
import { IcdPeerAsleepError } from "#behavior/system/icd/IcdPeerAsleepError.js";
import { Abort, AbortedError, Millis, Seconds } from "@matter/general";
import { IcdPeerWakefulness, PeerAddress } from "@matter/protocol";
import { FabricIndex, NodeId } from "@matter/types";

const ADDRESS = PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(1) });

function sleepingPeer() {
    const wakefulness = new IcdPeerWakefulness();
    wakefulness.setTimings({
        activeModeThreshold: Seconds(4),
        activeModeDuration: Millis(0),
        idleModeDuration: Seconds(30),
    });
    wakefulness.requiresAwait = true;
    expect(wakefulness.awake.value).false;
    return wakefulness;
}

describe("holdUntilIcdPeerAwake", () => {
    before(MockTime.enable);

    it("does not hold without a wakefulness, or for a peer that needs no awaiting", () => {
        expect(holdUntilIcdPeerAwake(undefined, ADDRESS)).undefined;
        expect(holdUntilIcdPeerAwake(new IcdPeerWakefulness(), ADDRESS)).undefined;
    });

    it("holds a sleeping peer until it wakes", async () => {
        const wakefulness = sleepingPeer();
        const hold = holdUntilIcdPeerAwake(wakefulness, ADDRESS);
        expect(hold).not.undefined;

        wakefulness.noteActive();

        await MockTime.resolve(hold!);
    });

    it("rejects with IcdPeerAsleepError when the peer does not wake in time", async () => {
        const hold = holdUntilIcdPeerAwake(sleepingPeer(), ADDRESS, { timeout: Seconds(5) });

        await expect(MockTime.resolve(hold!)).rejectedWith(IcdPeerAsleepError);
    });

    it("rejects with the abort error when aborted", async () => {
        using abort = new Abort();
        const hold = holdUntilIcdPeerAwake(sleepingPeer(), ADDRESS, { abort: [undefined, abort] });

        abort.abort();

        await expect(MockTime.resolve(hold!)).rejectedWith(AbortedError);
    });
});
