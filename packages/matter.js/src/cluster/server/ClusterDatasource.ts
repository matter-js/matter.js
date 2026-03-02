/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SupportedStorageTypes } from "@matter/general";
import { Fabric, OccurrenceManager } from "@matter/protocol";

export interface ClusterDatasource {
    readonly version: number;
    readonly eventHandler?: OccurrenceManager;
    readonly fabrics: Fabric[];
    increaseVersion(): number;
    changed(key: string, value: SupportedStorageTypes): void;
}
