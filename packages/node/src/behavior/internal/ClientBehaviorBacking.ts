/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GlobalAttributeState } from "#behavior/cluster/ClusterState.js";
import { DatasourceCache } from "#endpoint/index.js";
import { SupportedElements } from "#endpoint/properties/Behaviors.js";
import { MaybePromise } from "@matter/general";
import { ClusterModel } from "@matter/model";
import { AttributeId, CommandId } from "@matter/types";
import { BehaviorBacking } from "./BehaviorBacking.js";

/**
 * This class backs the client implementation of a behavior.
 */
export class ClientBehaviorBacking extends BehaviorBacking {
    #elements?: SupportedElements;

    get elements(): SupportedElements | undefined {
        if (this.#elements) {
            return this.#elements;
        }

        const { attributeList, acceptedCommandList } = this.endpoint.stateOf(this.type) as GlobalAttributeState;
        const schema = this.type.schema as ClusterModel;

        const attributes = new Set<string>();
        const attributeIds = new Set(attributeList);
        for (const attr of schema.attributes) {
            if (attributeIds.has(attr.id as AttributeId)) {
                attributes.add(attr.propertyName);
            }
        }

        const commands = new Set<string>();
        const commandIds = new Set(acceptedCommandList);
        for (const cmd of schema.commands) {
            if (cmd.isRequest && commandIds.has(cmd.id as CommandId)) {
                commands.add(cmd.propertyName);
            }
        }

        return (this.#elements = {
            features: schema.supportedFeatures,
            attributes,
            commands,
            events: new Set(), // Not published
        });
    }

    protected override get datasourceOptions() {
        const options = super.datasourceOptions;
        options.primaryKey = "id";
        return options;
    }

    /**
     * Map attribute ID keys back to property names before broadcasting.
     *
     * The Datasource reports changed keys using the backing's primaryKey format.  Since this backing uses
     * `primaryKey: "id"`, props are attribute ID strings (e.g. "0" for onOff).  Downstream consumers
     * ({@link ChangeNotificationService}, {@link ProtocolService}) expect property names.
     */
    protected override broadcastChanges(props: string[]) {
        const idToName = this.type.supervisor.propertyIdsAndNames;
        super.broadcastChanges(props.map(id => idToName.get(id) ?? id));
    }

    override close(): MaybePromise {
        // Prepare the store for reuse in the case of reset
        (this.store as DatasourceCache).reclaimValues?.();

        // Omit the agent to skip disposal logic as client behaviors have none
        return super.close();
    }
}
