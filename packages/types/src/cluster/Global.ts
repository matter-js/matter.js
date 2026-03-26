/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterModel, GLOBAL_IDS } from "@matter/model";
import type { AttributeId } from "../datatype/AttributeId.js";
import type { CommandId } from "../datatype/CommandId.js";
import type { EventId } from "../datatype/EventId.js";
import type { ClusterType } from "./ClusterType.js";

/**
 * Global attributes shared by all clusters.
 */
export namespace Global {
    export interface Attributes {
        clusterRevision: number;
        featureMap: number;
        attributeList: AttributeId[];
        eventList: EventId[];
        acceptedCommandList: CommandId[];
        generatedCommandList: CommandId[];
    }

    export interface AttributeObjects extends ClusterType.AttributeObjects<Attributes> {}

    // TODO: add global commands (AtomicRequest) once they are modeled

    export const attributes: AttributeObjects = (() => {
        const result: Record<string, ClusterType.Attribute> = {};
        const globalModel = new ClusterModel({ name: "Globals" });
        for (const attr of globalModel.attributes) {
            if (!GLOBAL_IDS.has(attr.id)) {
                continue;
            }
            const key = attr.propertyName;
            result[key] = { id: attr.id as AttributeId, name: key, schema: attr };
        }
        return result;
    })() as AttributeObjects;
}
