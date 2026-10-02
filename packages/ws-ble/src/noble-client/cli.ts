#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Noble-based BLE proxy client CLI.
 *
 * Connects to a hub's BLE proxy WebSocket endpoint and proxies BLE operations to a local Bluetooth adapter.
 *
 * Usage:
 *   matter-ble-proxy --server ws://localhost:5580/ble [--hci-id 0]
 */

import { Logger } from "@matter/general";
import { NobleBleProxyClient } from "./NobleBleProxyClient.js";

const logger = Logger.get("matter-ble-proxy");

const USAGE = `Noble BLE proxy client - reference implementation

Usage: matter-ble-proxy --server <url> [options]

Options:
  --server <url>   BLE proxy WebSocket URL of the hub, e.g. ws://localhost:5580/ble (required)
  --hci-id <id>    Bluetooth adapter HCI ID, e.g. 0 for hci0 (Linux only)
  --help, -h       Show this help`;

function fail(message: string): never {
    process.stderr.write(`${message}\n\n${USAGE}\n`);
    process.exit(1);
}

function parseArgs(argv: string[]) {
    let serverUrl: string | undefined;
    let hciId: number | undefined;

    for (let i = 0; i < argv.length; i++) {
        switch (argv[i]) {
            case "--server":
                serverUrl = argv[++i];
                if (serverUrl === undefined) {
                    fail("--server requires a WebSocket URL");
                }
                break;

            case "--hci-id": {
                const value = argv[++i];
                if (value === undefined) {
                    fail("--hci-id requires an adapter ID");
                }
                hciId = Number.parseInt(value, 10);
                if (Number.isNaN(hciId)) {
                    fail(`--hci-id must be a number, got "${value}"`);
                }
                break;
            }

            case "--help":
            case "-h":
                process.stdout.write(`${USAGE}\n`);
                process.exit(0);
                break;

            default:
                fail(`Unknown argument "${argv[i]}"`);
        }
    }

    if (serverUrl === undefined) {
        fail("--server is required");
    }

    return { serverUrl, hciId };
}

async function main() {
    const { serverUrl, hciId } = parseArgs(process.argv.slice(2));
    const client = new NobleBleProxyClient({ serverUrl, hciId });

    // The proxy is only useful while the hub is reachable; exiting lets a supervisor restart and reconnect it
    const stopped = new Promise<void>(resolve => client.closed.on(() => resolve()));

    let connecting = true;
    let requested = false;
    const shutdown = (signal: string, code: number) => {
        // Nothing is worth draining before the hub connection exists, and a close that cannot finish must not
        // make the process unkillable
        if (connecting || requested) {
            logger.warn(`Received ${signal}, exiting immediately`);
            process.exit(code);
        }
        requested = true;
        logger.info(`Received ${signal}, shutting down...`);
        client.close().catch(error => logger.error("Error during shutdown:", error));
    };

    process.on("SIGINT", () => shutdown("SIGINT", 130));
    process.on("SIGTERM", () => shutdown("SIGTERM", 143));

    logger.info(`Connecting to ${serverUrl}...`);
    try {
        await client.connect();
    } catch (error) {
        logger.error(`Failed to connect to ${serverUrl}:`, error);
        logger.notice(
            "The hub must be reachable and expose the BLE proxy WebSocket endpoint" +
                " (matter-server must run with --ble-proxy)",
        );
        return 1;
    }
    connecting = false;
    logger.info("Connected. BLE proxy active. Press Ctrl+C to stop.");

    // The hub may drop us between the handshake and the observer above, which would never emit again
    if (client.connected) {
        await stopped;
    }

    await client.close();

    // Losing the hub is a failure of the proxy's purpose, so supervisors configured to restart on failure do
    return requested ? 0 : 1;
}

main().then(
    code => process.exit(code),
    error => {
        logger.error("BLE proxy failed:", error);
        process.exit(1);
    },
);
