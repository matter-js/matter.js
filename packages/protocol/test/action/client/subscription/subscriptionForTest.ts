/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SustainedClientSubscribe } from "#action/client/subscription/ClientSubscribe.js";
import { IcdSustainedSubscription } from "#action/client/subscription/IcdSustainedSubscription.js";
import { PeerSubscription } from "#action/client/subscription/PeerSubscription.js";
import { SustainedSubscription } from "#action/client/subscription/SustainedSubscription.js";
import { subscriptionFor } from "#action/client/subscription/subscriptionFor.js";
import { IcdPeerWakefulness } from "#icd/IcdPeerWakefulness.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import { Entropy, Lifetime, RetrySchedule, Seconds } from "@matter/general";
import { FabricIndex, NodeId } from "@matter/types";

function fakePeerSub(): PeerSubscription {
    return {
        subscriptionId: 1,
        maxInterval: 60,
        interactionModelRevision: 12,
        close: async () => {},
    } as unknown as PeerSubscription;
}

function litWakefulness() {
    const wakefulness = new IcdPeerWakefulness();
    wakefulness.setTimings({ activeModeThreshold: Seconds(5), idleModeDuration: Seconds(30) });
    wakefulness.requiresAwait = true; // start asleep so the parked run loop does not subscribe
    return wakefulness;
}

function sustainedConfig(): SustainedSubscription.Configuration {
    const lifetime = Lifetime("test subscriptionFor");
    const peer = PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(BigInt(1)) });
    const entropy = { randomUint32: 0 } as Entropy;

    return {
        request: { sustain: true } as SustainedClientSubscribe,
        peer,
        closed: () => {},
        lifetime,
        subscribe: async () => fakePeerSub(),
        read: () => {
            throw new Error("read should not be invoked when bootstrapWithRead is unset");
        },
        probe: async () => true,
        retries: new RetrySchedule(entropy, SustainedSubscription.DefaultRetrySchedule),
    };
}

async function dispose(subscription: { close(): void; done?: Promise<unknown> }) {
    subscription.close();
    await subscription.done;
}

describe("subscriptionFor", () => {
    it("returns an IcdSustainedSubscription for a LIT peer with wakefulness", async () => {
        const wakefulness = litWakefulness();
        const subscription = subscriptionFor(
            { isLongIdleTimeOperating: true },
            { sustained: sustainedConfig(), wakefulness },
        );

        expect(subscription instanceof IcdSustainedSubscription).equal(true);

        await dispose(subscription);
    });

    it("returns a SustainedSubscription for a non-LIT peer", async () => {
        const subscription = subscriptionFor({ isLongIdleTimeOperating: false }, { sustained: sustainedConfig() });

        expect(subscription instanceof SustainedSubscription).equal(true);

        await dispose(subscription);
    });

    it("falls back to SustainedSubscription for a LIT peer when wakefulness is missing", async () => {
        const subscription = subscriptionFor({ isLongIdleTimeOperating: true }, { sustained: sustainedConfig() });

        expect(subscription instanceof SustainedSubscription).equal(true);

        await dispose(subscription);
    });
});
