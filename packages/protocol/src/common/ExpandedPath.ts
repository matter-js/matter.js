/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize } from "@matter/general";
import {
    AttributeModel,
    ClusterModel,
    CommandModel,
    DataModelPath,
    EventModel,
    Matter,
    MatterModel,
    Model,
} from "@matter/model";
import { AttributePath, CommandPath, EventPath } from "@matter/types";

/**
 * Creates a {@link DataModelPath} from a Matter wire-format {@link AttributePath}, {@link EventPath}, or
 * {@link CommandPath}.
 *
 * This is useful for creating human-readable diagnostics.
 */
export function ExpandedPath({ path, matter, base, kind }: ExpandedPath.Definition): DataModelPath {
    if (matter === undefined) {
        matter = Matter;
    }

    if (base && "path" in base) {
        base = base.path;
    }

    const endpointIdent = path.endpointId ?? "*";
    base = base ? base.at(endpointIdent, "endpoint") : new DataModelPath(endpointIdent, "endpoint");

    let cluster: ClusterModel | undefined;
    base = base.at(identityOf(matter, ClusterModel, path.clusterId), "cluster");

    if ("attributeId" in path) {
        base = base.at("state").at(identityOf(cluster, AttributeModel, path.attributeId));
        if (path.listIndex === null) {
            base = base.at("[ADD]", "marker");
        }
        return base;
    }

    if ("commandId" in path) {
        return base.at(identityOf(cluster, CommandModel, path.commandId));
    }

    if ("eventId" in path) {
        base = base.at("events").at(identityOf(cluster, EventModel, path.eventId));
        if ("isUrgent" in path && path.isUrgent) {
            base = base.at("!", "marker");
        }
        return base;
    }

    return base.at("*", kind ?? "element");

    function identityOf(parent: undefined | Model, type: Model.Type, id: undefined | number | string) {
        if (id === undefined) {
            return "*";
        }

        const instance = parent?.get(type, id);
        if (instance === undefined) {
            if (typeof id === "string") {
                return camelize(id);
            }
            return `0x${id.toString(16)}`;
        }

        if (type === ClusterModel) {
            cluster = instance as ClusterModel;
        }

        return instance.propertyName;
    }
}

export namespace ExpandedPath {
    export interface Definition {
        path: AttributePath | EventPath | CommandPath;
        matter?: MatterModel;
        base?: DataModelPath | { path: DataModelPath };
        kind?: "attribute" | "command" | "event" | "entry";
    }
}
