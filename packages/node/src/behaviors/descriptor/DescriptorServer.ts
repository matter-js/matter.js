/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IndexBehavior } from "#behavior/system/index/IndexBehavior.js";
import { Descriptor } from "#clusters/descriptor";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointLifecycle } from "#endpoint/properties/EndpointLifecycle.js";
import { ImplementationError, isDeepEqual } from "#general";
import { DeviceTypeModel, MatterModel } from "#model";
import { ClusterId, DeviceTypeId, EndpointNumber, Semtag, TypeFromSchema } from "#types";
import { DescriptorBehavior } from "./DescriptorBehavior.js";

/**
 * This is the default server implementation of DescriptorBehavior.
 */
export class DescriptorServer extends DescriptorBehavior {
    static override dependencies = [IndexBehavior];

    override async initialize() {
        // We update PartsList differently if there's an index
        if (this.endpoint.behaviors.has(IndexBehavior)) {
            // Note - do not use lock here because this reactor triggers frequently so it pollutes the logs.  Instead
            // lock manually as necessary
            this.reactTo(this.agent.get(IndexBehavior).events.change, this.#updatePartsList);
        } else if (this.endpoint.hasParts) {
            for (const endpoint of this.endpoint.parts) {
                this.#monitorDestruction(endpoint);
            }
        }
        await this.#updatePartsList();

        // Handle lifecycle changes
        this.reactTo(this.endpoint.lifecycle.changed, this.#updateDescriptor);

        // Initialize ServerList
        this.state.serverList = this.#serverList;

        // Initialize DeviceTypeList
        this.#initializeDeviceTypeList();
    }

    /** Initialize device type list when it is not already initialized. */
    #initializeDeviceTypeList() {
        if (!this.state.deviceTypeList.length) {
            const partType = this.endpoint.type;
            this.state.deviceTypeList = [
                {
                    deviceType: partType.deviceType,
                    revision: partType.deviceRevision,
                },
            ];

            // For complete semantics it would be better to include all inherited device types.  However there is
            // typical spec-level confusion that makes this of questionable practical utility so omitting for now
            // for (
            //     let base = MatterModel.standard.get(DeviceTypeModel, partType.deviceType)?.base;
            //     base;
            //     { base } = base
            // ) {
            //     if (!(base instanceof DeviceTypeModel) || base.id === undefined) {
            //         continue;
            //     }

            //     this.state.deviceTypeList.push({
            //         deviceType: DeviceTypeId(base.id),
            //         revision: base.revision,
            //     });
            // }
        }
    }

    /**
     * Extend device type metadata.  This is a shortcut for deduped insert into the deviceTypeList cluster attribute.
     *
     * @param deviceTypes an array of objects or named device types as defined in {@link MatterModel.standard}
     */
    addDeviceTypes(...deviceTypes: (DescriptorServer.DeviceType | string)[]) {
        this.#initializeDeviceTypeList(); // Initialize if not already done
        const list = this.state.deviceTypeList;

        nextInput: for (let newDeviceType of deviceTypes) {
            if (typeof newDeviceType === "string") {
                const dt = MatterModel.standard.get(DeviceTypeModel, newDeviceType);
                if (dt === undefined) {
                    throw new ImplementationError(`Device type ${newDeviceType} not found`);
                }
                newDeviceType = { deviceType: DeviceTypeId(dt.id), revision: dt.revision };
            }

            for (const existingDeviceType of list) {
                if (isDeepEqual(newDeviceType, existingDeviceType)) {
                    continue nextInput;
                }
            }
            list.push(newDeviceType);
        }
    }

    /**
     * Add semantic tags.  This is a shortcut for deduped insert into the tagList cluster attribute.
     *
     * You must enable the "TagList" feature to use this method.
     */
    addTags(...tags: Semtag[]) {
        // TODO - should automatically enable the feature if it's not enabled
        if (!this.features.tagList) {
            throw new ImplementationError('You must enable the descriptor "TagList" feature to set tags');
        }

        const list = (this.state as unknown as { tagList: Semtag[] }).tagList;

        nextInput: for (const newTag of tags) {
            for (const existingTag of list) {
                if (
                    existingTag.mfgCode === newTag.mfgCode &&
                    existingTag.namespaceId === newTag.namespaceId &&
                    existingTag.tag === newTag.tag
                ) {
                    if (existingTag.label !== newTag.label && newTag.label !== null && newTag.label !== undefined) {
                        existingTag.label = newTag.label;
                        continue nextInput;
                    }
                }
            }

            list.push(newTag);
        }
    }

    /**
     * Check for presence of a device type.
     */
    hasDeviceType(type: DeviceTypeId) {
        return this.state.deviceTypeList.findIndex(dt => dt.deviceType === type) !== -1;
    }

    /**
     * Process a structure change event and trigger state updates if necessary.
     */
    async #updateDescriptor(type: EndpointLifecycle.Change, endpoint: Endpoint) {
        switch (type) {
            case EndpointLifecycle.Change.Ready:
                if (!this.endpoint.parts.has(endpoint)) {
                    return;
                }
                await this.#updatePartsList();
                if (!this.endpoint.behaviors.has(IndexBehavior)) {
                    this.#monitorDestruction(endpoint);
                }
                break;

            case EndpointLifecycle.Change.ServersChanged:
                if (endpoint !== this.endpoint) {
                    return;
                }

                await this.context.transaction.addResources(this);
                await this.context.transaction.begin();
                this.state.serverList = this.#serverList;
                break;

            case EndpointLifecycle.Change.Destroying:
                if (endpoint !== this.endpoint) {
                    return;
                }

                await this.stopReacting({ reactor: this.#updatePartsList });
                break;
        }
    }

    /**
     * Monitor endpoint for removal.
     */
    #monitorDestruction(endpoint: Endpoint) {
        this.reactTo(endpoint.lifecycle.destroyed, this.#updatePartsList);
    }

    /**
     * Update the parts list.
     */
    async #updatePartsList() {
        const endpoint = this.endpoint;

        let numbers: number[];

        // The presence of IndexBehavior indicates a flat namespace as required by Matter standard for root and
        // aggregator endpoints
        if (this.agent.has(IndexBehavior)) {
            const index = this.agent.get(IndexBehavior);
            numbers = Object.keys(index.partsByNumber).map(n => Number.parseInt(n));

            // My endpoint should not appear in its own PartsList
            const pos = numbers.indexOf(this.endpoint.number);
            if (pos !== -1) {
                numbers.splice(pos, 1);
            }
        } else if (endpoint.hasParts) {
            // No IndexBehavior, just direct descendents
            numbers = [...endpoint.parts]
                .map(endpoint => (endpoint.lifecycle.hasNumber ? endpoint.number : undefined))
                .filter(n => n !== undefined) as number[];
        } else {
            // No sub-parts
            numbers = [];
        }

        numbers.sort();

        // Do a quick deep equal so we can avoid updating state since the filtering on events that trigger this function
        // is rather lazy
        if (this.state.partsList.length === numbers.length) {
            let i = numbers.length;
            for (; i < numbers.length; i++) {
                if (this.state.partsList[i] !== numbers[i]) {
                    break;
                }
            }
            if (i === numbers.length) {
                return;
            }
        }

        await this.context.transaction.addResources(this);
        await this.context.transaction.begin();

        this.state.partsList = numbers as EndpointNumber[];
    }

    /**
     * Computed current server list.
     */
    get #serverList() {
        const list = new Array<ClusterId>();
        for (const type of Object.values(this.endpoint.behaviors.supported)) {
            const clusterId = (type as { cluster?: { id?: ClusterId } }).cluster?.id;
            if (clusterId) {
                list.push(clusterId);
            }
        }
        return list;
    }
}

export namespace DescriptorServer {
    export type DeviceType = TypeFromSchema<typeof Descriptor.TlvDeviceType>;
}
