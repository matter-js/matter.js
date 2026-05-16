/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SustainedClientSubscribe } from "#action/client/subscription/ClientSubscribe.js";
import { PeerSubscription } from "#action/client/subscription/PeerSubscription.js";
import { SustainedSubscription } from "#action/client/subscription/SustainedSubscription.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import { Entropy, Lifetime, RetrySchedule } from "@matter/general";
import { FabricIndex, NodeId } from "@matter/types";

describe("SustainedSubscription", () => {
    // Regression: the run loop must race `closed` against `this.abort` so shutdown-initiated close does not wedge
    // when the peer never reports closure via `request.closed`.
    it("close() resolves done() even when peer never fires request.closed", async () => {
        const lifetime = Lifetime("test sustained subscription");
        const peer = PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(BigInt(1)) });

        let peerSubClosed = 0;
        const fakePeerSub = {
            subscriptionId: 1,
            close: async () => {
                peerSubClosed++;
            },
        } as unknown as PeerSubscription;
        const entropy = { randomUint32: 0 } as Entropy;

        const subscription = new SustainedSubscription({
            request: { sustain: true } as SustainedClientSubscribe,
            peer,
            closed: () => {},
            lifetime,
            subscribe: async () => fakePeerSub,
            read: () => {
                throw new Error("read should not be invoked when bootstrapWithRead is unset");
            },
            probe: async () => true,
            retries: new RetrySchedule(entropy, SustainedSubscription.DefaultRetrySchedule),
        });

        let activeTimer: ReturnType<typeof setTimeout> | undefined;
        try {
            await Promise.race([
                subscription.active,
                new Promise<never>((_, reject) => {
                    activeTimer = setTimeout(() => reject(new Error("subscription never became active")), 2000);
                }),
            ]);
        } finally {
            if (activeTimer) clearTimeout(activeTimer);
        }

        subscription.close();

        let raceTimer: ReturnType<typeof setTimeout> | undefined;
        let result: "ok" | "timeout";
        try {
            result = await Promise.race([
                subscription.done!.then(() => "ok" as const),
                new Promise<"timeout">(resolve => {
                    raceTimer = setTimeout(() => resolve("timeout"), 1000);
                }),
            ]);
        } finally {
            if (raceTimer) clearTimeout(raceTimer);
        }

        expect(result).equal("ok");
        // The run loop must close the active peer subscription on abort exit so its lifetime is disposed.
        expect(peerSubClosed).equal(1);
    });
});
