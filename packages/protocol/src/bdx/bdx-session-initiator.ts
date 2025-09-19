/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, InternalError, Logger } from "#general";
import { BdxStatusCode, TypeFromPartialBitSchema } from "#types";
import { BdxError } from "./BdxError.js";
import { BdxMessenger } from "./BdxMessenger.js";
import { BdxSessionConfiguration } from "./BdxSessionConfiguration.js";
import { Flow } from "./flow/Flow.js";
import { BdxReceiveAccept, BdxSendAccept } from "./schema/BdxAcceptMessagesSchema.js";
import { BDX_VERSION, BdxInit, BdxTransferControlBitmap } from "./schema/BdxInitMessagesSchema.js";

const logger = Logger.get("bdxSessionInitiator");

/**
 * Handles the initiation of a BDX session by exchanging *Init and *Accept messages and negotiating the transfer
 * parameters.
 */
export async function bdxSessionInitiator(messenger: BdxMessenger, config: BdxSessionConfiguration) {
    if (config.isInitiator) {
        if (config.isSender) {
            // We are Sender and Initiator
            const initMessage = await buildInitMessage();
            const acceptMessage = await messenger.sendSendInit(initMessage);
            return collectAcceptParameters(
                acceptMessage,
                // We define the data, so we know it are numbers
                initMessage.startOffset !== undefined ? Number(initMessage.startOffset) : undefined,
                initMessage.maxLength !== undefined ? Number(initMessage.maxLength) : undefined,
            );
        }

        // We are Receiver and Initiator
        const acceptMessage = await messenger.sendReceiveInit(await buildInitMessage());
        return collectAcceptParameters(acceptMessage);
    }

    // We are starting from an incoming *Init message
    const initMessage = config.initMessage;
    if (initMessage === undefined) {
        throw new InternalError("Initial message must be set before starting from initial message");
    }
    logger.debug(`Initialize BDX ${config.isSender ? "ReceiveInit" : "SendInit"} from incoming Message`, initMessage);

    if (config.isSender) {
        // We are Sender and Responder
        if (!config.fileDesignator.exists()) {
            throw new BdxError(
                `File designator ${config.fileDesignator.text} does not point to an existing file in the storage to send data`,
                BdxStatusCode.FileDesignatorUnknown,
            );
        }

        let { startOffset } = initMessage;
        if (startOffset !== undefined) {
            startOffset = BdxMessenger.asSafeNumber(startOffset, "Start offset", BdxStatusCode.StartOffsetNotSupported);
        }

        const acceptMessage = await determineAcceptParameters(initMessage);

        const length =
            "length" in acceptMessage && typeof acceptMessage.length === "number" ? acceptMessage.length : undefined;

        // If we received an Init message with a maxLength and we are the sender, we need to check if the
        // available blob size is enough to send the requested maxLength.
        const blobToRead = await config.fileDesignator.openBlob();

        if (length !== undefined && length > 0) {
            const availableSize = blobToRead.size - (startOffset ?? 0);
            if (length > availableSize) {
                throw new BdxError(
                    `Requested maxLength ${length}bytes${startOffset ? ` with startOffset ${startOffset}` : ""} exceeds available size ${blobToRead.size} for blob ${config.fileDesignator.text}`,
                    BdxStatusCode.LengthTooLarge,
                );
            }
        }

        await messenger.sendReceiveAccept(acceptMessage);

        return collectAcceptParameters(acceptMessage, startOffset, length);
    }

    // We are Receiver and Responder
    const acceptMessage = {
        ...(await determineAcceptParameters(initMessage)),
        length: undefined, // Length is not included in SendAccept, so take out to not confuse in logs
    };
    await messenger.sendSendAccept(acceptMessage);
    return collectAcceptParameters(acceptMessage);

    /** These are the proposed data that we send out to the peer device which include anything we can support */
    async function buildInitMessage(): Promise<BdxInit> {
        const {
            senderStartOffset,
            maxTransferSize,
            senderMaxLength,
            preferredDriverModes,
            asynchronousTransferAllowed,
        } = config.transferConfig;
        const { isSender, fileDesignator } = config;

        let startOffset: number | undefined;
        let maxLength: number | undefined;
        if (isSender) {
            maxLength = (await fileDesignator.openBlob()).size;
            if (senderStartOffset !== undefined) {
                if (maxLength <= senderStartOffset) {
                    throw new ImplementationError(
                        `Available data of ${maxLength}bytes are smaller than senderStartOffset ${senderStartOffset}bytes`,
                    );
                }
                startOffset = senderStartOffset;
                maxLength -= startOffset; // maxLength is the full file size we have, so subtract the start offset
            }
            if (maxTransferSize !== undefined) {
                if (maxLength > maxTransferSize) {
                    throw new ImplementationError(
                        `Requested maxLength ${maxLength}bytes exceeds maximum transfer size ${maxTransferSize}bytes`,
                    );
                }
            }
            if (senderMaxLength !== undefined) {
                if (maxLength >= senderMaxLength) {
                    maxLength = senderMaxLength;
                } else {
                    logger.info(
                        `Ignoring requested senderMaxLength ${senderMaxLength}bytes as it is larger then the relevant payload size of ${maxLength}bytes`,
                    );
                }
            }
        }

        let maxBlockSize = messenger.maxPayloadSize - 4; // 4 bytes for the block counter by default
        const requestedBlockSize = config.transferConfig.maxBlockSize;
        if (requestedBlockSize !== undefined) {
            if (maxBlockSize > requestedBlockSize) {
                maxBlockSize = requestedBlockSize;
            } else {
                logger.info(
                    `Ignoring requested maxBlockSize ${requestedBlockSize}, as it is larger then the transport max payload size ${maxBlockSize}bytes`,
                );
            }
        }

        return {
            transferProtocol: {
                version: BDX_VERSION,
                senderDrive: !!preferredDriverModes?.includes(Flow.DriverMode.SenderDrive),
                receiverDrive: !!preferredDriverModes?.includes(Flow.DriverMode.ReceiverDrive),
                asynchronousTransfer: asynchronousTransferAllowed, // always false for now
            },
            maxBlockSize,
            fileDesignator: fileDesignator.bytes,
            startOffset,
            maxLength,
        };
    }

    /** Determine *Accept response parameters from an *Init message */
    async function determineAcceptParameters(initMessage: BdxInit): Promise<BdxReceiveAccept | BdxSendAccept> {
        const { transferProtocol, maxLength: initMaxLength = 0 } = initMessage;
        let { maxBlockSize } = initMessage;

        // We use the first matching mode between the offered and preferred modes
        let finalDriverMode: Flow.DriverMode | undefined;
        for (const mode of config.transferConfig.preferredDriverModes!) {
            if (transferProtocol[mode]) {
                finalDriverMode = mode;
                break;
            }
        }
        if (finalDriverMode === undefined) {
            throw new BdxError("Can not determine a valid transfer mode", BdxStatusCode.TransferMethodNotSupported);
        }

        const requestedMaxBlockSize = config.transferConfig.maxBlockSize;
        if (requestedMaxBlockSize !== undefined && maxBlockSize > requestedMaxBlockSize) {
            maxBlockSize = requestedMaxBlockSize;
        }

        const maxLength = BdxMessenger.asSafeNumber(initMaxLength, "Max length", BdxStatusCode.LengthTooLarge);
        // TODO: How to handle custom metadata?

        const transferControl: TypeFromPartialBitSchema<typeof BdxTransferControlBitmap> = {
            version: BDX_VERSION, // We support the minimum version, so no need for further checks
            [finalDriverMode]: true, // this sets either senderDrive or receiveDriver property
            asynchronousTransfer: false, // Not supported so ignore if it was received
        };
        return {
            transferControl,
            maxBlockSize,
            length: maxLength > 0 ? maxLength : undefined,
        };
    }

    /**
     * Collects the negotiated details from the *Accept message into the Transfer parameters.
     * Also determines by the response if we are the driver or the peer.
     */
    function collectAcceptParameters(
        acceptMessage: BdxSendAccept | BdxReceiveAccept,
        startOffset = 0,
        maxLength?: number,
    ): Flow.TransferOptions {
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
                ? BdxMessenger.asSafeNumber(
                      acceptMessage.length,
                      "Accept message length field",
                      BdxStatusCode.LengthTooLarge,
                  )
                : maxLength;

        const transferParameters: Flow.TransferOptions = {
            transferMode: senderDrive ? Flow.DriverMode.SenderDrive : Flow.DriverMode.ReceiverDrive,
            asynchronousTransfer: false, // always false for now
            dataLength,
            startOffset,
            blockSize: maxBlockSize,
            isDriver: (config.isSender && senderDrive) || (!config.isSender && !senderDrive),
            fileDesignator: config.fileDesignator,
        };

        logger.debug(
            `${transferParameters.isDriver ? "We are" : "Peer is"} driving-${config.isSender ? "sender" : "receiver"} with negotiated transfer parameters`,
            transferParameters,
        );

        return transferParameters;
    }
}
