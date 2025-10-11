#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// This demonstrates a matter.js device that supports a WebSocket API on Node.js

import { ServerNode, WebSocketServer } from "@matter/main";
import { OnOffLightDevice, OnOffLightRequirements } from "@matter/main/devices/on-off-light";

// This plugin installs WebSocket support for matter.js on Node.js
import "@matter/nodejs-ws";

/**
 * Create node with WebSocket APIs enabled.
 *
 * By default these listen on a UNIX socket under ~/.matter/matter.sock.  You can change this here or by using
 * environment variables:
 *
 *     MATTER_WEBSOCKET_ADDRESS=ws://localhost
 *
 * or command line arguments:
 *
 *     --websocket-address=ws://localhost
 */
const node = await ServerNode.create(ServerNode.RootEndpoint.with(WebSocketServer));

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
