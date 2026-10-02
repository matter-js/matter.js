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
    RuntimeService,
    VariableService,
} from "@matter/general";
import { MdnsServer } from "../mdns/MdnsServer.js";

const logger = Logger.get("MDNS");

/** DNS-SD service-type suffixes matter.js discovers (operational, commissionable, commissioner), leading dot included
 * so the ingress filter can `endsWith` them directly. */
const MATTER_SERVICE_SUFFIXES = ["._matter._tcp.local", "._matterc._udp.local", "._matterd._udp.local"];

export class MdnsService {
    readonly #entropy: Entropy;
    readonly #construction: Construction<MdnsService>;
    readonly #runtime: RuntimeService;
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
        this.#runtime = rootEnvironment.runtime;

        // Added before #construction exists so a failed mDNS start does not crash the runtime; close() removes it
        this.#runtime.add(this);

        const vars = environment.get(VariableService);
        this.#enableIpv4 = vars.boolean("mdns.ipv4") ?? options?.ipv4 ?? true;
        this.limitedToNetInterface = vars.get("mdns.networkInterface", options?.networkInterface);

        this.#construction = Construction(this, async () => {
            try {
                this.#socket = await MdnsSocket.create(network, {
                    lifetime: this.#construction,
                    enableIpv4: this.enableIpv4,
                    netInterface: this.limitedToNetInterface,
                });
            } catch (cause) {
                // Withdraw before rejecting so a retry constructs a new instance instead of awaiting this crashed one
                rootEnvironment.delete(MdnsService, this);
                rootEnvironment.runtime.delete(this);
                throw cause;
            }

            this.#server = new MdnsServer(this.#socket, this.#construction);
        });
    }

    static [Environmental.create](environment: Environment) {
        return new this(environment);
    }

    get server() {
        return this.#construction.assert("MDNS service", this.#server);
    }

    get names() {
        if (this.#names === undefined) {
            this.#names = new DnssdNames({
                socket: this.#construction.assert("MDNS socket", this.#socket),
                lifetime: this.#construction,
                entropy: this.#entropy,
                filter: ({ name }) => {
                    const lower = name.toLowerCase();
                    return MATTER_SERVICE_SUFFIXES.some(suffix => lower.endsWith(suffix));
                },
                filterNames: MATTER_SERVICE_SUFFIXES.map(suffix => suffix.slice(1)),
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
        try {
            await this.#construction.close(async () => {
                try {
                    await MatterAggregateError.allSettled(
                        [this.#server, this.#names].map(svc => svc?.close()),
                        "Error disposing MDNS services",
                    );
                } catch (e) {
                    logger.warn("Error disposing MDNS services", e);
                }

                await this.#socket?.close();

                this.#server = this.#names = undefined;
            });
        } finally {
            this.#runtime.delete(this);
        }
    }
}

export namespace MdnsService {
    export interface Options {
        networkInterface?: string;
        ipv4?: boolean;
    }
}
