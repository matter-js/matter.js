/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Protocol ID for secure channels as per Matter specification.
 */
export const SECURE_CHANNEL_PROTOCOL_ID = 0x0000;

export enum SecureMessageType {
    /**
     * The Message Counter Synchronization Request message queries the current message counter from a peer to bootstrap
     * replay protection.
     */
    MsgCounterSyncReq = 0x00,

    /**
     * The Message Counter Synchronization Response message provides the current message counter from a peer to
     * bootstrap replay protection.
     */
    MsgCounterSyncRsp = 0x01,

    /**
     * This message is dedicated for the purpose of sending a stand-alone acknowledgement when there is no other data
     * message available to piggyback an acknowledgement on top of.
     */
    StandaloneAck = 0x10,

    /** The request for PBKDF parameters necessary to complete the PASE protocol. */
    PbkdfParamRequest = 0x20,

    /** The PBKDF parameters sent in response to PBKDFParamRequest during the PASE protocol. */
    PbkdfParamResponse = 0x21,

    /** The first PAKE message of the PASE protocol. */
    PasePake1 = 0x22,

    /** The second PAKE message of the PASE protocol. */
    PasePake2 = 0x23,

    /** The third PAKE message of the PASE protocol. */
    PasePake3 = 0x24,

    /** The first message of the CASE protocol. */
    Sigma1 = 0x30,

    /** The second message of the CASE protocol. */
    Sigma2 = 0x31,

    /** The third message of the CASE protocol. */
    Sigma3 = 0x32,

    /** The second resumption message of the CASE protocol. */
    Sigma2Resume = 0x33,

    /** The Status Report message encodes the result of an operation in the Secure Channel as well as other protocols. */
    StatusReport = 0x40,

    /** The Check-in message notifies a client that the ICD is available for communication. */
    IcdCheckInMessage = 0x50,
}

export enum SecureChannelStatusCode {
    /** Indication that the last session establishment message was successfully processed. */
    Success = 0x0000,

    /** Failure to find a common set of shared roots. */
    NoSharedTrustRoots = 0x0001,

    /** Generic failure during session establishment. */
    InvalidParam = 0x0002,

    /** Indication that the sender will close the current session. See Section “CloseSession” for more details. */
    CloseSession = 0x0003,

    /** Indication that the sender cannot currently fulfill the request. See Section “Busy” for more details. */
    Busy = 0x0004,

    /** Required CAT Mismatch during session establishment at the Sigma2 Validation step. */
    RequiredCatMismatch = 0x0005,

    /**
     * No additional error details available.
     */
    GeneralError = 0xffff,
}

export namespace SecureMessageType {
    export function isStandaloneAck(protocolId: number, messageType: number) {
        return protocolId === SECURE_CHANNEL_PROTOCOL_ID && messageType === SecureMessageType.StandaloneAck;
    }
}
