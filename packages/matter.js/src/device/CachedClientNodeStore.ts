/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { StorageContext } from "#general";
import { Construction, Logger, MaybePromise } from "#general";
import { DecodedAttributeReportValue, PeerDataStore, ReadScope, Val } from "#protocol";
import { AttributeId, ClusterId, EndpointNumber, EventNumber } from "#types";
import { ClientEndpointStore } from "./ClientEndpointStore.js";

const logger = Logger.get("CachedClientNodeStore");

const VERSION_KEY = "__version__";
const MAX_EVENT_NUMBER_KEY = "__maxEventNumber__";

type PersistedAttributeValue = {
    value: Val;
    attributeName: string;
};

export class CachedClientNodeStore extends PeerDataStore {
    #storage: StorageContext;
    #construction: Construction<CachedClientNodeStore>;
    #endpointStores = new Map<EndpointNumber, ClientEndpointStore>();
    #maxEventNumber: EventNumber = EventNumber(0);

    get construction() {
        return this.#construction;
    }

    constructor(storage: StorageContext, load = true) {
        super();
        this.#storage = storage;

        this.#construction = Construction(this, async () => {
            if (!load) {
                return;
            }
            this.#maxEventNumber = await this.#storage.get(MAX_EVENT_NUMBER_KEY, EventNumber(0));

            // Preload stores so we can access synchronously going forward
            const knownParts = await this.#storage.contexts();
            for (const partId of knownParts) {
                await this.#loadEndpointStore(partId);
            }
        });
    }

    async #loadEndpointStore(partId: string) {
        const endpointNumber = EndpointNumber(parseInt(partId));
        const endpointStore = new ClientEndpointStore(this.#storage.createContext(partId));
        this.#endpointStores.set(endpointNumber, endpointStore);
        await endpointStore.construction;
    }

    #storeForEndpoint(endpointId: EndpointNumber): ClientEndpointStore {
        this.#construction.assert();

        const existingStore = this.#endpointStores.get(endpointId);
        if (existingStore !== undefined) {
            return existingStore;
        }

        const store = new ClientEndpointStore(this.#storage.createContext(endpointId.toString()), false);
        this.#endpointStores.set(endpointId, store);

        return store;
    }

    get maxEventNumber() {
        return this.#maxEventNumber;
    }

    updateLastEventNumber(eventNumber: EventNumber) {
        this.#maxEventNumber = eventNumber;
        return this.#storage.set(MAX_EVENT_NUMBER_KEY, eventNumber);
    }

    retrieveAttribute(
        endpointId: EndpointNumber,
        clusterId: ClusterId,
        attributeId: AttributeId,
    ): DecodedAttributeReportValue<any> | undefined {
        const store = this.#storeForEndpoint(endpointId);
        const clusterValues = store.get.get(clusterId.toString());
        if (clusterValues === undefined) {
            return undefined;
        }
        const version = clusterValues[VERSION_KEY];
        if (version === undefined || typeof version !== "number") {
            return undefined;
        }
        const attributeIdStr = attributeId?.toString();
        const data = clusterValues[attributeIdStr] as PersistedAttributeValue;
        const { value, attributeName } = data ?? {};
        if (value === undefined) {
            return undefined;
        }
        return {
            path: {
                endpointId,
                clusterId,
                attributeId,
                attributeName,
            },
            value,
            version,
        };
    }

    retrieveAttributes(endpointId: EndpointNumber, clusterId: ClusterId): DecodedAttributeReportValue<any>[] {
        const store = this.#storeForEndpoint(endpointId);
        const clusterValues = store.get.get(clusterId.toString());
        if (clusterValues === undefined) {
            return [];
        }
        const version = clusterValues[VERSION_KEY];
        if (version === undefined || typeof version !== "number") {
            return [];
        }
        return Object.keys(clusterValues)
            .filter(key => key !== VERSION_KEY)
            .map(key => {
                const { value, attributeName } = clusterValues[key] as PersistedAttributeValue;
                return {
                    path: { endpointId, clusterId, attributeId: AttributeId(parseInt(key)), attributeName },
                    value,
                    version,
                };
            });
    }

    async persistAttributes(attributes: DecodedAttributeReportValue<any>[], scope: ReadScope) {
        // We only store values that are filtered by out fabric, else we create a mixture of data
        if (!scope.isFabricFiltered) {
            return;
        }

        const endpointDataMap = new Map<EndpointNumber, Record<ClusterId, Val.Struct>>();
        for (const {
            path: { endpointId, clusterId, attributeId, attributeName },
            value,
            version,
        } of attributes) {
            if (value === undefined) {
                logger.warn(`Ignoring undefined value for attribute ${attributeId} on endpoint ${endpointId}`);
                continue;
            }
            let endpointData = endpointDataMap.get(endpointId);
            if (endpointData === undefined) {
                endpointData = {};
                endpointDataMap.set(endpointId, endpointData);
            }

            let clusterData = endpointData[clusterId];
            if (clusterData === undefined) {
                clusterData = {};
                endpointData[clusterId] = clusterData;
            }

            clusterData[attributeId.toString()] = { value, attributeName };
            if (scope.isWildcard(endpointId, clusterId)) {
                clusterData[VERSION_KEY] = version;
            }
        }
        for (const [endpointId, endpointData] of endpointDataMap) {
            const store = this.#storeForEndpoint(endpointId);
            await store.set(endpointData);
        }
    }

    getClusterDataVersion(endpointId: EndpointNumber, clusterId: ClusterId): number | undefined {
        const store = this.#storeForEndpoint(endpointId);
        const clusterValues = store.get.get(clusterId.toString());
        return clusterValues?.[VERSION_KEY] as number | undefined;
    }

    getClusterDataVersions(
        filterEndpointId?: EndpointNumber,
        filterClusterId?: ClusterId,
    ): { endpointId: EndpointNumber; clusterId: ClusterId; dataVersion: number }[] {
        const versions: { endpointId: EndpointNumber; clusterId: ClusterId; dataVersion: number }[] = [];
        const filterClusterIdStr = filterClusterId?.toString();
        for (const [endpointId, store] of this.#endpointStores) {
            if (filterEndpointId !== undefined && endpointId !== filterEndpointId) {
                continue;
            }
            const endpointData = store.get;
            for (const clusterId of endpointData.keys()) {
                if (filterClusterIdStr !== undefined && clusterId !== filterClusterIdStr) {
                    continue;
                }
                const version = endpointData.get(clusterId.toString())![VERSION_KEY];
                if (typeof version === "number") {
                    versions.push({ endpointId, clusterId: ClusterId(parseInt(clusterId)), dataVersion: version });
                }
            }
        }
        return versions;
    }

    cleanupAttributeData(endpointId: EndpointNumber, clusterIds?: ClusterId[]): MaybePromise<void> {
        const store = this.#storeForEndpoint(endpointId);
        if (clusterIds === undefined) {
            this.#endpointStores.delete(endpointId);
            return store.erase();
        }
        for (const clusterId of store.get.keys()) {
            if (!clusterIds.includes(ClusterId(parseInt(clusterId)))) {
                store.get.delete(clusterId);
            }
        }
    }
}
