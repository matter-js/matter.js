/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "@matter/general";
import { ServerNode } from "@matter/main";
import { EndpointNumber, ValidationError } from "@matter/main/types";
import { BackchannelCommand } from "@matter/testing";
import "./devices/all-devices.js";
import { EndpointHandle, getDeviceType, listDeviceTypes } from "./devices/DeviceTypeRegistry.js";
import { buildRootNode } from "./devices/RootEndpoint.js";
import { DeviceTestInstanceConfig, getParameter, getParameters, hasParameter } from "./GenericTestApp.js";
import { NodeTestInstance } from "./NodeTestInstance.js";

const logger = Logger.get("AllDevicesTestInstance");

interface DeviceSpec {
    type: string;
    endpoint: EndpointNumber;
}

function parseDeviceArgs(): DeviceSpec[] {
    const tokens = getParameters("device");

    // Pass 1: collect explicit-endpoint reservations so auto-allocation can skip them.
    const reserved = new Set<number>();
    for (const token of tokens) {
        const colonIdx = token.indexOf(":");
        if (colonIdx === -1) continue;
        const epStr = token.substring(colonIdx + 1);
        const ep = Number.parseInt(epStr, 10);
        if (!Number.isInteger(ep) || ep < 1 || String(ep) !== epStr) {
            throw new ValidationError(`Invalid endpoint in --device "${token}"`);
        }
        if (reserved.has(ep)) {
            throw new ValidationError(`Endpoint ${ep} declared twice in --device flags`);
        }
        reserved.add(ep);
    }

    // Pass 2: walk tokens in CLI order, allocating each entry's endpoint number.
    const result = new Array<DeviceSpec>();
    const used = new Set<number>();
    let nextAuto = 1;
    for (const token of tokens) {
        const colonIdx = token.indexOf(":");
        let type: string;
        let endpoint: number;
        if (colonIdx === -1) {
            type = token;
            while (reserved.has(nextAuto) || used.has(nextAuto)) nextAuto++;
            endpoint = nextAuto;
        } else {
            type = token.substring(0, colonIdx);
            endpoint = Number.parseInt(token.substring(colonIdx + 1), 10);
        }
        if (used.has(endpoint)) {
            throw new ValidationError(`Endpoint ${endpoint} declared twice in --device flags`);
        }
        used.add(endpoint);
        result.push({ type, endpoint: EndpointNumber(endpoint) });
    }
    return result;
}

export class AllDevicesTestInstance extends NodeTestInstance {
    static override id = "alldevices-6100";

    #endpoints = new Map<EndpointNumber, EndpointHandle>();

    constructor(config: DeviceTestInstanceConfig) {
        super(config);
    }

    override async initialize() {
        await this.activateCommandPipe("all_devices");
        await super.initialize();
    }

    async setupServer(): Promise<ServerNode> {
        const wifi = hasParameter("wifi");
        const specs = parseDeviceArgs();

        if (specs.length === 0) {
            throw new ValidationError(
                `--device <type[:endpoint]> required (supported: ${listDeviceTypes().join(", ")})`,
            );
        }

        const enableKeyHex = getParameter("enable-key");

        const serverNode = await buildRootNode({
            id: this.id,
            appName: this.appName,
            env: this.env,
            wifi,
            discriminator: this.config.discriminator ?? 3840,
            passcode: this.config.passcode ?? 20202021,
            enableKeyHex,
        });

        for (const { type, endpoint } of specs) {
            const factory = getDeviceType(type);
            if (!factory) {
                throw new ValidationError(
                    `unsupported --device "${type}" (supported: ${listDeviceTypes().join(", ")})`,
                );
            }
            logger.info(`Adding device "${type}" on endpoint ${endpoint}`);
            const handle = await factory.create(serverNode, endpoint);
            this.#endpoints.set(endpoint, handle);
        }

        return serverNode;
    }

    override async backchannel(command: BackchannelCommand) {
        const targetEp =
            "endpointId" in command && command.endpointId !== undefined
                ? EndpointNumber(command.endpointId)
                : undefined;
        const target = targetEp !== undefined ? this.#endpoints.get(targetEp) : undefined;

        if (target?.handleBackchannel) {
            const handled = await target.handleBackchannel(command);
            if (handled === true) return;
        }

        for (const [, handle] of this.#endpoints) {
            if (handle === target) continue;
            if ((await handle.handleBackchannel?.(command)) === true) return;
        }

        return super.backchannel(command);
    }
}
