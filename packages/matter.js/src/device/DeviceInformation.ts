/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SupportedStorageTypes } from "@matter/general";
import { ClientNode, ClientNodePhysicalProperties } from "@matter/node";
import { BasicInformationClient } from "@matter/node/behaviors/basic-information";
import { PhysicalDeviceProperties } from "@matter/protocol";

export type DeviceInformationData = {
    basicInformation?: Record<string, SupportedStorageTypes>;
    deviceMeta?: PhysicalDeviceProperties;
};

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
