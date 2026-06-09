/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IcdPeerWakefulness } from "#icd/IcdPeerWakefulness.js";
import type { PhysicalDeviceProperties } from "#peer/PhysicalDeviceProperties.js";
import { ClientSubscription } from "./ClientSubscription.js";
import { IcdSustainedSubscription } from "./IcdSustainedSubscription.js";
import { SustainedSubscription } from "./SustainedSubscription.js";

/**
 * Select and construct the sustained {@link ClientSubscription} appropriate for a peer.
 *
 * A LIT (Long Idle Time) ICD peer with known wakefulness parks on its wake signal via {@link IcdSustainedSubscription}.
 * Every other peer uses {@link SustainedSubscription}, retaining the timed retry schedule and liveness probe.
 */
export function subscriptionFor(
    properties: Pick<PhysicalDeviceProperties, "isLongIdleTimeOperating">,
    config: { sustained: SustainedSubscription.Configuration; wakefulness?: IcdPeerWakefulness },
): ClientSubscription {
    const { sustained, wakefulness } = config;

    if (properties.isLongIdleTimeOperating && wakefulness !== undefined) {
        const { request, peer, closed, lifetime, abort, subscribe, read } = sustained;
        return new IcdSustainedSubscription({ request, peer, closed, lifetime, abort, subscribe, read, wakefulness });
    }

    return new SustainedSubscription(sustained);
}
