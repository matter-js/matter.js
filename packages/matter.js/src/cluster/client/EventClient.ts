/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, ImplementationError } from "@matter/general";
import { ClusterId, ClusterType, EndpointNumber, EventId, EventNumber } from "@matter/types";
import { DecodedEventData } from "./DecodedDataReport.js";
import { InteractionClient } from "./InteractionClient.js";

/**
 * Factory function to create an EventClient for a given event.
 *
 * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
 */
export function createEventClient<T>(
    event: ClusterType.Event<T>,
    name: string,
    endpointId: EndpointNumber | undefined,
    clusterId: ClusterId,
    interactionClient: InteractionClient,
): EventClient<T> {
    return new EventClient(event, name, endpointId, clusterId, interactionClient);
}

/**
 * General class for EventClients
 *
 * @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md.
 */
export class EventClient<T = any> {
    readonly #listeners = new Array<(event: DecodedEventData<T>) => void>();
    readonly id: EventId;
    readonly #interactionClient: InteractionClient;

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    constructor(
        readonly event: ClusterType.Event<T>,
        readonly name: string,
        readonly endpointId: EndpointNumber | undefined,
        readonly clusterId: ClusterId,
        interactionClient: InteractionClient,
    ) {
        this.id = event.id;
        this.#interactionClient = interactionClient;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async get(
        minimumEventNumber?: EventNumber,
        isFabricFiltered?: boolean,
    ): Promise<DecodedEventData<T>[] | undefined> {
        if (this.endpointId === undefined) {
            throw new ImplementationError("Cannot read event without endpointId");
        }
        return await this.#interactionClient.getEvent({
            endpointId: this.endpointId,
            clusterId: this.clusterId,
            event: this.event,
            minimumEventNumber,
            isFabricFiltered,
        });
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    async subscribe(
        minIntervalFloorSeconds: Duration,
        maxIntervalCeilingSeconds: Duration,
        isUrgent = true,
        minimumEventNumber?: EventNumber,
        isFabricFiltered?: boolean,
    ) {
        if (this.endpointId === undefined) {
            throw new ImplementationError("Cannot read event without endpointId");
        }
        return await this.#interactionClient.subscribeEvent({
            endpointId: this.endpointId,
            clusterId: this.clusterId,
            event: this.event,
            minIntervalFloorSeconds,
            maxIntervalCeilingSeconds,
            isUrgent,
            minimumEventNumber,
            isFabricFiltered,
            listener: this.update.bind(this),
        });
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    update(newEvent: DecodedEventData<T>) {
        for (const listener of this.#listeners) {
            listener(newEvent);
        }
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    addListener(listener: (newValue: DecodedEventData<T>) => void) {
        this.#listeners.push(listener);
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    removeListener(listener: (newValue: DecodedEventData<T>) => void) {
        const entryIndex = this.#listeners.indexOf(listener);
        if (entryIndex !== -1) {
            this.#listeners.splice(entryIndex, 1);
        }
    }
}
