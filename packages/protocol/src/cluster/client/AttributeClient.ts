/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "#general";
import { FabricIndex as FabricIndexElement } from "#model";
import { NoAssociatedFabricError } from "#protocol/errors.js";
import { Attribute, AttributeError, AttributeId, ClusterId, EndpointNumber, FabricIndex, TlvSchema } from "#types";
import { InteractionClient } from "../../interaction/InteractionClient.js";

/**
 * Factory function to create an AttributeClient for a given attribute.
 */
export function createAttributeClient<T>(
    attribute: Attribute<T, any>,
    name: string,
    endpointId: EndpointNumber | undefined,
    clusterId: ClusterId,
    interactionClient: InteractionClient,
    present = false,
): AttributeClient<T> {
    if (attribute.unknown) {
        return new UnknownSupportedAttributeClient(attribute, name, endpointId, clusterId, interactionClient);
    }
    if (present) {
        return new SupportedAttributeClient(attribute, name, endpointId, clusterId, interactionClient);
    }
    return new AttributeClient(attribute, name, endpointId, clusterId, interactionClient);
}

/**
 * General class for AttributeClients
 */
export class AttributeClient<T = any> {
    readonly #isWritable: boolean;
    readonly #isFabricScoped: boolean;
    readonly #updatedBySubscriptions: boolean;
    protected readonly schema: TlvSchema<any>;
    readonly #listeners = new Array<(newValue: T) => void>();
    readonly id: AttributeId;
    readonly #interactionClient: InteractionClient;

    constructor(
        readonly attribute: Attribute<T, any>,
        readonly name: string,
        readonly endpointId: EndpointNumber | undefined,
        readonly clusterId: ClusterId,
        interactionClient: InteractionClient,
    ) {
        const { schema, writable, fabricScoped, id, omitChanges } = attribute;
        this.schema = schema;
        this.#isWritable = writable;
        this.#isFabricScoped = fabricScoped;
        this.#updatedBySubscriptions = !omitChanges;
        this.id = id;
        this.#interactionClient = interactionClient;
    }

    /**
     * Set the value of the attribute. When dataVersion parameter is provided the value is only set when the
     * cluster dataVersion of the server matches. If it does not match it is rejected with an Error.
     */
    async set(value: T, dataVersion?: number) {
        if (!this.#isWritable) throw new AttributeError(`Attribute ${this.name} is not writable`);

        value = this.schema.injectField(
            value,
            <number>FabricIndexElement.id,
            FabricIndex.OMIT_FABRIC,
            existingFieldIndex => existingFieldIndex === undefined,
        );

        this.schema.validate(value);

        if (this.#isFabricScoped) {
            // Remove fabric index from structures if the OMIT_FABRIC instance was used (Should be used for all outgoing writes)
            value = this.schema.removeField(
                value,
                <number>FabricIndexElement.id,
                existingFieldIndex => existingFieldIndex === FabricIndex.OMIT_FABRIC,
            );

            try {
                const sessionFabric = this.#interactionClient.session.associatedFabric;
                // also remove fabric index if it is the same as the session fabric
                value = this.schema.removeField(
                    value,
                    <number>FabricIndexElement.id,
                    existingFieldIndex => existingFieldIndex.index === sessionFabric.fabricIndex,
                );
            } catch (e) {
                NoAssociatedFabricError.accept(e);
            }
        }

        return await this.#interactionClient.setAttribute<T>({
            attributeData: {
                endpointId: this.endpointId,
                clusterId: this.clusterId,
                attribute: this.attribute,
                value,
                dataVersion,
            },
        });
    }

    get fabricScoped() {
        return this.#isFabricScoped;
    }

    getLocal() {
        if (this.endpointId === undefined) {
            throw new ImplementationError(`Cannot read attribute ${this.name} without endpointId.`);
        }
        return this.#interactionClient.getStoredAttribute({
            endpointId: this.endpointId,
            clusterId: this.clusterId,
            attribute: this.attribute,
        });
    }

    /**
     * Get the value of the attribute. Fabric scoped reads are always done with the remote.
     * The `requestFromRemote` parameter allowed to force or prevent remote reads:
     * - `true` forces a remote read
     * - `false` forces a local read, return undefined if no value is available
     * - `undefined` returns local values if available or if the read is fabric filtered, otherwise remote read
     */
    async get(requestFromRemote?: boolean, isFabricFiltered = true) {
        if (this.endpointId === undefined) {
            throw new ImplementationError(`Cannot read attribute ${this.name} without endpointId.`);
        }
        if (requestFromRemote === undefined) {
            requestFromRemote = this.#isFabricScoped || !this.#updatedBySubscriptions ? true : undefined;
        } else if (!requestFromRemote && this.#isFabricScoped) {
            requestFromRemote = true;
        }
        return await this.#interactionClient.getAttribute({
            endpointId: this.endpointId,
            clusterId: this.clusterId,
            attribute: this.attribute,
            isFabricFiltered,
            requestFromRemote,
        });
    }

    /**
     * Get the value with version of the attribute. Fabric scoped reads are always done with the remote.
     * The `requestFromRemote` parameter allowed to force or prevent remote reads:
     * - `true` forces a remote read
     * - `false` forces a local read, return undefined if no value is available
     * - `undefined` returns local values if available or if the read is fabric filtered, otherwise remote read
     */
    async getWithVersion(requestFromRemote?: boolean, isFabricFiltered = true) {
        if (this.endpointId === undefined) {
            throw new ImplementationError(`Cannot read attribute ${this.name} without endpointId.`);
        }
        if (requestFromRemote === undefined) {
            requestFromRemote = this.#isFabricScoped || !this.#updatedBySubscriptions ? true : undefined;
        } else if (!requestFromRemote && this.#isFabricScoped) {
            requestFromRemote = true;
        }
        return await this.#interactionClient.getAttributeWithVersion({
            endpointId: this.endpointId,
            clusterId: this.clusterId,
            attribute: this.attribute,
            isFabricFiltered,
            requestFromRemote,
        });
    }

    /** Subscribe to the attribute. */
    async subscribe(
        minIntervalFloorSeconds: number,
        maxIntervalCeilingSeconds: number,
        knownDataVersion?: number,
        isFabricFiltered = true,
    ) {
        if (this.endpointId === undefined) {
            throw new ImplementationError(`Cannot read attribute ${this.name} without endpointId.`);
        }
        if (!this.#updatedBySubscriptions) {
            throw new ImplementationError(`Attribute ${this.name} is not updated by subscriptions.`);
        }
        return this.#interactionClient.subscribeAttribute({
            endpointId: this.endpointId,
            clusterId: this.clusterId,
            attribute: this.attribute,
            minIntervalFloorSeconds,
            maxIntervalCeilingSeconds,
            isFabricFiltered,
            knownDataVersion,
            listener: this.update.bind(this),
        });
    }

    /**
     * Update the value of the attribute. Just internally used!
     * @private
     */
    update(value: T) {
        this.#listeners.forEach(listener => listener(value));
    }

    /** Add a listener to the attribute. */
    addListener(listener: (newValue: T) => void) {
        this.#listeners.push(listener);
    }

    /** Remove a listener from the attribute. */
    removeListener(listener: (newValue: T) => void) {
        const entryIndex = this.#listeners.indexOf(listener);
        if (entryIndex !== -1) {
            this.#listeners.splice(entryIndex, 1);
        }
    }
}

/**
 * Special AttributeClient class to allow identifying attributes that are supported because reported by the Devices.
 */
export class SupportedAttributeClient<T> extends AttributeClient<T> {}

/**
 * Special AttributeClient class to allow identifying attributes that are supported because reported by the Devices,
 * but the contained attribute is unknown.
 */
export class UnknownSupportedAttributeClient extends SupportedAttributeClient<any> {}
