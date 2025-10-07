/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MqttEndpoint } from "./MqttEndpoint.js";
import type { MqttService } from "./MqttService.js";

/**
 * Connects to an MQTT broker.
 *
 * MQTT adapters should implement this class.  Clients should access via {@link MqttService}.
 */
export abstract class MqttEndpointFactory {
    abstract connect(options: MqttEndpoint.ConnectionOptions): Promise<MqttEndpoint>;
}
