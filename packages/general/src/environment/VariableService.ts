/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "../MatterError.js";
import { Diagnostic } from "../log/Diagnostic.js";
import { isObject } from "../util/Type.js";
import type { Environment } from "./Environment.js";
import { Environmental } from "./Environmental.js";

/**
 * Environmental configuration values.
 */
export class VariableService {
    #vars = {} as VariableService.Map;
    #usageCollectors = Array<Set<string>>();
    #usages = new Set<VariableService.Usage>();

    constructor(environment: Environment) {
        environment.set(VariableService, this);
    }

    static [Environmental.create](environment: Environment) {
        return new this(environment);
    }

    get [Diagnostic.value]() {
        return "Configuration";
    }

    get vars() {
        return this.#vars;
    }

    /**
     * Configure a component.
     *
     * Runs the supplied {@link configurator} immediately and whenever variables reference by the {@link configurator}
     * change.
     *
     * To terminate reconfiguration invoke {@link VariableService.Usage.close} on the return value.
     */
    use(configurator: () => void): VariableService.Usage {
        const variables = new Set<string>();
        try {
            this.#usageCollectors.push(variables);
            configurator();
        } finally {
            this.#usageCollectors.pop();
        }

        const usage = {
            variables,
            configurator,
            close: () => {
                this.#usages.delete(usage);
            },
        };
        this.#usages.add(usage);

        return usage;
    }

    get<T extends VariableService.Primitive>(name: string, fallback?: T): T;

    get<T extends VariableService.Value>(name: string, fallback: T): T;

    get<T extends VariableService.Value>(name: string): T | undefined;

    get(name: string, fallback?: VariableService.Value) {
        for (const collector of this.#usageCollectors) {
            collector.add(name);
        }

        switch (typeof fallback) {
            case "string":
                return this.string(name) ?? fallback;

            case "number":
                return this.number(name) ?? fallback;

            case "boolean":
                return this.boolean(name) ?? fallback;
        }

        let value: VariableService.Value = this.#vars;
        for (const segment of this.#parseName(name)) {
            if (value === null || typeof value !== "object" || Array.isArray(value)) {
                return fallback;
            }
            value = value[segment];
        }
        return value ?? fallback;
    }

    has(name: string) {
        return this.get(name) !== undefined;
    }

    set(name: string, value: VariableService.Value) {
        const segments = name.toLowerCase().split(".");
        const key = segments.pop() as string;
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
            throw new ImplementationError(`Invalid variable path name: ${key}`);
        }
        let parent: VariableService.Map = this.#vars;
        for (const segment of segments) {
            let nextParent = parent[segment];
            if (nextParent === undefined || nextParent === null) {
                nextParent = parent[segment] = {};
            } else if (typeof nextParent !== "object" || Array.isArray(nextParent)) {
                throw new ImplementationError(`Can't set ${name} because segment ${segment} is not a map`);
            }
            parent = nextParent;
        }

        if (parent[key] === value) {
            return;
        }

        parent[key] = value;

        for (const usage of this.#usages) {
            if (usage.variables.has(name)) {
                usage.configurator();
            }
        }
    }

    async persist(name: string, value: VariableService.Value) {
        this.set(name, value);
        await this.persistConfigValue?.(name, value);
    }

    persistConfigValue?: (name: string, value: VariableService.Value) => Promise<void>;

    string(name: string) {
        const value = this.get(name);
        if (value === undefined) {
            return value;
        }
        if (typeof value === "string") {
            return value;
        }
        if (value === null) {
            return "null";
        }
        return value.toString();
    }

    boolean(name: string) {
        const value = this.get(name);
        switch (value) {
            case undefined:
                return value;

            case null:
            case 0:
            case "0":
            case false:
            case "false":
            case "off":
                return false;

            default:
                return true;
        }
    }

    number(name: string) {
        let value = this.get(name);
        if (typeof value === "number") {
            return value;
        }
        if (typeof value === "string") {
            value = Number.parseFloat(value);
            if (!Number.isFinite(value)) {
                return;
            }
            return value;
        }
    }

    integer(name: string, fallback?: number) {
        const number = this.number(name) ?? fallback;
        if (typeof number === "number") {
            return Math.floor(number);
        }
    }

    increment(name: string) {
        const value = this.integer(name) ?? 0;
        this.set(name, value + 1);
        return value;
    }

    addConfigStyle(vars: VariableService.Map) {
        const path = Array<string>();

        const add = (vars: VariableService.Map) => {
            for (const name in vars) {
                const val = vars[name];
                if (isObject(val)) {
                    path.push(name);
                    add(val);
                    path.pop();
                } else {
                    this.set([...path, name].join("."), val);
                }
            }
        };

        add(vars);
    }

    addUnixEnvStyle(vars: Record<string, string | undefined>) {
        this.addConfigStyle(parseUnixStyle(vars));
    }

    addArgvStyle(vars: string[]) {
        this.addConfigStyle(parseArgvStyle(vars));
    }

    #parseName(name: string) {
        return name
            .toLowerCase()
            .split(".")
            .map(segment => {
                segment = segment.trim();
                if (segment === "") {
                    throw new ImplementationError(`Variable name ${name} contains empty segments`);
                }
                return segment;
            });
    }
}

export namespace VariableService {
    export interface Options {
        unixEnvStyle?: Record<string, string>;
        argvStyle?: string[];
        configStyle?: Map;
    }

    export interface Map extends Record<string, Value> {}
    export type List = Value[];
    export type Primitive = number | string | boolean;
    export type Value = Primitive | Map | List;
    export interface Usage {
        variables: Set<string>;
        configurator(): void;
        close(): void;
    }
}

function addVariable(into: Record<string, any>, path: string[], value: any) {
    if (!path.length) {
        return;
    }
    const firstPathEntry = path[0];
    if (firstPathEntry === "__proto__" || firstPathEntry === "constructor" || firstPathEntry === "prototype") {
        throw new ImplementationError(`Invalid variable path name: ${firstPathEntry}`);
    }
    let current = into[firstPathEntry];
    if (path.length === 1) {
        if (current === undefined) {
            into[firstPathEntry] = value;
        }
        return;
    }

    if (typeof current !== "object") {
        current = into[firstPathEntry] = {};
    }
    addVariable(current, path.slice(1), value);
}

function parseUnixStyle(values: Record<string, string | undefined>) {
    const variables = {} as VariableService.Map;

    for (const key in values) {
        if (key.startsWith("MATTER_")) {
            if (values[key] === undefined || values[key] === "") {
                continue;
            }
            addVariable(variables, key.slice(7).toLowerCase().split("_"), values[key]);
        }
    }

    return variables;
}

function parseArgvStyle(values: string[]) {
    const variables = {} as VariableService.Map;

    for (let arg of values) {
        if (!arg.startsWith("--")) {
            continue;
        }
        arg = arg.slice(2);

        const separatorPos = arg.indexOf("=");
        let key, value;

        if (separatorPos === -1) {
            key = arg;
            value = true;
        } else {
            key = arg.slice(0, separatorPos);
            value = arg.slice(separatorPos + 1);
            if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
                value = value.slice(1, -1).replaceAll("\\'", "'").replaceAll('\\"', '"');
            }
        }

        addVariable(variables, key.toLowerCase().split("-"), value);
    }

    return variables;
}
