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
     * We cache subjects based on the subject factory although a factory may be invoked multiple times if the subject
     * initializes differently for different test implementations.
     */
    export interface Factory {
        (domain: string): Subject;
        pics?: PicsFile;
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
