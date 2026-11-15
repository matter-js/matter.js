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

/**
 * The mDNS socket, responder and DNS-SD name cache, shared by all nodes of a root {@link Environment}.
 *
 * The root environment owns the service.  Hold it through {@link Environment.asDependent}: the last dependent to
 * release it closes it and removes it from the environment, and the next {@link Environment.get} creates a new
 * instance.  A reference taken with a plain {@link Environment.get} does not hold the service and may point to a closed
 * instance once the last dependent released it.
 *
 * A {@link RuntimeService} cancel closes the service once no dependent holds it, so a node that is still closing can
 * send its DNS-SD goodbyes.  The runtime stays active until the service has closed, so a dependent that is not itself
 * a runtime worker keeps the runtime active until it releases the service.  A dependent that only starts loading the
 * service after the cancel does not hold it yet.
 */
export class MdnsService {
    readonly #entropy: Entropy;
    readonly #construction: Construction<MdnsService>;
    readonly #runtime: RuntimeService;
    readonly #worker: RuntimeWorker;
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
        this.#worker = new RuntimeWorker(this, rootEnvironment);

        // Added before #construction exists so a failed mDNS start does not crash the runtime; close() removes it
        this.#runtime.add(this.#worker);

        const vars = environment.get(VariableService);
        this.#enableIpv4 = vars.boolean("mdns.ipv4") ?? options?.ipv4 ?? true;
        this.limitedToNetInterface = vars.get("mdns.networkInterface", options?.networkInterface);
        const logStatistics = vars.boolean("mdns.statistics") ?? false;

        this.#construction = Construction(this, async () => {
            try {
                this.#socket = await MdnsSocket.create(network, {
                    lifetime: this.#construction,
                    enableIpv4: this.enableIpv4,
                    netInterface: this.limitedToNetInterface,
                    logStatistics,
                });
            } catch (cause) {
                // Withdraw before rejecting so a retry constructs a new instance instead of awaiting this crashed one
                rootEnvironment.delete(MdnsService, this);
                this.#runtime.delete(this.#worker);
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
            this.#runtime.delete(this.#worker);
        }
    }
}

/**
 * Represents an {@link MdnsService} in the {@link RuntimeService}, so the runtime stays active until the service has
 * closed.  A runtime cancel closes the service through the root environment, which waits until no dependent holds it.
 */
class RuntimeWorker {
    readonly #service: MdnsService;
    readonly #root: Environment;

    constructor(service: MdnsService, root: Environment) {
        this.#service = service;
        this.#root = root;
    }

    /** Lets the runtime defer a cancel until the service started, and drop it if work resumed meanwhile. */
    get construction() {
        return this.#service.construction;
    }

    async close() {
        const closed = this.#service.construction.closed;
        await this.#root.close(MdnsService);
        await closed;
    }

    get [Diagnostic.value]() {
        return "MDNS runtime worker";
    }
}

export namespace MdnsService {
    export interface Options {
        networkInterface?: string;
        ipv4?: boolean;
    }
}
