/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationClient } from "#behaviors/basic-information";
import { SupportedStorageTypes } from "#general";
import type { ClientNodeInteraction } from "#node";
import { ClientNode } from "#node";
import { PhysicalDeviceProperties } from "#protocol";

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
        return (this.#node.interaction as ClientNodeInteraction).physicalProperties;
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
