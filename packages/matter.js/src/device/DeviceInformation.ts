/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SupportedStorageTypes } from "@matter/general";
import { ClientNode, ClientNodePhysicalProperties } from "@matter/node";
import { BasicInformationClient } from "@matter/node/behaviors/basic-information";
import { PhysicalDeviceProperties } from "@matter/protocol";

/**
 * @deprecated Scheduled for removal in 0.19.  Part of the legacy controller API superseded by `ClientNode` in `@matter/node`.
 */
export type DeviceInformationData = {
    basicInformation?: Record<string, SupportedStorageTypes>;
    deviceMeta?: PhysicalDeviceProperties;
};

/**
 * @deprecated Scheduled for removal in 0.19.  Part of the legacy controller API superseded by `ClientNode` in `@matter/node`.
 */
export class DeviceInformation {
    readonly #node: ClientNode;

    constructor(node: ClientNode) {
        this.#node = node;
    }

    get meta() {
        return ClientNodePhysicalProperties(this.#node);
    }

    get basicInformation() {
        return this.#node.maybeStateOf(BasicInformationClient);
    }

    get valid() {
        return this.basicInformation !== undefined || this.meta !== undefined;
    }

    get details(): DeviceInformationData {
        return {
            basicInformation: this.basicInformation,
            deviceMeta: this.meta,
        };
    }
}
