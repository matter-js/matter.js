/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Construction,
    Diagnostic,
    DnssdNames,
    Entropy,
    Environment,
    Environmental,
    Logger,
    MatterAggregateError,
    MdnsSocket,
    Network,
    VariableService,
} from "@matter/general";
import { MdnsServer } from "../mdns/MdnsServer.js";

const logger = Logger.get("MDNS");

export class MdnsService {
    readonly #entropy: Entropy;
    readonly #construction: Construction<MdnsService>;
    readonly #enableIpv4: boolean;
    readonly limitedToNetInterface?: string;

    #socket?: MdnsSocket;
    #server?: MdnsServer;
    #names?: DnssdNames;

    get enableIpv4() {
        return this.#enableIpv4;
    }

    constructor(environment: Environment, options?: MdnsService.Options) {
        this.#entropy = environment.get(Entropy);
        const network = environment.get(Network);
        const rootEnvironment = environment.root;
        rootEnvironment.set(MdnsService, this);
        rootEnvironment.runtime.add(this);

        const vars = environment.get(VariableService);
        this.#enableIpv4 = vars.boolean("mdns.ipv4") ?? options?.ipv4 ?? true;
        this.limitedToNetInterface = vars.get("mdns.networkInterface", options?.networkInterface);

        this.#construction = Construction(this, async () => {
            this.#socket = await MdnsSocket.create(network, {
                lifetime: this.#construction,
                enableIpv4: this.enableIpv4,
                netInterface: this.limitedToNetInterface,
            });

            this.#server = new MdnsServer(this.#socket, this.#construction);

            this.#names = new DnssdNames({
                socket: this.#socket,
                lifetime: this.#construction,
                entropy: this.#entropy,
                filter: ({ name }) => {
                    const lower = name.toLowerCase();
                    return (
                        lower.endsWith("._matter._tcp.local") ||
                        lower.endsWith("._matterc._udp.local") ||
                        lower.endsWith("._matterd._udp.local")
                    );
                },
            });
        });
    }

    static [Environmental.create](environment: Environment) {
        return new this(environment);
    }

    get server() {
        return this.#construction.assert("MDNS service", this.#server);
    }

    get names() {
        return this.#construction.assert("MDNS service", this.#names);
    }

    get [Diagnostic.value]() {
        return "MDNS";
    }

    get construction() {
        return this.#construction;
    }

    async close() {
        await this.#construction.close(async () => {
            try {
                await MatterAggregateError.allSettled(
                    [this.#server, this.#names].map(svc => svc?.close()),
                    "Error disposing MDNS services",
                );
            } catch (e) {
                logger.error(e);
            }

            if (this.#socket) {
                await this.#socket?.close();
            }

            this.#server = this.#names = undefined;
        });
    }
}

export namespace MdnsService {
    export interface Options {
        networkInterface?: string;
        ipv4?: boolean;
    }
}
