/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment } from "#environment/Environment.js";
import { Environmental } from "#environment/Environmental.js";
import { ImplementationError } from "#MatterError.js";
import { AppAddress } from "#net/AppAddress.js";
import { MqttEndpoint } from "./MqttEndpoint.js";
import { MqttEndpointFactory } from "./MqttEndpointFactory.js";

/**
 * Provides connections to MQTT brokers.
 */
export class MqttService {
    #factory: MqttEndpointFactory;

    constructor(factory: MqttEndpointFactory) {
        this.#factory = factory;
    }

    static [Environmental.create](env: Environment) {
        const factory = env.get(MqttEndpointFactory);
        const instance = new this(factory);
        env.set(MqttService, instance);
        return instance;
    }

    connect(options: MqttEndpoint.ConnectionOptions) {
        const addr = AppAddress.for(options.address);

        if (addr.appProtocol !== "mqtt") {
            throw new ImplementationError(`Unsupported address ${addr} for MQTT connection`);
        }

        return this.#factory.connect(options);
    }
}
