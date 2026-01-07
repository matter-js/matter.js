/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Domain } from "#domain.js";
import { decamelize, FormattedText, ImplementationError, MaybePromise } from "#general";
import { bin } from "#globals.js";
import { FieldValue, Metatype } from "#model";
import colors from "ansi-colors";

export interface CommandDefinition<
    N extends CommandDefinition.ArgDescriptor[],
    P extends CommandDefinition.ArgDescriptor[],
    R extends CommandDefinition.ArgDescriptor,
> {
    invoke: (this: Domain, args: CommandDefinition.ArgValues<N, P, R>) => MaybePromise<unknown>;
    usage?: string | string[];
    description: string;
    namedArgs?: N;
    positionalArgs?: P;
    restArgs?: R;
    minArgs?: number;
    maxArgs?: number;
    aliases?: string[];
}

export namespace CommandDefinition {
    export interface ArgDescriptor<T extends `${Metatype}` = any> {
        name: string;
        description: string;
        type?: T;
        default?: Metatype.Native<T>;
    }

    export type ArgValues<
        N extends CommandDefinition.ArgDescriptor[],
        P extends CommandDefinition.ArgDescriptor[],
        R extends CommandDefinition.ArgDescriptor,
    > = NamedArgValues<N> & NamedArgValues<P> & { _: ArgType<R>[] };

    export type NamedArgValues<T extends CommandDefinition.ArgDescriptor[]> = {
        [A in T[number] as A["name"]]: ArgType<A>;
    };

    export type ArgType<T extends CommandDefinition.ArgDescriptor> = T extends { type: string }
        ? Metatype.Native<T["type"]>
        : boolean;
}

export function Command<
    const N extends CommandDefinition.ArgDescriptor[],
    const P extends CommandDefinition.ArgDescriptor[],
    const R extends CommandDefinition.ArgDescriptor,
>({
    invoke: doInvoke,
    usage,
    description,
    namedArgs: namedArgDescriptors,
    positionalArgs: positionalArgDescriptors,
    restArgs: restArgDescriptor,
    minArgs,
    maxArgs,
    aliases,
}: CommandDefinition<N, P, R>) {
    const args: Record<string, CommandDefinition.ArgDescriptor> = {
        "--help": {
            name: "help",
            type: "boolean",
            description: "Show this help",
        },
    };

    const defaults = {} as Record<string, unknown>;

    if (namedArgDescriptors) {
        for (const arg of namedArgDescriptors) {
            const long = arg.name.length > 1;
            if (long) {
                args[`--${arg.name}`] = { type: "boolean", ...arg };
            } else {
                args[`-${arg.name}`] = { type: "boolean", ...arg };
            }
            if (arg.default !== undefined) {
                defaults[arg.name] = arg.default;
            }
        }
    }

    if (!positionalArgDescriptors) {
        positionalArgDescriptors = [] as unknown as P;
    }

    function help(domain: Domain) {
        const namedArgDetails = [
            ...Object.entries(args ?? {}).map(([k, v]) => {
                let description = v.description;
                if (v.default !== undefined) {
                    description = `${description} (default ${v.default})`;
                }
                return [k, description];
            }),
            ["--help", "Show this help"],
        ];

        const maxArgWidth = Math.max(...namedArgDetails.map(([arg]) => arg.length));
        const argNameWidth = maxArgWidth + 4;
        const argDetailWidth = domain.terminalWidth - argNameWidth;

        const argHelp = namedArgDetails.map(([arg, description]) => {
            arg = colors.blue(arg.padEnd(maxArgWidth));
            description = FormattedText(description, argDetailWidth).join("\n").replace(/\n/g, "".padEnd(maxArgWidth));
            return `  ${arg}  ${description}`;
        });

        let usageStr;
        const name = colors.blue(decamelize(doInvoke.name));
        switch (typeof usage) {
            case "object":
                usageStr = ["", ...usage.map(str => `${name}${str ? ` ${str}` : ""}`)].join("\n  ");
                break;

            case "string":
                usageStr = ` ${name} ${usage}`;
                break;

            default:
                usageStr = ` ${name}`;
                break;
        }

        domain.out(
            [
                `\n${colors.bold("Usage:")}${usageStr}`,
                "",
                ...FormattedText(description, domain.terminalWidth),
                "",
                ...argHelp,
            ].join("\n"),
            "\n\n",
        );
    }

    const name = decamelize(doInvoke.name);
    const command = function invoke(this: { domain: Domain }, ...argv: unknown[]) {
        const domain = this.domain;
        if (!domain?.isDomain) {
            throw new ImplementationError(`Domain command ${name} invoked without bin scope`);
        }

        const positionalArgs = Array<unknown>();
        const inputs = { ...defaults } as Record<string, unknown>;

        for (let i = 0; i < argv.length; i++) {
            let arg = argv[i] as string;
            if (typeof arg !== "string" || !arg.startsWith("-")) {
                positionalArgs.push(arg);
                continue;
            }

            const splitAt = arg.indexOf("=");
            let name: string;
            let param: unknown;
            if (splitAt) {
                param = arg.slice(splitAt + 1);
                arg = arg.slice(0, splitAt);
            }

            if (arg[1] === "-") {
                if (!(arg in args)) {
                    domain.err(`Invalid argument: ${arg}\n`);
                    return;
                }

                name = arg.slice(2);

                if (name === "help") {
                    help(domain);
                    return;
                }
            } else {
                for (let i = 0; i < arg.length; i++) {
                    const subarg = `-${arg[i]}`;
                    if (!(subarg in args)) {
                        domain.err(`Invalid argument: ${subarg}\n`);
                        return;
                    }

                    if (i === arg.length - 1) {
                        arg = subarg;
                        name = arg[i];
                    } else {
                        if (args[subarg].type !== "boolean") {
                            domain.err(`Argument "${subarg}" requires a parameter`);
                            return;
                        }
                        inputs[subarg] = true;
                        continue;
                    }
                }
            }

            const definition = args[arg];
            if (param === undefined && definition.type !== "boolean") {
                if (i === argv.length - 1) {
                    domain.err(`Argument "${arg}" requires a parameter`);
                }
                param = argv[++i];
            }

            inputs[name!] = FieldValue.cast((args[arg].type ?? "boolean") as Metatype, param);
        }

        if (minArgs !== undefined && minArgs < positionalArgs.length) {
            domain.err(`Too few arguments\n`);
            return;
        }

        if (maxArgs !== undefined && maxArgs < positionalArgs.length) {
            domain.err(`Too many arguments\n`);
            return;
        }

        for (const arg of positionalArgDescriptors) {
            if (!positionalArgs.length) {
                break;
            }
            inputs[arg.name] =
                arg.type === undefined ? positionalArgs.shift() : Metatype.cast(arg.type, positionalArgs.shift());
        }

        if (restArgDescriptor?.type === undefined) {
            inputs._ = positionalArgs;
        } else {
            inputs._ = positionalArgs.map(arg => Metatype.cast(restArgDescriptor.type, arg));
        }

        return doInvoke.call(domain, inputs as CommandDefinition.ArgValues<N, P, R>);
    };

    command.help = help;

    bin[name] = command;

    if (aliases) {
        for (const alias of aliases) {
            bin[alias] = command;
        }
    }
}
