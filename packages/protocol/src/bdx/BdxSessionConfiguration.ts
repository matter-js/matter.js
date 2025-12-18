/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FileDesignator } from "#bdx/FileDesignator.js";
import { ImplementationError } from "#general";
import { BdxMessageType } from "#types";
import { Flow } from "./flow/Flow.js";
import { PersistedFileDesignator } from "./PersistedFileDesignator.js";
import { BdxInit } from "./schema/BdxInitMessagesSchema.js";

export class BdxSessionConfiguration {
    #isSender: boolean;
    #initMessage?: BdxInit;
    #transferConfig: BdxSessionConfiguration.Config;
    #fileDesignator: PersistedFileDesignator;
    #transferFileDesignator: FileDesignator;

    constructor(options: BdxSessionConfiguration.Options) {
        const { isSender, fileDesignator, transferFileDesignator, initMessage } = options;
        this.#fileDesignator = fileDesignator;
        this.#transferFileDesignator = transferFileDesignator ?? fileDesignator;
        this.#isSender = isSender;
        this.#initMessage = initMessage;
        this.#transferConfig = { ...BdxSessionConfiguration.DefaultConfig, ...options };

        // Validate Config
        const {
            preferredDriverModes = [],
            maxBlockSize,
            maxTransferSize,
            asynchronousTransferAllowed,
            senderStartOffset,
            senderMaxLength,
        } = this.#transferConfig;
        if (preferredDriverModes.length === 0) {
            throw new ImplementationError("At least one preferred driver mode must be set.");
        }
        if (maxBlockSize !== undefined && maxBlockSize <= 0) {
            throw new ImplementationError("Max block size must be greater than 0");
        }
        if (maxTransferSize !== undefined && maxTransferSize <= 0) {
            throw new ImplementationError("Max transfer size must be greater than 0");
        }
        if (asynchronousTransferAllowed) {
            throw new ImplementationError("Asynchronous transfer is not supported");
        }
        if (!isSender && (senderStartOffset !== undefined || senderMaxLength !== undefined)) {
            throw new ImplementationError("Sender start offset and sender max length are only supported for senders");
        }
    }

    get isSender(): boolean {
        return this.#isSender;
    }

    get initMessage(): BdxInit | undefined {
        return this.#initMessage;
    }

    get isInitiator(): boolean {
        return this.#initMessage === undefined;
    }

    get fileDesignator(): PersistedFileDesignator {
        return this.#fileDesignator;
    }

    get transferFileDesignator(): FileDesignator {
        return this.#transferFileDesignator;
    }

    get transferConfig(): BdxSessionConfiguration.Config {
        return this.#transferConfig;
    }
}

export namespace BdxSessionConfiguration {
    export interface Config {
        /**
         * Array of preferred transfer driver modes, in order of preference. Use this to configure the proposed behavior.
         * Default is [SenderDrive, ReceiverDrive]
         */
        preferredDriverModes?: Flow.DriverMode[];

        /** Asynchronous transfer is not supported right now because provisional. */
        asynchronousTransferAllowed?: false; // not supported right now, so must be false

        /** Maximum block size to use for the session. This value is ignored if the transport only supports smaller blocks. */
        maxBlockSize?: number;

        /** Maximum transfer size to use for the session. Defaults to 100MB */
        maxTransferSize?: number;

        /** The start offset of the data to send. When using this, you need to know what you are doing. */
        senderStartOffset?: number;

        /** The maximum length of the data to send. When using this, you need to know what you are doing. */
        senderMaxLength?: number;
    }

    export const DefaultConfig: BdxSessionConfiguration.Config = {
        preferredDriverModes: [
            Flow.DriverMode.SenderDrive, // Default if multiple is supported, so lets use this
            Flow.DriverMode.ReceiverDrive,
        ],
        asynchronousTransferAllowed: false, // Provisional, not supported
        maxTransferSize: 1_024 * 100_000, // 100 MB, lets use that as maximum transfer filesize for now just to protect
    };

    export interface InitiatorOptions extends BdxSessionConfiguration.Config {
        /** FileDesignator to use for the session. The value is usually pre-determined with the peer. */
        fileDesignator: PersistedFileDesignator;

        /**
         * Optional file designator to use for the transfer. This can be used to separate the file designator used
         * in BDX messages from the persisted file. */
        transferFileDesignator?: FileDesignator;
    }

    export interface SenderInitiatorOptions extends InitiatorOptions {
        /** The start offset of the data to send. When using this, you need to know what you are doing. */
        senderStartOffset?: number;

        /** The maximum length of the data to send. When using this, you need to know what you are doing. */
        senderMaxLength?: number;
    }

    export interface ReceiverOptions extends BdxSessionConfiguration.Config {
        initMessageType: BdxMessageType;
        initMessage: BdxInit; // The initial message received to start the session
        fileDesignator: PersistedFileDesignator;
    }

    export interface Options extends BdxSessionConfiguration.Config {
        /** True if the session is initiated as a sender, false for receiver */
        isSender: boolean;

        /**
         * File designator to use for the session and read from or write to. It points to the persisted blob storage.
         */
        fileDesignator: PersistedFileDesignator;

        /**
         * Optional Transfer FileDesignator to use for the transfer, if different from the fileDesignator. This is
         * mainly useful when receiving data where the fileDesignator used in the BDX messages is defined by the file
         * sender and when the persisted file is stored under a different designator.
         */
        transferFileDesignator?: FileDesignator;

        /** The initial message received to start the session */
        initMessage?: BdxInit;
    }
}
