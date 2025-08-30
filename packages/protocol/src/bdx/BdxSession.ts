/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BdxDrivenSendingTransferFlow } from "#bdx/flow/BdxDrivenSendingTransferFlow.js";
import { BdxDrivingReceivingTransferFlow } from "#bdx/flow/BdxDrivingReceivingTransferFlow.js";
import { BdxFollowingReceivingTransferFlow } from "#bdx/flow/BdxFollowingReceivingTransferFlow.js";
import { BdxFollowingSendingTransferFlow } from "#bdx/flow/BdxFollowingSendingTransferFlow.js";
import { AsyncObservable, Diagnostic, ImplementationError, InternalError, Logger, StorageContext } from "#general";
import { BdxMessageTypes, BdxStatusCode, TypeFromPartialBitSchema } from "#types";
import { BdxError } from "./BdxError.js";
import { BdxMessenger } from "./BdxMessenger.js";
import { FileDesignator } from "./FileDesignator.js";
import { BdxTransferFlow } from "./flow/BdxTransferFlow.js";
import { BdxReceiveAccept, BdxSendAccept } from "./schema/BdxAcceptMessagesSchema.js";
import { BDX_VERSION, BdxInit, BdxTransferControlBitmap } from "./schema/BdxInitMessagesSchema.js";

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
    #storage: StorageContext;
    #messenger: BdxMessenger;
    #isSender: boolean;
    #isInitiator: boolean;
    #initMessage?: BdxInit;
    #started = false;
    #closed = AsyncObservable();
    #isClosed = false;

    /** Configuration for transfer behavior */
    #bdxConfig: BdxSession.Config = {
        preferredDriverModes: [
            BdxTransferFlow.DriverMode.SenderDrive, // Default if multiple is supported, so lets use this
            BdxTransferFlow.DriverMode.ReceiverDrive,
        ],
        asynchronousTransferAllowed: false,
        maxTransferSize: 1_024 * 100_000, // 100 MB, lets use that as maximum transfer filesize for now just to protect
    };

    #negotiatedTransferParameters?: BdxTransferFlow.TransferOptions;
    #isDriver?: boolean;
    #fileDesignator?: FileDesignator;
    #blobToSend?: Blob;
    #transferFlow?: BdxTransferFlow;

    /** Initializes a BdxSession as a sender, means that we upload data to the peer. */
    static asSender(
        storage: StorageContext,
        messenger: BdxMessenger,
        options: BdxSession.SenderInitiatorOptions,
    ): BdxSession {
        return new BdxSession(storage, messenger, { isSender: true, ...options });
    }

    /** Initializes a BdxSession as a receiver, means that we download data from the peer. */
    static asReceiver(
        storage: StorageContext,
        messenger: BdxMessenger,
        options: BdxSession.InitiatorOptions,
    ): BdxSession {
        return new BdxSession(storage, messenger, { isSender: false, ...options });
    }

    /** Initializes a BdxSession from an incoming *Init message. The message determines the direction of the transfer. */
    static fromMessage(
        storage: StorageContext,
        messenger: BdxMessenger,
        options: BdxSession.ReceiverOptions,
    ): BdxSession {
        const { initMessageType } = options;
        if (initMessageType !== BdxMessageTypes.SendInit && initMessageType !== BdxMessageTypes.ReceiveInit) {
            throw new BdxError(
                `Invalid message type for BDX session initialization: ${BdxMessageTypes[initMessageType]} (${initMessageType})`,
                BdxStatusCode.UnexpectedMessage,
            );
        }
        return new BdxSession(storage, messenger, {
            isSender: initMessageType === BdxMessageTypes.ReceiveInit,
            ...options,
        });
    }

    private constructor(storage: StorageContext, messenger: BdxMessenger, options: BdxSession.Options) {
        this.#storage = storage;
        this.#messenger = messenger;
        const { isSender, fileDesignator, initMessage } = options;
        this.#fileDesignator = fileDesignator;
        this.#isSender = isSender;
        this.#initMessage = initMessage;
        this.#isInitiator = !initMessage;
        this.#bdxConfig = { ...this.#bdxConfig, ...options };

        // Validate Config
        const {
            preferredDriverModes = [],
            maxBlockSize,
            maxTransferSize,
            asynchronousTransferAllowed,
            senderStartOffset,
            senderMaxLength,
        } = this.#bdxConfig;
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

        const exchange = messenger.exchange;
        if (!exchange.channel.isReliable) {
            throw new BdxError("Bdx Protocol requires a reliable channel for message exchange");
        }
        exchange.closed.on(async () => {
            logger.debug(`Closing BDX session for exchange ${exchange.id}`);
            await this.close();
        });
    }

    get #transferParameters() {
        if (this.#negotiatedTransferParameters === undefined) {
            throw new ImplementationError(
                "Can not access negotiated transfer parameters before Accept message was received.",
            );
        }
        return this.#negotiatedTransferParameters;
    }

    /** Method called to start the session. It will end with a successful Transfer or with an error */
    async processTransfer() {
        if (this.#started) {
            throw new BdxError("BDX session already started", BdxStatusCode.UnexpectedMessage);
        }
        if (this.#isClosed) {
            throw new BdxError("BDX session already closed", BdxStatusCode.UnexpectedMessage);
        }

        logger.info(
            `Starting BDX session`,
            Diagnostic.dict({
                exId: this.#messenger.exchange.id,
                isSender: this.#isSender,
                isInitiator: this.#isInitiator,
                blobName: this.#fileDesignator?.text,
            }),
        );

        this.#started = true;
        try {
            if (this.#isInitiator) {
                if (this.#isSender) {
                    await this.#startAsSender();
                } else {
                    await this.#startAsReceiver();
                }
            } else {
                if (this.#initMessage === undefined) {
                    throw new InternalError("Initial message must be set for non-initiator BDX session");
                }

                await this.#startFromInitialMessage(this.#initMessage);
            }
            await this.close();
        } catch (error) {
            BdxError.accept(error);
            await this.#messenger.sendError(error.code);

            logger.warn(`BDX session failed with error:`, error);

            await this.close(error);
            throw error;
        }
    }

    get blobName() {
        if (this.#fileDesignator === undefined) {
            throw new InternalError("File designator must be set before accessing blob name");
        }
        return this.#fileDesignator.text;
    }

    /** These are the proposed data that we send out to the peer device which include anything we can support */
    #buildInitMessage(fileDesignator: FileDesignator, maxLength?: number): BdxInit {
        let startOffset: number | undefined;
        if (maxLength !== undefined) {
            if (this.#bdxConfig.senderStartOffset !== undefined) {
                if (maxLength <= this.#bdxConfig.senderStartOffset) {
                    throw new ImplementationError(
                        `Available data of ${maxLength}bytes are smaller than senderStartOffset ${this.#bdxConfig.senderStartOffset}bytes`,
                    );
                }
                startOffset = this.#bdxConfig.senderStartOffset;
                maxLength -= startOffset; // maxLength is the full file size we have, so substract the start offset
            }
            if (this.#bdxConfig.maxTransferSize !== undefined) {
                if (maxLength > this.#bdxConfig.maxTransferSize) {
                    throw new ImplementationError(
                        `Requested maxLength ${maxLength}bytes exceeds maximum transfer size ${this.#bdxConfig.maxTransferSize}bytes`,
                    );
                }
            }
            if (this.#bdxConfig.senderMaxLength !== undefined) {
                if (maxLength >= this.#bdxConfig.senderMaxLength) {
                    maxLength = this.#bdxConfig.senderMaxLength;
                } else {
                    logger.info(
                        `Ignoring requested senderMaxLength ${this.#bdxConfig.senderMaxLength}bytes as it is larger then the relevant payload size of ${maxLength}bytes`,
                    );
                }
            }
        }

        let maxBlockSize = this.#messenger.maxPayloadSize - 4; // 4 bytes for the block counter by default
        if (this.#bdxConfig.maxBlockSize !== undefined) {
            if (maxBlockSize > this.#bdxConfig.maxBlockSize) {
                maxBlockSize = this.#bdxConfig.maxBlockSize;
            } else {
                logger.info(
                    `Ignoring requested maxBlockSize ${this.#bdxConfig.maxBlockSize}, as it is larger then the transport max payload size ${maxBlockSize}bytes`,
                );
            }
        }

        return {
            transferProtocol: {
                version: BDX_VERSION,
                senderDrive: !!this.#bdxConfig.preferredDriverModes?.includes(BdxTransferFlow.DriverMode.SenderDrive),
                receiverDrive: !!this.#bdxConfig.preferredDriverModes?.includes(
                    BdxTransferFlow.DriverMode.ReceiverDrive,
                ),
                asynchronousTransfer: this.#bdxConfig.asynchronousTransferAllowed, // always false for now
            },
            maxBlockSize,
            fileDesignator: fileDesignator.bytes,
            startOffset,
            maxLength,
        };
    }

    /** Initialize and start the transfer from an *Init message */
    async #startFromInitialMessage(initMessage: BdxInit) {
        logger.debug(`Handling BDX ${this.#isSender ? "ReceiveInit" : "SendInit"} from incoming Message`, initMessage);
        await this.#handleInitMessage(initMessage);

        await this.#processTransferFlow();
    }

    /** Initialize and start the transfer as (proposed) Sender. */
    async #startAsSender() {
        // Open the blob we plan to send to include the expected filesize into the *Init message
        if (this.#fileDesignator === undefined) {
            throw new InternalError("File designator must be set before starting as sender");
        }
        const blobName = this.blobName;
        if (!this.#storage.has(blobName)) {
            throw new ImplementationError("File designator must point to an existing file in the storage");
        }
        const blob = (this.#blobToSend = await this.#storage.openBlob(blobName));

        const initMessage = this.#buildInitMessage(this.#fileDesignator, blob.size);
        const acceptMessage = await this.#messenger.sendSendInit(initMessage);
        this.#storeAcceptParameters(
            acceptMessage,
            initMessage.startOffset !== undefined ? Number(initMessage.startOffset) : undefined,
            initMessage.maxLength !== undefined ? Number(initMessage.maxLength) : undefined,
        ); // We built it, so it is a number

        await this.#processTransferFlow();
    }

    /** Initialize and start the transfer as (proposed) Receiver. */
    async #startAsReceiver() {
        if (this.#fileDesignator === undefined) {
            throw new ImplementationError("File designator must be set before starting as sender");
        }

        const acceptMessage = await this.#messenger.sendReceiveInit(this.#buildInitMessage(this.#fileDesignator));
        this.#storeAcceptParameters(acceptMessage);

        await this.#processTransferFlow();
    }

    /**
     * Stores the negotiated details from the *Accept message into the Transfer parameters.
     * Also determines by the response if we are the driver or the peer.
     */
    #storeAcceptParameters(acceptMessage: BdxSendAccept | BdxReceiveAccept, startOffset = 0, maxLength?: number) {
        if (this.#negotiatedTransferParameters !== undefined) {
            throw new ImplementationError("Can not set negotiated transfer parameters again");
        }
        const {
            transferControl: { senderDrive, asynchronousTransfer },
            maxBlockSize,
        } = acceptMessage;
        if (asynchronousTransfer) {
            // Async is not supported by matter SDK and such, so always decline this for now
            throw new BdxError(
                "Asynchronous transfer is not supported in this implementation",
                BdxStatusCode.TransferMethodNotSupported,
            );
        }

        const dataLength =
            "length" in acceptMessage && acceptMessage.length !== undefined
                ? this.#messenger.asNumber(
                      acceptMessage.length,
                      "Accept message length field",
                      BdxStatusCode.LengthTooLarge,
                  )
                : maxLength;

        this.#negotiatedTransferParameters = {
            transferMode: senderDrive
                ? BdxTransferFlow.DriverMode.SenderDrive
                : BdxTransferFlow.DriverMode.ReceiverDrive,
            asynchronousTransfer: false, // always false for now
            dataLength,
            startOffset,
            blockSize: maxBlockSize,
        };

        this.#isDriver = (this.#isSender && senderDrive) || (!this.#isSender && !senderDrive);

        logger.debug(
            `${this.#isDriver ? "We are" : "Peer is"} driving-${this.#isSender ? "sender" : "receiver"} with negotiated transfer parameters`,
            this.#negotiatedTransferParameters,
        );
    }

    /** Determine *Accept response parameters from an *Init message */
    async #determineAcceptParameters(initMessage: BdxInit): Promise<BdxReceiveAccept | BdxSendAccept> {
        const { transferProtocol, maxLength: initMaxLength = 0, startOffset: initStartOffset = 0 } = initMessage;
        let { maxBlockSize } = initMessage;

        // We use the first matching mode between the offered and preferred modes
        let finalDriverMode: BdxTransferFlow.DriverMode | undefined;
        for (const mode of this.#bdxConfig.preferredDriverModes!) {
            if (transferProtocol[mode]) {
                finalDriverMode = mode;
                break;
            }
        }
        if (finalDriverMode === undefined) {
            throw new BdxError("Can not determine a valid transfer mode", BdxStatusCode.TransferMethodNotSupported);
        }

        if (this.#bdxConfig.maxBlockSize !== undefined && maxBlockSize > this.#bdxConfig.maxBlockSize) {
            maxBlockSize = this.#bdxConfig.maxBlockSize;
        }

        const startOffset = this.#messenger.asNumber(
            initStartOffset,
            "Start offset",
            BdxStatusCode.StartOffsetNotSupported,
        );
        const maxLength = this.#messenger.asNumber(initMaxLength, "Max length", BdxStatusCode.LengthTooLarge);

        let length: number | undefined = undefined;
        if (maxLength > 0) {
            if (this.#isSender) {
                // If we received an Init message with a maxLength and we are the sender, we need to check if the
                // available blob size is enough to send the requested maxLength.
                const blobName = this.blobName;
                const blob = await this.#storage.openBlob(blobName);
                const availableSize = blob.size - (startOffset ?? 0);
                if (maxLength > availableSize) {
                    throw new BdxError(
                        `Requested maxLength ${maxLength}${startOffset ? ` with startOffset ${startOffset}` : ""} exceeds available size ${blob.size} for blob ${blobName}`,
                        BdxStatusCode.LengthTooLarge,
                    );
                }
            }
            length = maxLength;
        }

        // TODO: How to handle custom metadata?

        const transferControl: TypeFromPartialBitSchema<typeof BdxTransferControlBitmap> = {
            version: BDX_VERSION, // We support the minimum version, so no need for further checks
            [finalDriverMode]: true, // this sets either senderDrive or receiveDriver property
            asynchronousTransfer: false, // Not supported so ignore if it was received
        };
        return {
            transferControl,
            maxBlockSize,
            length,
        };
    }

    /** Handles an *Init message, determines the response *AcceptMessage and send it. */
    async #handleInitMessage(initMessage: BdxInit) {
        const { fileDesignator } = initMessage;
        this.#fileDesignator = new FileDesignator(fileDesignator);

        if (this.#isSender) {
            let { startOffset, maxLength } = initMessage;
            if (startOffset !== undefined) {
                startOffset = this.#messenger.asNumber(
                    startOffset,
                    "Start offset",
                    BdxStatusCode.StartOffsetNotSupported,
                );
            }
            if (maxLength !== undefined) {
                maxLength = this.#messenger.asNumber(maxLength, "Max length", BdxStatusCode.LengthTooLarge);
            }

            const blobName = this.blobName;
            if (!this.#storage.has(blobName)) {
                throw new BdxError(
                    "File designator must point to an existing file in the storage",
                    BdxStatusCode.FileDesignatorUnknown,
                );
            }
            this.#blobToSend = await this.#storage.openBlob(blobName);

            const acceptMessage = await this.#determineAcceptParameters(initMessage);
            await this.#messenger.sendReceiveAccept(acceptMessage);
            this.#storeAcceptParameters(acceptMessage, startOffset, maxLength);
        } else {
            const acceptMessage = {
                ...(await this.#determineAcceptParameters(initMessage)),
                length: undefined, // Length is not included in SendAccept, so take out to not confuse in logs
            };
            await this.#messenger.sendSendAccept(acceptMessage);
            this.#storeAcceptParameters(acceptMessage);
        }
    }

    /**
     * Implements the main file transfer data transfer flow.
     * For this it created the appropriate transfer flow class and initiates the transfer.
     */
    async #processTransferFlow() {
        const { transferMode, asynchronousTransfer, dataLength } = this.#transferParameters;
        const isSenderDrive = transferMode === BdxTransferFlow.DriverMode.SenderDrive;

        const role = `${isSenderDrive ? `${asynchronousTransfer ? "async " : ""}sending` : "receiving"} ${this.#isDriver ? "driver" : "follower"}`;
        logger.debug(
            `Starting transfer flow as ${role}`,
            Diagnostic.dict({
                exId: this.#messenger.exchange.id,
                dataLength,
                blobName: this.blobName,
            }),
        );

        let flow: BdxTransferFlow;
        if (this.#isDriver) {
            if (isSenderDrive || asynchronousTransfer) {
                if (this.#blobToSend === undefined) {
                    throw new InternalError("Blob to send must be set before starting as driver");
                }
                flow = new BdxDrivenSendingTransferFlow(this.#blobToSend, this.#messenger, this.#transferParameters);
            } else {
                flow = new BdxDrivingReceivingTransferFlow(
                    this.#storage,
                    this.blobName,
                    this.#messenger,
                    this.#transferParameters,
                );
            }
        } else {
            if (isSenderDrive || asynchronousTransfer) {
                flow = new BdxFollowingSendingTransferFlow(
                    this.#storage,
                    this.blobName,
                    this.#messenger,
                    this.#transferParameters,
                );
            } else {
                if (this.#blobToSend === undefined) {
                    throw new InternalError("Blob to send must be set before starting as driver");
                }
                flow = new BdxFollowingReceivingTransferFlow(
                    this.#blobToSend,
                    this.#messenger,
                    this.#transferParameters,
                );
            }
        }
        this.#transferFlow = flow;
        await flow.processTransfer();
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

export namespace BdxSession {
    export interface Config {
        /**
         * Array of preferred transfer driver modes, in order of preference. Use this to configure the proposed behavior.
         * Default is [SenderDrive, ReceiverDrive]
         */
        preferredDriverModes?: BdxTransferFlow.DriverMode[];

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

    export interface InitiatorOptions extends Config {
        /** FileDesignator to use for the session. The value is usually pre-determined with the peer. */
        fileDesignator: FileDesignator;
    }

    export interface SenderInitiatorOptions extends InitiatorOptions {
        /** The start offset of the data to send. When using this, you need to know what you are doing. */
        senderStartOffset?: number;

        /** The maximum length of the data to send. When using this, you need to know what you are doing. */
        senderMaxLength?: number;
    }

    export interface ReceiverOptions extends Config {
        initMessageType: BdxMessageTypes;
        initMessage: BdxInit; // The initial message received to start the session
    }

    export interface Options extends Config {
        /** True if the session is initiated as a sender, false for receiver */
        isSender: boolean;

        /** Optional file designator to use for the session */
        fileDesignator?: FileDesignator;

        /** The initial message received to start the session */
        initMessage?: BdxInit;
    }
}
