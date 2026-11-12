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
import { EndpointHandle, getDeviceType, listDeviceTypes, listLeafDeviceTypes } from "./devices/DeviceTypeRegistry.js";
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
        // As in the CHIP all-devices-app, "*" selects every leaf device type, and "*:N" numbers them from N
        if (token === "*") {
            specs.push(...listLeafDeviceTypes().map(type => ({ type })));
            continue;
        }
        if (token.startsWith("*:")) {
            const first = parseEndpoint(token, token.substring(2));
            for (const [offset, type] of listLeafDeviceTypes().entries()) {
                addSpec(specs, token, { type, endpoint: first + offset });
            }
            continue;
        }
        if (token.startsWith("*,")) {
            throw new ValidationError(`--device "${token}": "*" takes no options`);
        }

        const colonIdx = token.indexOf(":");
        if (colonIdx === -1) {
            specs.push({ type: token });
            continue;
        }
        addSpec(specs, token, {
            type: token.substring(0, colonIdx),
            endpoint: parseEndpoint(token, token.substring(colonIdx + 1)),
        });
    }

    // As in the CHIP all-devices-app, which falls back to the first device type it registers
    if (specs.length === 0) {
        specs.push({ type: DEFAULT_DEVICE_TYPE, endpoint: 1 });
    }

    return { specs, wifi, groupcast, enableKeyHex };
}

/** The device CHIP's all-devices app starts when no --device is given. */
const DEFAULT_DEVICE_TYPE = "aggregator";

function parseEndpoint(token: string, text: string) {
    const ep = Number.parseInt(text, 10);
    if (!Number.isInteger(ep) || ep < 1 || ep > 0xfffe || String(ep) !== text) {
        throw new ValidationError(`Invalid endpoint in --device "${token}"`);
    }
    return ep;
}

function addSpec(specs: DeviceSpec[], token: string, spec: Required<DeviceSpec>) {
    if (specs.some(({ endpoint }) => endpoint === spec.endpoint)) {
        throw new ValidationError(`Endpoint ${spec.endpoint} declared twice in --device flags ("${token}")`);
    }
    specs.push(spec);
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

        // Every type resolves before the node exists, so a bad --device leaves no node holding storage and a socket
        const factories = specs.map(({ type }) => {
            const factory = getDeviceType(type);
            if (!factory) {
                throw new ValidationError(
                    `unsupported --device "${type}" (supported: ${listDeviceTypes().join(", ")})`,
                );
            }
            return factory;
        });

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
        for (const [index, spec] of specs.entries()) {
            const { type } = spec;
            const factory = factories[index];
            const endpoint = spec.endpoint === undefined ? numbers.first() : numbers.take(spec.endpoint);
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
