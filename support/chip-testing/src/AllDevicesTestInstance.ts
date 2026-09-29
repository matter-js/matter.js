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
import { EndpointNumberAllocator } from "./devices/EndpointNumberAllocator.js";
import { buildRootNode } from "./devices/RootEndpoint.js";
import { DeviceTestInstanceConfig } from "./GenericTestApp.js";
import { NodeTestInstance } from "./NodeTestInstance.js";

const logger = Logger.get("AllDevicesTestInstance");

interface DeviceSpec {
    type: string;

    /**
     * The number `type:N` asks for, undefined for a number assigned as devices are created.
     */
    endpoint?: number;
}

interface RuntimeArgs {
    specs: DeviceSpec[];
    wifi: boolean;
    groupcast: boolean;
    enableKeyHex?: string;
}

function collectValues(args: string[], name: string): string[] {
    const result = new Array<string>();
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === `-${name}` || arg === `--${name}`) {
            if (i + 1 >= args.length) {
                throw new ValidationError(`Missing value for parameter ${name}`);
            }
            result.push(args[i + 1]);
            i++;
        }
    }
    return result;
}

function hasFlag(args: string[], name: string): boolean {
    return args.includes(`-${name}`) || args.includes(`--${name}`);
}

function parseRuntimeArgs(args: string[]): RuntimeArgs {
    const tokens = collectValues(args, "device");
    const wifi = hasFlag(args, "wifi");
    const groupcast = hasFlag(args, "groupcast");
    const enableKeyHex = collectValues(args, "enable-key")[0];

    const specs = new Array<DeviceSpec>();
    for (const token of tokens) {
        const colonIdx = token.indexOf(":");
        if (colonIdx === -1) {
            specs.push({ type: token });
            continue;
        }
        const epStr = token.substring(colonIdx + 1);
        const ep = Number.parseInt(epStr, 10);
        if (!Number.isInteger(ep) || ep < 1 || ep > 0xfffe || String(ep) !== epStr) {
            throw new ValidationError(`Invalid endpoint in --device "${token}"`);
        }
        if (specs.some(({ endpoint }) => endpoint === ep)) {
            throw new ValidationError(`Endpoint ${ep} declared twice in --device flags`);
        }
        specs.push({ type: token.substring(0, colonIdx), endpoint: ep });
    }

    return { specs, wifi, groupcast, enableKeyHex };
}

export class AllDevicesTestInstance extends NodeTestInstance {
    static override id = "alldevices-6100";

    #endpoints = new Map<EndpointNumber, EndpointHandle>();
    #appArgs?: string[];

    constructor(config: DeviceTestInstanceConfig) {
        super(config);
        this.#appArgs = config.appArgs;
    }

    override async initialize() {
        await this.activateCommandPipe("all_devices");
        await super.initialize();
    }

    async setupServer(): Promise<ServerNode> {
        // Prefer per-run app-args injected by the chip test framework; fall back to process.argv for standalone CLI
        // invocations (chip-tool-tests CI binary, local smoke runs).
        const sourceArgs = this.#appArgs ?? process.argv.slice(2);
        const { specs, wifi, groupcast, enableKeyHex } = parseRuntimeArgs(sourceArgs);

        if (specs.length === 0) {
            throw new ValidationError(
                `--device <type[:endpoint]> required (supported: ${listDeviceTypes().join(", ")})`,
            );
        }

        const serverNode = await buildRootNode({
            id: this.id,
            appName: this.appName,
            env: this.env,
            wifi,
            discriminator: this.config.discriminator ?? 3840,
            passcode: this.config.passcode ?? 20202021,
            port: this.config.port,
            enableKeyHex,
            groupcast,
        });

        const numbers = new EndpointNumberAllocator(specs.flatMap(({ endpoint }) => endpoint ?? []));
        for (const spec of specs) {
            const { type } = spec;
            const factory = getDeviceType(type);
            if (!factory) {
                throw new ValidationError(
                    `unsupported --device "${type}" (supported: ${listDeviceTypes().join(", ")})`,
                );
            }
            const endpoint = spec.endpoint === undefined ? numbers.next() : numbers.take(spec.endpoint);
            logger.info(`Adding device "${type}" on endpoint ${endpoint}`);
            const handle = await factory.create(serverNode, endpoint, numbers);
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
