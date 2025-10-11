#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// This demonstrates a matter.js device that supports an MQTT API on Node.js

import { MqttServer, ServerNode } from "@matter/main";
import { OnOffLightDevice, OnOffLightRequirements } from "@matter/main/devices/on-off-light";

// This plugin installs MQTT support for matter.js
import "@matter/mqtt";

/**
 * Create node with MQTT APIs enabled.
 *
 * We specify the default broker at localhost.
 *
 * You may configure the broker address here, or use environment variables:
 *
 *     MATTER_MQTT_ADDRESS=mqtt://localhost/matter/light01
 *
 * or command line arguments:
 *
 *     --mqtt-address=mqtt://localhost/matter/light01
 */
const node = await ServerNode.create(ServerNode.RootEndpoint.with(MqttServer));

// For demonstration purposes, this server prints state changes to the console
class ReportingOnOffServer extends OnOffLightRequirements.OnOffServer {
    override initialize() {
        this.events.onOff$Changed.on(value => {
            console.log(`Light is now ${value ? "ON" : "OFF"}`);
        });
    }
}

await node.add(OnOffLightDevice.with(ReportingOnOffServer));

await node.run();
