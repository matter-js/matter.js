/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SupportedStorageTypes } from "@matter/general";
import { ClientNode, ClientNodePhysicalProperties } from "@matter/node";
import { BasicInformationClient } from "@matter/node/behaviors/basic-information";
import { PhysicalDeviceProperties } from "@matter/protocol";

/** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
export type DeviceInformationData = {
    basicInformation?: Record<string, SupportedStorageTypes>;
    deviceMeta?: PhysicalDeviceProperties;
};

/** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
export class DeviceInformation {
    readonly #node: ClientNode;

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    constructor(node: ClientNode) {
        this.#node = node;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get meta() {
        return ClientNodePhysicalProperties(this.#node);
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get basicInformation() {
        return this.#node.maybeStateOf(BasicInformationClient);
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get valid() {
        return this.basicInformation !== undefined || this.meta !== undefined;
    }

    /** @deprecated Legacy API, removed in 0.19. Migrate to @matter/node — see docs/MIGRATION_CONTROLLER_018.md. */
    get details(): DeviceInformationData {
        return {
            basicInformation: this.basicInformation,
            deviceMeta: this.meta,
        };
    }
}
