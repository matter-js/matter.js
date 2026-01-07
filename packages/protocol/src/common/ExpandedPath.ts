/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize } from "#general";
import {
    AttributeModel,
    ClusterModel,
    CommandModel,
    DataModelPath,
    EventModel,
    Matter,
    MatterModel,
    Model,
} from "#model";
import { AttributePath, CommandPath, EventPath } from "#types";

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
    base = base ? base.at(endpointIdent, "endpoint") : DataModelPath(endpointIdent, "endpoint");

    let cluster: ClusterModel | undefined;
    base = base.at(identityOf(matter, ClusterModel, path.clusterId), "cluster");

    if ("attributeId" in path) {
        base = base.at("state").at(identityOf(cluster, AttributeModel, path.attributeId));
        if (path.listIndex) {
            return base.at(path.listIndex, "entry");
        }
        return base;
    }

    if ("commandId" in path) {
        return base.at(identityOf(cluster, CommandModel, path.commandId));
    }

    if ("eventId" in path) {
        return base.at("events").at(identityOf(cluster, EventModel, path.eventId));
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
            return id;
        }

        if (type === ClusterModel) {
            cluster = instance as ClusterModel;
        }

        return camelize(instance.name);
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
