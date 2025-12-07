/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import Dockerode, { ExecCreateOptions } from "dockerode";
import { ReadStream } from "node:fs";
import { finished } from "node:stream/promises";
import { base64Of } from "../util/text.js";
import type { Docker } from "./docker.js";
import { edit } from "./edit.js";
import { DockerError, NonZeroExitError } from "./errors.js";
import { Image } from "./image.js";
import { Network } from "./network.js";
import { Terminal } from "./terminal.js";

/**
 * Container interface with various convenience methods.
 */
export interface Container {
    docker: Docker;

    image: Promise<Image>;

    start(): Promise<void>;
    kill(): Promise<void>;
    remove(force?: boolean): Promise<void>;
    attach<T extends Terminal.Factory>(terminal: T): Promise<ReturnType<T>>;
    wait(options?: Dockerode.ContainerWaitOptions): Promise<void>;

    /**
     * Execute a command with no input or output.
     */
    exec(command: string | string[], options?: Container.ExecOptions): Promise<void>;

    /**
     * Execute a command with input and/or output.
     */
    exec<T extends Terminal.Factory>(
        command: string | string[],
        terminal: T,
        options?: Container.ExecOptions,
    ): Promise<ReturnType<T>>;

    /**
     * Retrieve contents of a file as a string.
     */
    read(path: string): Promise<string>;

    /**
     * Retrieve the contents of a file using a terminal.
     */
    read<T extends Terminal.Factory>(path: string, terminal: T): Promise<ReturnType<T>>;

    /**
     * Continuously stream the contents of a text file until the terminal closes.
     */
    follow(path: string): Promise<Terminal<string>>;

    /**
     * Continously stream the contents of a file until the terminal closes.
     */
    follow<T extends Terminal.Factory>(path: string, terminal: T): Promise<ReturnType<T>>;

    /**
     * Retrieve the response of a command as a string.
     */
    execAndRead(command: string | string[]): Promise<string>;

    /**
     * Retrieve the response of a command using a terminal.
     */
    execAndRead<T extends Terminal.Factory>(command: string | string[], terminal: T): Promise<ReturnType<T>>;

    /**
     * Set contents of a file.
     */
    write(path: string, contents: {}): Promise<void>;

    /**
     * Delete a file.
     */
    delete(path: string, options?: FileDeleteOptions): Promise<void>;

    /**
     * Modify one or more files.
     */
    edit(editor: edit.Editor, ...paths: string[]): Promise<void>;

    /**
     * List files matching a bash glob.
     */
    resolveGlob(glob: string): Promise<string[]>;

    /**
     * Create a named pipe.
     *
     * Communicate with the pipe via {@link readFile} and {@link writeFile}.
     */
    createPipe(name: string): Promise<void>;
}

export interface FileDeleteOptions {
    force?: boolean;
    recursive?: boolean;
}

/**
 * Create a new container.
 */
export function Container(docker: Docker, options: Container.Configuration): Promise<Container>;

/**
 * Wrap a {@link Dockerode.Container}.
 */
export function Container(docker: Docker, container: Dockerode.Container): Container;

export function Container(
    docker: Docker,
    input: Dockerode.Container | Container.Configuration,
): Container | Promise<Container> {
    if (input instanceof Dockerode.Container) {
        return adaptContainer(docker, input);
    }

    return createContainer(docker, input);
}

export namespace Container {
    export interface Configuration {
        image: string;
        tag?: string;
        platform?: string;
        name?: string;
        replace?: boolean;
        autoRemove?: boolean;
        entrypoint?: string | string[];
        command?: string | string[];
        env?: Record<string, string>;
        privileged?: boolean;
        binds?: Record<string, string>;
        network?: string | Network | Network[];
        input?: ReadStream;
        openStdin?: boolean;
        cwd?: string;
    }

    export interface ExecOptions {
        stdin?: boolean;
        cwd?: string;
        env?: Record<string, string>;
    }

    export interface NetworkConfiguration {
        network: string | Network;
    }
}

async function createContainer(docker: Docker, config: Container.Configuration) {
    const dockerodeConfig = configureContainer(config);
    const ct = await DockerError.adapt(docker.intf.createContainer(dockerodeConfig));
    return adaptContainer(docker, ct);
}

function configureContainer(options: Container.Configuration) {
    const createOptions: Dockerode.ContainerCreateOptions & { HostConfig: Dockerode.HostConfig } = {
        Image: options.image,
        HostConfig: {
            AutoRemove: options?.autoRemove,

            // Ugh.  With a proper networking config we can perhaps avoid this.  Probably makes sense to run a utility
            // container with avahi
            SecurityOpt: ["apparmor:unconfined"],
        },
        AttachStdout: true,
        AttachStderr: true,
    } as Dockerode.ContainerCreateOptions & { HostConfig: Dockerode.HostConfig };

    const { name, entrypoint, env, binds, command, openStdin, network, cwd, platform } = options ?? {};

    if (typeof network === "string") {
        createOptions.HostConfig.NetworkMode = network;
    } else if (network) {
        const networks = Array.isArray(network) ? network : [network];

        createOptions.NetworkingConfig = {
            EndpointsConfig: Object.fromEntries(networks.map(n => [n.name, {}])),
        };
    }

    if (cwd !== undefined) {
        createOptions.WorkingDir = cwd;
    }

    if (name !== undefined) {
        createOptions.name = name;
    }

    if (entrypoint !== undefined) {
        createOptions.Entrypoint = entrypoint;
    }

    if (env) {
        createOptions.Env = Object.entries(env).map(([k, v]) => `${k}=${v}`);
    }

    if (binds) {
        createOptions.HostConfig.Binds = Object.entries(binds).map(([k, v]) => `${k}:${v}`);
    }

    if (command) {
        createOptions.Cmd = Array.isArray(command) ? command : [command];
    }

    if (openStdin !== false) {
        createOptions.OpenStdin = true;
        createOptions.AttachStdin = true;
        createOptions.StdinOnce = true;
    }

    if (platform) {
        createOptions.platform = platform;
    }

    return createOptions;
}

function adaptContainer(docker: Docker, ct: Dockerode.Container): Container {
    return {
        docker,

        get image() {
            return DockerError.adapt(ct.inspect().then(info => Image(docker, info.Image)));
        },

        async start() {
            await DockerError.adapt(ct.start());
        },

        async kill() {
            await DockerError.adapt(ct.kill());
        },

        async remove(force?: boolean) {
            await DockerError.adapt(ct.remove({ force }));
        },

        async attach<T extends Terminal.Factory>(terminal: T, stdin = false) {
            const exited = new Promise<void>((resolve, reject) => {
                this.wait().then(resolve, reject);
            });

            return terminal(
                this.docker,
                await DockerError.adapt(ct.attach({ stream: true, stdin, stdout: true, stderr: true })),
                exited,
            ) as ReturnType<T>;
        },

        async exec<T extends Terminal.Factory>(
            command: string | string[],
            terminalOrOptions?: T | Container.ExecOptions,
            options?: Container.ExecOptions,
        ) {
            let terminal;
            if (typeof terminalOrOptions === "object") {
                options = terminalOrOptions;
            } else {
                terminal = terminalOrOptions;
            }

            const { stdin, cwd, env } = options ?? {};
            if (!Array.isArray(command)) {
                command = [command];
            }

            const config: ExecCreateOptions = {
                Cmd: command,
                AttachStdin: stdin,
                AttachStdout: true,
                AttachStderr: true,
            };

            if (cwd !== undefined) {
                config.WorkingDir = cwd;
            }

            if (env !== undefined) {
                config.Env = Object.entries(env).map(([k, v]) => `${k}=${v}`);
            }

            const exec = await DockerError.adapt(ct.exec(config));

            const stream = await DockerError.adapt(exec.start({ hijack: true, stdin }));

            const exited = new Promise<void>((resolve, reject) => {
                finished(stream).then(() => {
                    exec.inspect().then(info => {
                        if (info.ExitCode) {
                            reject(new NonZeroExitError(info.ExitCode));
                        } else {
                            resolve();
                        }
                    }, reject);
                }, reject);
            });

            // No-terminal overload
            if (terminal === undefined) {
                const term = Terminal.Raw(docker, stream, exited);

                // We don't need the results but consuming will report any text in error message if the exit is non-zero
                await term.consume();

                return;
            }

            // Terminal overload
            return terminal(this.docker, stream, exited) as ReturnType<T>;
        },

        async wait(options?: Dockerode.ContainerWaitOptions) {
            const code = (await DockerError.adapt(ct.wait(options))).StatusCode;
            if (code) {
                throw new NonZeroExitError(code);
            }
        },

        async read<T extends Terminal.Factory>(path: string, terminal?: T): Promise<string | T> {
            const term = await this.exec(["cat", path], terminal ?? Terminal.Line);
            if (terminal === undefined) {
                return (await term.consume()) as string | T;
            }
            return term as T;
        },

        async follow<T extends Terminal.Factory>(path: string, terminal?: T): Promise<T> {
            return this.exec(["tail", "--follow=name", path], terminal ?? Terminal.StdoutLine) as Promise<T>;
        },

        async execAndRead<T extends Terminal.Factory>(command: string | string[], terminal?: T): Promise<string | T> {
            const term = await this.exec(command, terminal ?? Terminal.Line);
            if (terminal === undefined) {
                return (await term.consume()) as string | T;
            }
            return term as T;
        },

        async write(path: string, contents: unknown) {
            const terminal = await this.exec(["bash", "-c", `cat - > ${shesc(path)}`], Terminal.Raw, { stdin: true });

            await terminal.write(contents);
            await terminal.close();
        },

        edit(editor: edit.Editor, ...paths: string[]) {
            return editor(this, paths);
        },

        async delete(path: string, options: FileDeleteOptions) {
            const command = ["rm"];
            if (options?.recursive) {
                command.push("-r");
            }
            if (options?.force) {
                command.push("-f");
            }
            command.push(path);
            await this.exec(command);
        },

        async resolveGlob(glob: string) {
            const terminal = await this.exec(["bash", "-c", `ls ${glob}`], Terminal.Line);
            const output = await terminal.consume();
            return output.split("\n").filter(line => line !== "");
        },

        async createPipe(name: string) {
            // TODO This remove is not right here, but working for now. Will be fixed separately
            await this.exec(["rm", "-f", name]);
            await this.exec(["mkfifo", name]);
        },
    } satisfies Container;
}

/**
 * Safe shell escape of arbitrary data via base64 encoding.
 */
function shesc(value: string | Uint8Array) {
    return `"$(echo ${base64Of(value)} | base64 -d)"`;
}
