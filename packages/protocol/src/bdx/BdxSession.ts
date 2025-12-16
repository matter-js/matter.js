/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncObservable, ClassExtends, Diagnostic, Logger, Observable } from "#general";
import { SecureSession } from "#session/SecureSession.js";
import { BdxMessageType, BdxStatusCode } from "#types";
import { bdxSessionInitiator } from "./bdx-session-initiator.js";
import { BdxError } from "./BdxError.js";
import { BdxMessenger } from "./BdxMessenger.js";
import { BdxSessionConfiguration } from "./BdxSessionConfiguration.js";
import { DrivenSendingFlow } from "./flow/DrivenSendingFlow.js";
import { DrivingReceivingFlow } from "./flow/DrivingReceivingFlow.js";
import { Flow } from "./flow/Flow.js";
import { FollowingReceivingFlow } from "./flow/FollowingReceivingFlow.js";
import { FollowingSendingFlow } from "./flow/FollowingSendingFlow.js";
import { PersistedFileDesignator } from "./PersistedFileDesignator.js";

const logger = Logger.get("BdxSession");

/**
 * Class to manage one BDX session.
 *
 * Matter BDX protocol is used to transfer files between devices.
 *
 * Notes:
 * * Even though Matter allows 64bit values for size and offset, we do not use them, as they make no sense for now.
 *   We support up to MAX_SAFE_INTEGER for size and offset (which basically is 2^53 - 1 and so far enough for us).
 * * We support partial transfers (startOffset or shorter dataLength) only when we act as the sender. As a receiver,
 *   only full transfers are supported.
 * * We do not use BlockQueryWithSkip when requesting data ourselves
 */
export class BdxSession {
    #messenger: BdxMessenger;
    #started = false;
    #closed = AsyncObservable();
    #isClosed = false;
    #config: BdxSessionConfiguration;
    #transferFlow?: Flow;
    #progressInfo = Observable<[bytesTransferred: number, totalBytesLength: number | undefined]>();
    #progressFinished = Observable<[totalBytesTransferred: number]>();

    /** Initializes a BdxSession as a sender, means that we upload data to the peer. */
    static asSender(messenger: BdxMessenger, options: BdxSessionConfiguration.SenderInitiatorOptions): BdxSession {
        return new BdxSession(messenger, { isSender: true, ...options });
    }

    /** Initializes a BdxSession as a receiver, means that we download data from the peer. */
    static asReceiver(messenger: BdxMessenger, options: BdxSessionConfiguration.InitiatorOptions): BdxSession {
        return new BdxSession(messenger, { isSender: false, ...options });
    }

    /** Initializes a BdxSession from an incoming *Init message. The message determines the direction of the transfer. */
    static fromMessage(
        storage: StorageContext,
        messenger: BdxMessenger,
        options: BdxSessionConfiguration.ReceiverOptions,
    ): BdxSession {
        const { initMessageType, initMessage } = options;
        if (initMessageType !== BdxMessageType.SendInit && initMessageType !== BdxMessageType.ReceiveInit) {
            throw new BdxError(
                `Invalid message type for BDX session initialization: ${BdxMessageType[initMessageType]} (${initMessageType})`,
                BdxStatusCode.UnexpectedMessage,
            );
        }

        const { fileDesignator } = initMessage;

        return new BdxSession(messenger, {
            isSender: initMessageType === BdxMessageType.ReceiveInit,
            fileDesignator: new PersistedFileDesignator(fileDesignator, storage),
            ...options,
        });
    }

    private constructor(messenger: BdxMessenger, options: BdxSessionConfiguration.Options) {
        this.#messenger = messenger;

        this.#config = new BdxSessionConfiguration(options);

        const exchange = messenger.exchange;
        if (!exchange.channel.isReliable) {
            throw new BdxError("Bdx Protocol requires a reliable channel for message exchange");
        }
        exchange.closed.on(async () => {
            logger.debug(`Closing BDX session for exchange ${exchange.id}`);
            await this.close();
        });
    }

    get progressInfo() {
        return this.#progressInfo;
    }

    get progressFinished() {
        return this.#progressFinished;
    }

    /** Method called to start the session. It will end with a successful Transfer or with an error */
    async processTransfer() {
        if (this.#started) {
            throw new BdxError("BDX session already started", BdxStatusCode.UnexpectedMessage);
        }
        if (this.#isClosed) {
            throw new BdxError("BDX session already closed", BdxStatusCode.UnexpectedMessage);
        }

        const { isSender, isInitiator, fileDesignator } = this.#config;
        logger.info(
            `Starting BDX session`,
            Diagnostic.dict({
                exId: this.#messenger.exchange.id,
                isSender,
                isInitiator,
                blobName: fileDesignator?.text,
            }),
        );

        this.#started = true;
        try {
            this.#transferFlow = this.#initializeFlow(await bdxSessionInitiator(this.#messenger, this.#config));
            this.#transferFlow.progressInfo.on((bytesTransferred, totalBytesLength) =>
                this.#progressInfo.emit(bytesTransferred, totalBytesLength),
            );
            this.#transferFlow.progressFinished.on(totalBytesTransferred =>
                this.#progressFinished.emit(totalBytesTransferred),
            );

            await this.#transferFlow.processTransfer();

            await this.close();
        } catch (error) {
            BdxError.accept(error);
            await this.#messenger.sendError(error.code);

            logger.warn(`BDX session failed with error:`, error);

            await this.close(error);

            error.bytesTransferred = this.#transferFlow?.transferredBytes ?? 0;
            error.totalBytesLength = this.#transferFlow?.dataLength;
            throw error;
        }
    }

    #initializeFlow(transferParameters: Flow.TransferOptions): Flow {
        const { transferMode, asynchronousTransfer, dataLength, isDriver, fileDesignator } = transferParameters;
        const isSenderDrive = transferMode === Flow.DriverMode.SenderDrive;

        const role = `${isSenderDrive ? `${asynchronousTransfer ? "async " : ""}sending` : "receiving"} ${isDriver ? "driver" : "follower"}`;
        logger.debug(
            `Starting transfer flow as ${role}`,
            Diagnostic.dict({
                exId: this.#messenger.exchange.id,
                dataLength,
                blobName: fileDesignator.text,
            }),
        );

        let FlowImpl: ClassExtends<Flow>;
        if (isDriver) {
            if (isSenderDrive || asynchronousTransfer) {
                FlowImpl = DrivenSendingFlow;
            } else {
                FlowImpl = DrivingReceivingFlow;
            }
        } else if (isSenderDrive || asynchronousTransfer) {
            FlowImpl = FollowingSendingFlow;
        } else {
            FlowImpl = FollowingReceivingFlow;
        }

        return new FlowImpl(this.#messenger, transferParameters);
    }

    get closed() {
        return this.#closed;
    }

    async close(error?: unknown) {
        if (this.#isClosed) {
            return;
        }
        this.#isClosed = true;
        await this.#transferFlow?.close(error);
        await this.#closed.emit();
    }
}

export namespace BdxSession {}
