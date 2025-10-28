/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BadCommandError, IncompleteError, NotACommandError, NotADirectoryError, NotFoundError } from "#errors.js";
import {
    CancelablePromise,
    Diagnostic,
    Environment,
    InternalError,
    LogFormat,
    MaybePromise,
    Observable,
    SafePromise,
} from "#general";
import { bin, globals as defaultGlobals } from "#globals.js";
import { Location, undefinedValue } from "#location.js";
import { ServerNode } from "#node";
import { Input, parseInput } from "#parser.js";
import { Directory } from "#stat.js";
import colors from "ansi-colors";
import { inspect } from "node:util";
import { createContext, runInContext, RunningCodeOptions } from "node:vm";

export interface TextWriter {
    (...text: string[]): void;
}

const GLOBALS: Record<string, string> = {
    general: "@matter/general",
    tools: "@matter/tools",
    protocol: "@matter/protocol",
    node: "@matter/node",
    types: "@matter/types",
    model: "@matter/model",
    clusters: "@matter/types/clusters",
    behaviors: "@matter/node/behaviors",
    endpoints: "@matter/node/endpoints",
    devices: "@matter/node/devices",
};

/**
 * Interfaces {@link Domain} with other components.
 *
 * Note that this is not destructured internally so fields may be dynamic.
 */
export interface DomainContext {
    description: string;
    env: Environment;
    out: TextWriter;
    err: TextWriter;
    terminalWidth: number;
    colorize: boolean;
}

export interface Domain extends DomainContext {
    isDomain: true;
    location: Location;
    exitHandler?: () => MaybePromise;
    execute(input: string | Input): Promise<unknown>;
    searchPathFor(name: string): Promise<Location>;
    inspect(what: unknown): string;
    displayError(cause: unknown, prefix?: string): void;
    displayHint(message: string): void;
    interrupt(): void;
    interrupted: Observable<[], false | void>;
    globals: Record<string, unknown>;
    globalsLoaded: Promise<void>;
}

/**
 * Maintains state and executes commands.
 */
export async function Domain(context: DomainContext): Promise<Domain> {
    const hiddenGlobals = Object.keys(globalThis);

    const globals: Record<string, unknown> = Object.defineProperties(
        {},
        {
            ...Object.getOwnPropertyDescriptors(globalThis),
            ...Object.getOwnPropertyDescriptors(defaultGlobals),
            bin: {
                value: { ...bin },
                enumerable: true,
                writable: false,
                configurable: false,
            },
        },
    );

    let softInterrupted = false;
    let cancelEval: undefined | (() => void);
    let discardEval: undefined | (() => void);

    Object.defineProperty(globals.bin, "domain", {
        get() {
            return domain;
        },

        enumerable: false,
    });

    globals.global = globals.globalThis = globals;

    const defaultNode = new ServerNode();
    await defaultNode.construction;
    globals[defaultNode.id] = defaultNode;

    const domain: Domain = {
        isDomain: true,

        location: Location(
            "",
            globals,
            Directory({
                paths() {
                    const result = new Set(Object.keys(globals));
                    for (const name of hiddenGlobals) {
                        result.delete(name);
                    }
                    return [...result];
                },

                definitionAt(path: string) {
                    // Crypto has specialized constraints on its "this"
                    if (path === "crypto") {
                        return globalThis.crypto;
                    }
                    if (Object.hasOwn(globals, path)) {
                        const result = globals[path];
                        if (result === undefined) {
                            return undefinedValue;
                        }
                        return result;
                    }
                },
            }),
            undefined,
        ),

        execute,

        async searchPathFor(name: string) {
            let location;
            try {
                location = await this.location.at(name);
            } catch (e) {
                if ((e instanceof NotFoundError || e instanceof NotADirectoryError) && name.indexOf("/") === -1) {
                    // "path" search
                    try {
                        location = await this.location.at(Location.join("/bin", name));
                    } catch (e2) {
                        if (e instanceof NotFoundError || e instanceof NotADirectoryError) {
                            // Throw original error
                            throw e;
                        }
                        throw e2;
                    }
                } else {
                    throw e;
                }
            }
            return location;
        },

        inspect(value: unknown) {
            if (value === undefinedValue) {
                return colors.dim("(undefined)");
            }

            if (
                typeof value === "object" &&
                value !== null &&
                (Diagnostic.value in value || Diagnostic.presentation in value || value instanceof Error)
            ) {
                return LogFormat.formats[colors.enabled ? "ansi" : "plain"](value);
            }

            return inspect(value, false, 1, this.colorize);
        },

        displayError(cause: unknown, prefix?: string) {
            const formatted = this.inspect(cause);

            if (prefix) {
                prefix = colors.dim(`${prefix}: `);
            } else {
                prefix = "";
            }

            this.err(`${prefix}${formatted}\n`);
        },

        displayHint(message: string) {
            this.err(`${colors.dim(colors.whiteBright(message))}\n`);
        },

        interrupt() {
            if (this.interrupted.emit() === false) {
                softInterrupted = false;
                return;
            }

            if (cancelEval) {
                cancelEval();
                cancelEval = undefined;
                softInterrupted = false;
            } else if (discardEval) {
                discardEval();
                discardEval = undefined;
                softInterrupted = false;
                this.displayHint("Ignoring your command (it may continue running)");
            } else if (softInterrupted) {
                if (this.exitHandler) {
                    MaybePromise.catch(this.exitHandler.bind(this), cause =>
                        this.displayError(cause, "Error triggered in exit handler"),
                    );
                } else {
                    this.err(colors.red("Cannot abort process because there is no exit handler"));
                }
            } else {
                this.displayHint("Press control-c again to exit");
                softInterrupted = true;
            }
        },

        get description() {
            return context.description;
        },

        get out() {
            return context.out;
        },

        get err() {
            return context.err;
        },

        get terminalWidth() {
            return context.terminalWidth;
        },

        get colorize() {
            return context.colorize;
        },

        get env() {
            return context.env;
        },

        interrupted: Observable(),

        globals,
        globalsLoaded: undefined as unknown as Promise<void>,
    };

    domain.globalsLoaded = loadGlobals(domain);

    if (!domain.env.vars.has("home")) {
        domain.env.vars.set("home", `/${defaultNode.id}`);
    }

    const vmContext = createContext(
        new Proxy(
            {},
            {
                get(_target, key, _receiver) {
                    if (key in (domain.location.definition as {})) {
                        let result = (domain.location.definition as any)[key];
                        if (typeof result === "function") {
                            result = result.bind(domain.location.definition);
                        }
                        return result;
                    }

                    return globals[key as any];
                },

                set(_target, key, newValue, _receiver) {
                    const { definition } = domain.location;
                    if (definition === undefined || definition === null) {
                        // Shouldn't happen
                        return false;
                    }
                    (definition as any)[key] = newValue;
                    return true;
                },

                has(_target, key) {
                    const { definition } = domain.location;
                    if (definition === undefined || definition === null || typeof definition !== "object") {
                        // Shouldn't happen
                        return false;
                    }
                    return key in definition;
                },

                defineProperty(_target, property, attributes) {
                    Object.defineProperty(domain.location.definition, property, attributes);
                    return true;
                },

                deleteProperty(_target, property) {
                    const { definition } = domain.location;
                    if (definition === undefined || definition === null) {
                        // Shouldn't happen
                        return false;
                    }
                    Reflect.deleteProperty(definition, property);
                    return true;
                },

                ownKeys(_target) {
                    return Reflect.ownKeys(domain.location.definition as {});
                },

                getOwnPropertyDescriptor(target, p) {
                    const result = Reflect.getOwnPropertyDescriptor(domain.location.definition as {}, p);
                    if (result === undefined) {
                        Reflect.deleteProperty(target, p);
                    } else {
                        // We can never report a property as configurable because it must match the result on the target
                        // and we need to be able to configure target to align with other invariants
                        result.configurable = true;
                        Object.defineProperty(target, p, result);
                        return result;
                    }
                },
            },
        ),
    );

    const cwd = domain.env.vars.string("cwd") ?? `/${defaultNode.id}`;
    try {
        domain.location = await domain.location.at(cwd);
    } catch (e) {
        if (!(e instanceof NotFoundError) && !(e instanceof NotADirectoryError)) {
            throw e;
        }
    }

    domain.env.runtime.interrupt = () => {
        domain.interrupt();
        return true;
    };

    return domain;

    async function execute(input: string | Input) {
        softInterrupted = false;

        if (typeof input === "string") {
            input = parseInput(input);
        }

        switch (input.kind) {
            case "empty":
                return;

            case "incomplete":
                throw new IncompleteError(input.error);

            case "command":
                break;

            case "statement":
                return await interruptablePromiseOf(evaluate(input.js));

            default:
                throw new InternalError(`Unknown internal command type ${(input as any).kind}`);
        }

        const { name, args } = input;

        const location = await interruptablePromiseOf(domain.searchPathFor(name));

        const fn = location?.definition;

        if (location === undefined || fn === undefined) {
            throw new NotACommandError(name);
        }

        if (typeof fn !== "function") {
            if (args.length) {
                // If there are arguments it must be a call; otherwise it's just inspection
                throw new BadCommandError(name);
            }
            return fn;
        }

        const argvals = args.map(arg => {
            return evaluate(arg.js, {
                lineOffset: arg.line - 1,
                columnOffset: arg.column,
            });
        });

        const scope = location.parent?.definition ?? globals;

        return await interruptablePromiseOf(fn.apply(scope, argvals));

        async function interruptablePromiseOf<T>(result: MaybePromise<T>) {
            if (!MaybePromise.is(result)) {
                return result;
            }

            // Do not await Construction or Observable
            if ("emit" in result || "change" in result) {
                return result;
            }

            try {
                if (CancelablePromise.is(result)) {
                    cancelEval = result.cancel.bind(result);
                }

                let isDiscarded = false;
                const discarded = new Promise<void>(resolve => {
                    discardEval = () => {
                        isDiscarded = true;
                        resolve();
                    };
                });

                const returnValue = await SafePromise.race([discarded, result]);

                if (isDiscarded) {
                    result.then(
                        () => domain.displayHint("Ignored command has finished"),
                        cause => domain.displayError(cause, "Ignored command crashed"),
                    );
                }

                return returnValue;
            } finally {
                cancelEval = discardEval = undefined;
                softInterrupted = false;
            }
        }
    }

    function evaluate(js: string, options: RunningCodeOptions = {}) {
        return runInContext(js, vmContext, {
            breakOnSigint: true,
            filename: "matter-cli-eval",
            displayErrors: false,
            ...options,
        });
    }
}

/**
 * We load the global packages dynamically, attempting to get interpreter to start faster.
 */
export async function loadGlobals(domain: Domain) {
    const loads = Array<Promise<void>>();

    for (const name in GLOBALS) {
        loads.push(
            import(GLOBALS[name]).then(
                module => (domain.globals[name] = module),
                error => domain.displayError(`Error loading ${GLOBALS[name]}: ${error.message}`),
            ),
        );
    }

    await Promise.allSettled(loads);
}
