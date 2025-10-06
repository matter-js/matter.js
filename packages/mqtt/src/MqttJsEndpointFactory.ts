/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppAddress, ImplementationError, MqttEndpoint, MqttEndpointFactory, StorageService } from "#general";
import { connectAsync, IClientOptions } from "mqtt";
import { MqttJsEndpoint } from "./MqttJsEndpoint.js";
import { MqttJsMessage } from "./MqttJsMessage.js";

/**
 * MQTT.js-based MQTT implementation.
 */
export class MqttJsEndpointFactory extends MqttEndpointFactory {
    override async connect(options: MqttEndpoint.ConnectionOptions) {
        const addr = AppAddress.for(options.address);
        const opts: IClientOptions = {
            protocolVersion: 5,
        };

        if (addr.protocolModifiers.includes("ws")) {
            opts.protocol = "ws";
            // This conflicts for WS + UNIX socket but that's an MQTT.js problem and likely not a real-world issue since
            // MQTT over WS is generally for browsers
            opts.path = addr.pathname;
        } else {
            opts.protocol = "mqtt";
        }

        if (addr.isTls) {
            opts.protocol += "s";
        }

        const transport = addr.transport;
        switch (transport.kind) {
            case "ip":
                opts.hostname = addr.hostname;
                if (addr.port) {
                    opts.port = Number(addr.port);
                }
                break;

            case "unix":
                opts.protocol += "+unix";
                opts.unixSocket = true;
                opts.path = decodeURIComponent(addr.hostname);
                const storage = options.environment?.get(StorageService);
                if (storage) {
                    opts.path = storage.resolve(opts.path);
                }
                break;

            default:
                throw new ImplementationError(
                    `Unknown transport address kind ${(transport as AppAddress.TransportAddress).kind}`,
                );
        }

        if (addr.username) {
            opts.username = addr.username;
        }
        if (addr.password) {
            opts.password = addr.password;
        }

        if (options.will) {
            opts.will = MqttJsMessage.encode(options.will);
        }

        const client = await connectAsync(opts);

        return new MqttJsEndpoint(client, options);
    }
}
