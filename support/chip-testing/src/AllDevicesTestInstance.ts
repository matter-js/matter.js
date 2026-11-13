/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError, Logger } from "@matter/general";
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

/**
 * One `--device` value, `type[:endpoint][,parent=P][,bridged]`, as CHIP's `DeviceTypeParser::ParseDeviceTypeEntry`
 * reads it, except that an endpoint number must be a plain decimal from 1 to 0xfffe.  The type `*` stands for every
 * leaf device type.
 */
interface DeviceToken {
    text: string;
    type: string;
    endpoint?: number;
    parent?: number;
    bridged: boolean;
}

interface DeviceSpec {
    type: string;

    /**
     * The number `type:N` asks for or a wildcard assigns, undefined for a number assigned as devices are created.
     */
    endpoint?: number;

    /**
     * The endpoint `parent=P` names, undefined for a device directly below the root endpoint.
     */
    parent?: number;

    /**
     * The NodeLabel of a bridged node that `bridged` adds, named after the device below it.
     */
    label?: string;
}

interface RuntimeArgs {
    specs: DeviceSpec[];
    wifi: boolean;
    groupcast: boolean;
    enableKeyHex?: string;
}

const AGGREGATOR = "aggregator";
const BRIDGED_NODE = "bridged-node";

/** The device CHIP's all-devices app starts when no --device is given. */
const DEFAULT_DEVICE_TYPE = AGGREGATOR;
const MAX_ENDPOINT = 0xfffe;

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
    const tokens = collectValues(args, "device").map(parseDeviceToken);
    const wifi = hasFlag(args, "wifi");
    const groupcast = hasFlag(args, "groupcast");
    const enableKeyHex = collectValues(args, "enable-key")[0];

    const specs = tokens.length ? expandDeviceTokens(tokens) : [{ type: DEFAULT_DEVICE_TYPE, endpoint: 1 }];
    validateDeviceSpecs(specs);

    return { specs, wifi, groupcast, enableKeyHex };
}

function parseDeviceToken(text: string): DeviceToken {
    const [main, ...options] = text.split(",");
    const colonIdx = main.indexOf(":");
    const type = colonIdx === -1 ? main : main.substring(0, colonIdx);
    if (type === "") {
        throw new ValidationError(`--device "${text}" names no device type`);
    }

    const token: DeviceToken = { text, type, bridged: false };
    if (colonIdx !== -1) {
        token.endpoint = parseEndpoint(text, main.substring(colonIdx + 1));
    }
    for (const option of options) {
        if (option === "") {
            continue;
        }
        if (option.startsWith("parent=")) {
            token.parent = parseEndpoint(text, option.substring("parent=".length));
        } else if (option === "bridged") {
            token.bridged = true;
        } else {
            throw new ValidationError(`Unknown option "${option}" in --device "${text}"`);
        }
    }
    return token;
}

function parseEndpoint(deviceText: string, numberText: string) {
    const ep = Number.parseInt(numberText, 10);
    if (!Number.isInteger(ep) || ep < 1 || ep > MAX_ENDPOINT || String(ep) !== numberText) {
        throw new ValidationError(`Invalid endpoint in --device "${deviceText}"`);
    }
    return ep;
}

/**
 * Expands `*` and `bridged` as CHIP's `DeviceTypeParser::ExpandWildcards` does.  A bridged device becomes a bridged
 * node on its number with the device on the next number, below the bridged node.  A bridged `*` without a number
 * starts after the highest number the other values ask for.
 *
 * Unlike CHIP, `type` and `*` without a number and without `bridged` stay unnumbered, so they take the lowest free
 * numbers in the order the devices are created.  CHIP puts an unnumbered `type` on endpoint 1.
 */
function expandDeviceTokens(tokens: DeviceToken[]): DeviceSpec[] {
    let nextFree =
        1 +
        Math.max(
            0,
            ...tokens.map(({ endpoint, bridged }) => (endpoint === undefined ? 0 : bridged ? endpoint + 1 : endpoint)),
        );

    const specs = new Array<DeviceSpec>();
    for (const { text, type, endpoint, parent, bridged } of tokens) {
        if (type === "*") {
            const types = listLeafDeviceTypes();
            if (bridged) {
                let next = endpoint ?? nextFree;
                for (const leafType of types) {
                    specs.push(...bridgedDevice(leafType, next, parent));
                    next += 2;
                }
                nextFree = Math.max(nextFree, next);
            } else if (endpoint !== undefined) {
                specs.push(
                    ...types.map((leafType, offset) => ({ type: leafType, endpoint: endpoint + offset, parent })),
                );
                nextFree = Math.max(nextFree, endpoint + types.length);
            } else {
                specs.push(...types.map(leafType => ({ type: leafType, parent })));
            }
            continue;
        }

        if (bridged && type !== BRIDGED_NODE) {
            if (endpoint === undefined) {
                throw new ValidationError(`--device "${text}": "bridged" needs an endpoint number`);
            }
            specs.push(...bridgedDevice(type, endpoint, parent));
            continue;
        }

        specs.push({ type, endpoint, parent });
    }
    return specs;
}

function bridgedDevice(type: string, endpoint: number, parent: number | undefined): DeviceSpec[] {
    return [
        { type: BRIDGED_NODE, endpoint, parent, label: kebabCaseToTitleCase(type) },
        { type, endpoint: endpoint + 1, parent: endpoint },
    ];
}

/** "on-off-light" → "On Off Light", as CHIP labels the bridged node of a bridged device. */
function kebabCaseToTitleCase(type: string) {
    return type
        .split("-")
        .map(word => word.charAt(0).toUpperCase() + word.substring(1))
        .join(" ");
}

/**
 * Applies the checks of CHIP's `DeviceTypeParser::ValidateConfig`.  Unlike CHIP, a parent must be a numbered
 * device before its children, because a matter.js endpoint joins its parent when it is added and an unnumbered
 * device gets its number only then.  So no parent cycle can occur.
 */
function validateDeviceSpecs(specs: DeviceSpec[]) {
    const typeByEndpoint = new Map<number, string>();
    for (const { type, endpoint, parent } of specs) {
        if (endpoint !== undefined) {
            if (endpoint > MAX_ENDPOINT) {
                throw new ValidationError(`--device flags assign endpoint ${endpoint}, above ${MAX_ENDPOINT}`);
            }
            if (typeByEndpoint.has(endpoint)) {
                throw new ValidationError(`Endpoint ${endpoint} declared twice in --device flags`);
            }
        }

        if (type === BRIDGED_NODE && parent === undefined) {
            throw new ValidationError(`A ${BRIDGED_NODE} needs parent=<aggregator endpoint>`);
        }
        if (parent !== undefined) {
            const parentType = typeByEndpoint.get(parent);
            if (parentType === undefined) {
                throw new ValidationError(
                    `Parent endpoint ${parent} of --device "${type}" is not the number of a numbered --device before it`,
                );
            }
            if (type === BRIDGED_NODE && parentType !== AGGREGATOR) {
                throw new ValidationError(
                    `The parent of a ${BRIDGED_NODE} must be an ${AGGREGATOR}, but endpoint ${parent} is "${parentType}"`,
                );
            }
        }

        if (endpoint !== undefined) {
            typeByEndpoint.set(endpoint, type);
        }
    }
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
            const { type, parent, label } = spec;
            const parentEndpoint =
                parent === undefined ? serverNode : this.#endpoints.get(EndpointNumber(parent))?.endpoint;
            if (parentEndpoint === undefined) {
                throw new InternalError(`Parent endpoint ${parent} of device "${type}" does not exist`);
            }
            const endpoint = spec.endpoint === undefined ? numbers.first() : numbers.take(spec.endpoint);
            logger.info(
                `Adding device "${type}" on endpoint ${endpoint}${parent === undefined ? "" : ` below endpoint ${parent}`}`,
            );
            const handle = await factories[index].create(parentEndpoint, endpoint, numbers, label);
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
