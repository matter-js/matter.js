/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    camelize,
    CloneableStorage,
    Environment,
    ImplementationError,
    InternalError,
    Node,
    Seconds,
    StorageService,
    Time,
    type ServerNode,
} from "@matter/main";
import { AdministratorCommissioningServer } from "@matter/main/behaviors/administrator-commissioning";
import { OccurrenceManager } from "@matter/main/protocol";
import { BackchannelCommand, chip, PicsFile, Subject } from "@matter/testing";
import { DeviceTestInstance, DeviceTestInstanceConfig, log } from "./GenericTestApp.js";

/**
 * {@link serverNode}-based test subject.
 */
export abstract class NodeTestInstance extends DeviceTestInstance implements Subject {
    #env = new Environment(`${this.id}-env`, Environment.default);
    #node?: ServerNode;

    static pics?: PicsFile;

    // Configuration values that differ between test runner implementations
    static forceFastTimeouts = false;
    static nonvolatileEvents = false;
    static testEnableKey = "00112233445566778899aabbccddeeff";

    get app() {
        return camelize(this.constructor.name.replace(/^TestInstance$/, ""), true);
    }

    constructor(config: DeviceTestInstanceConfig) {
        super(config);
    }

    get pics() {
        return (this.constructor as Subject.Factory).pics ?? chip.defaultPics;
    }

    get commissioning(): Subject.CommissioningParameters {
        const {
            passcode,
            discriminator,
            pairingCodes: { qrPairingCode },
        } = this.node.state.commissioning;

        return {
            kind: "on-network",
            passcode,
            discriminator,
            qrPairingCode,
        };
    }

    get node() {
        if (this.#node === undefined) {
            throw new InternalError("Test subject node accessed before initialization");
        }
        return this.#node;
    }

    get env() {
        if (!this.#env) {
            throw new InternalError("Test subject environment accessed before initialization");
        }
        return this.#env;
    }

    protected abstract setupServer(): Promise<ServerNode>;

    async #setupServer() {
        const node = (this.#node = await this.setupServer());

        if (NodeTestInstance.forceFastTimeouts) {
            reduceTimeout();
            node.lifecycle.ready.on(reduceTimeout);

            function reduceTimeout() {
                node.behaviors.internalsOf(AdministratorCommissioningServer).minimumCommissioningTimeout = Seconds.one;
            }
        }
    }

    async initialize() {
        if (this.#node) {
            throw new InternalError("Already initialized");
        }

        try {
            this.#env.set(StorageService, new StorageService(this.#env, () => this.storage));
            await this.#setupServer();
        } catch (error) {
            // Catch and log error, else the test framework hides issues here
            log.error(error);
            log.error((error as Error).stack);
            throw error;
        }
        log.directive(`======> ${this.appName}: Setup done`);
    }

    async restore(snapshot: {}) {
        if (this.#node) {
            throw new InternalError("Already initialized");
        }

        CloneableStorage.assert(snapshot);
        this.storage = await snapshot.clone();

        await this.#setupServer();
    }

    async start() {
        if (!this.#node) {
            throw new InternalError("Started without initialization");
        }

        /*
        const env = Environment.default;
        env.vars.set("mdns.networkInterface", "en0");
         */
        try {
            await this.#node.start();
            const { qrPairingCode } = this.#node.state.commissioning.pairingCodes;
            // Magic logging chip testing waits for
            log.directive(`SetupQRCode: [${qrPairingCode}]`);
            log.directive();
            // Magic logging chip testing waits for
            log.directive("mDNS service published:");
            log.directive();

            log.directive(`======> ${this.appName}: Instance started`);
        } catch (error) {
            // Catch and log error, else the test framework hides issues here
            log.error(error);
        }
        log.directive("=====>>> STARTED");
    }

    /** Stop the test instance MatterServer and the device. */
    override async stop() {
        await super.stop();
        if (this.#node) {
            await this.#node.close();
            this.#node = undefined;
        }
    }

    override async close() {
        await this.stop();

        log.directive(`======> ${this.appName}: Instance stopped`);
    }

    async snapshot() {
        CloneableStorage.assert(this.storage);
        return this.storage.clone();
    }

    override async backchannel(command: BackchannelCommand) {
        switch (command.name) {
            case "reboot":
                await this.close();
                await this.initialize();

                // Some tests (BINFO_2_2 at least) are unhappy if events persist
                await this.node.env.get(OccurrenceManager).clear();

                await this.start();
                break;

            case "factoryReset":
                await this.node.erase();
                break;

            case "stop":
                await this.close();

                // DiscoveryTest.yaml fails if we don't give MDNS a bit of time to propagate.  Kind of blows having to
                // handle this way but haven't come up with a better idea other than injecting a PICS so we can disable
                // "Check Instance Name" step.  Restarting Avahi might work but depends on how CHIP handles Avahi
                // messages and would kill part of the value of the test
                if (chip.activeTest.name === "Discovery") {
                    await Time.sleep("wait for MDNS", Seconds(3));
                }

                break;

            case "start":
                await this.initialize();
                await this.start();
                break;

            default:
                await super.backchannel(command);
                break;
        }
    }

    static nodeOf(subject: Subject) {
        const node = (subject as { node?: Node }).node;

        if (node instanceof Node) {
            return node;
        }

        throw new ImplementationError("Cannot extract node from non-node test instance");
    }
}
