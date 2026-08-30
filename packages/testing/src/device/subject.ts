/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PicsFile } from "../chip/pics/file.js";
import { BackchannelCommand } from "./backchannel.js";

/**
 * The test subject.
 */
export interface Subject {
    id: string;
    app: string;
    commissioning: Subject.CommissioningParameters;
    pics: PicsFile;
    initialize(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    close(): Promise<void>;
    snapshot(): Promise<{}>;
    restore(snapshot: {}): Promise<void>;
    backchannel(command: BackchannelCommand): Promise<void>;
}

export namespace Subject {
    /**
     * Producer for test subjects.
     *
     * Subjects are cached per (factory, domain, appArgs). A factory may be invoked multiple times if the subject
     * initializes differently for different test implementations (e.g. chip multi-run tests with distinct app-args).
     */
    export interface Factory {
        (domain: string, options?: Subject.Options): Subject;
        pics?: PicsFile;
    }

    /**
     * Per-invocation overrides for a {@link Subject.Factory}. Used to forward chip header `app-args:` into the
     * in-process subject without going through process.argv.
     */
    export interface Options {
        appArgs?: string[];

        /**
         * Overrides the onboarding identity and operational port this subject would otherwise take
         * from its flavor's defaults.
         *
         * Every flavor defaults to discriminator 3840 / passcode 20202021 / port 5540, which is what
         * a single-subject run wants and what two subjects in one run cannot share: mDNS discovery
         * here matches on the long discriminator alone, and two chip apps contend for the port. A
         * run with more than one subject assigns each its own.
         */
        identity?: Identity;
    }

    /** See {@link Options.identity}. */
    export interface Identity {
        discriminator: number;
        passcode: number;

        /** Operational port. Ignored by a flavor that does not bind one of its own. */
        port?: number;
    }

    export type CommissioningMethod = "onnetwork";

    export interface WifiNetwork {
        kind: "wifi";
        ssid: string;
        password: string;
    }

    export interface ThreadNetwork {
        kind: "thread";
        datasetHex: string;
    }

    /**
     * Subject commissioning details.
     */
    export interface CommissioningParameters {
        kind: "on-network" | "ble-wifi" | "ble-thread";
        passcode: number;
        discriminator: number;
        qrPairingCode: string;
        network?: WifiNetwork | ThreadNetwork;
    }
}
