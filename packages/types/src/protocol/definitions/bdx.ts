/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export const BDX_PROTOCOL_ID = 2;

export enum BdxMessageType {
    SendInit = 0x01,
    SendAccept = 0x02,
    ReceiveInit = 0x04,
    ReceiveAccept = 0x05,
    BlockQuery = 0x10,
    Block = 0x11,
    BlockEof = 0x12,
    BlockAck = 0x13,
    BlockAckEof = 0x14,
    BlockQueryWithSkip = 0x15,
}

export enum BdxStatusCode {
    /**
     * Success.
     */
    Success = 0x00,

    /**
     * Definite length too large to support.
     * For example, trying to SendInit with too large of a file.
     */
    LengthTooLarge = 0x12,

    /**
     * Definite length proposed for transfer is too short for the context based on the responder’s knowledge of
     * expected size.
     */
    LengthTooShort = 0x13,

    /**
     * Pre-negotiated size of transfer was not fulfilled prior to BlockAckEOF.
     */
    LengthMismatch = 0x14,

    /**
     * Responder can only support proposed transfer if definite length is provided.
     */
    LengthRequired = 0x15,

    /**
     * Received a malformed protocol message.
     */
    BadMessageContent = 0x16,

    /**
     * Received block counter out of order from expectation.
     */
    BadBlockCounter = 0x17,

    /**
     * Received a well-formed message that was contextually inappropriate for the current state of the transfer.
     */
    UnexpectedMessage = 0x18,

    /**
     * Responder is too busy to proceed with a new transfer at this moment.
     */
    ResponderBusy = 0x19,

    /**
     * Other error occurred, such as perhaps an input/output error occurring at one of the peers.
     */
    TransferFailedUnknownError = 0x1f,

    /**
     * Received a message that mismatches the current transfer mode.
     */
    TransferMethodNotSupported = 0x50,

    /**
     * Attempted to request a file whose designator is unknown to the responder.
     */
    FileDesignatorUnknown = 0x51,

    /**
     * Proposed transfer with explicit start offset is not supported in current context.
     */
    StartOffsetNotSupported = 0x52,

    /**
     * Could not find a common supported version between initiator and responder.
     */
    VersionNotSupported = 0x53,

    /**
     * Other unexpected error.
     */
    Unknown = 0x5f,

    /**
     * No additional error details available.
     */
    GeneralError = 0xffff,
}
