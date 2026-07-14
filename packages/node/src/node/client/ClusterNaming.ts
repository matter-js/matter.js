/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MatterModel } from "@matter/model";
import type { ClusterId } from "@matter/types";

/**
 * Resolve the numeric ID of an attribute given its name or ID, scoped to a specific cluster within a
 * {@link MatterModel}.
 */
export function attributeId(matter: MatterModel, clusterId: ClusterId, nameOrId: string | number): number | undefined {
    return matter.clusters(clusterId)?.attributes(nameOrId)?.id;
}

/**
 * Resolve the camelCase name of an attribute given its name or ID, scoped to a specific cluster within a
 * {@link MatterModel}.
 */
export function attributeName(
    matter: MatterModel,
    clusterId: ClusterId,
    nameOrId: string | number,
): string | undefined {
    return matter.clusters(clusterId)?.attributes(nameOrId)?.propertyName;
}

/**
 * Resolve the numeric ID of an event given its name or ID, scoped to a specific cluster within a {@link MatterModel}.
 */
export function eventId(matter: MatterModel, clusterId: ClusterId, nameOrId: string | number): number | undefined {
    return matter.clusters(clusterId)?.events(nameOrId)?.id;
}

/**
 * Resolve the camelCase name of an event given its name or ID, scoped to a specific cluster within a
 * {@link MatterModel}.
 */
export function eventName(matter: MatterModel, clusterId: ClusterId, nameOrId: string | number): string | undefined {
    return matter.clusters(clusterId)?.events(nameOrId)?.propertyName;
}

/**
 * Resolve the numeric ID of a command given its name or ID, scoped to a specific cluster within a
 * {@link MatterModel}.
 */
export function commandId(matter: MatterModel, clusterId: ClusterId, nameOrId: string | number): number | undefined {
    return matter.clusters(clusterId)?.commands(nameOrId)?.id;
}

/**
 * Resolve the camelCase name of a command given its name or ID, scoped to a specific cluster within a
 * {@link MatterModel}.
 */
export function commandName(matter: MatterModel, clusterId: ClusterId, nameOrId: string | number): string | undefined {
    return matter.clusters(clusterId)?.commands(nameOrId)?.propertyName;
}
