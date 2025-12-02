/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Construction,
    Diagnostic,
    Environment,
    Environmental,
    Logger,
    MatterAggregateError,
    MaybePromise,
    Network,
    VariableService,
} from "#general";
import { MdnsServer } from "../mdns/MdnsServer.js";
import { MdnsClient } from "./MdnsClient.js";
import { MdnsSocket } from "./MdnsSocket.js";

const logger = Logger.get("MDNS");

export class MdnsService {
    #socket?: MdnsSocket;
    #server?: MdnsServer;
    #client?: MdnsClient;
    readonly #construction: Construction<MdnsService>;
    readonly #enableIpv4: boolean;
    readonly limitedToNetInterface?: string;

    get enableIpv4() {
        return this.#enableIpv4;
    }

    constructor(environment: Environment, options?: MdnsService.Options) {
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

    get [Diagnostic.value]() {
        return "MDNS";
    }

    get construction() {
        return this.#construction;
    }

    async close() {
        await this.#construction.close(async () => {
            const broadcasterDisposal = MaybePromise.then(this.#server?.close(), undefined, e =>
                logger.error("Error disposing of MDNS server", e),
            );

            const scannerDisposal = MaybePromise.then(this.#client?.close(), undefined, e =>
                logger.error("Error disposing of MDNS client", e),
            );

            await MatterAggregateError.allSettled(
                [broadcasterDisposal, scannerDisposal],
                "Error disposing MDNS services",
            ).catch(error => logger.error(error));

            if (this.#socket) {
                await this.#socket?.close();
            }

            this.#server = this.#client = undefined;
        });
    }
}

export namespace MdnsService {
    export interface Options {
        networkInterface?: string;
        ipv4?: boolean;
    }
}
