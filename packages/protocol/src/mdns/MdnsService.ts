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
} from "#general";
import { MdnsServer } from "../mdns/MdnsServer.js";
import { MdnsClient } from "./MdnsClient.js";

const logger = Logger.get("MDNS");

export class MdnsService {
    readonly #entropy: Entropy;
    readonly #construction: Construction<MdnsService>;
    readonly #enableIpv4: boolean;
    readonly limitedToNetInterface?: string;

    #socket?: MdnsSocket;
    #server?: MdnsServer;
    #client?: MdnsClient;
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
            this.#client = new MdnsClient(this.#socket, this.#construction);
        });
    }

    static [Environmental.create](environment: Environment) {
        return new this(environment);
    }

    get server() {
        return this.#construction.assert("MDNS service", this.#server);
    }

    get client() {
        return this.#construction.assert("MDNS service", this.#client);
    }

    get names() {
        if (this.#names === undefined) {
            this.#names = new DnssdNames({
                socket: this.#construction.assert("MDNS socket", this.#socket),
                lifetime: this.#construction,
                entropy: this.#entropy,
                filter: ({ name }) => {
                    // TODO - only accepting operational records here; add commissionable when we remove MdnsClient
                    if (name.toLowerCase().match(/_matter(?:[cd]\._udp|\._tcp)\.local$/i)) {
                        return true;
                    }

                    return false;
                },
            });
        }
        return this.#names;
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
                    [this.#server, this.#client, this.#names].map(svc => svc?.close()),
                    "Error disposing MDNS services",
                );
            } catch (e) {
                logger.error(e);
            }

            if (this.#socket) {
                await this.#socket?.close();
            }

            this.#server = this.#client = this.#names = undefined;
        });
    }
}

export namespace MdnsService {
    export interface Options {
        networkInterface?: string;
        ipv4?: boolean;
    }
}
