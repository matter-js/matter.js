/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

/**
 * @see {@link MatterSpecification.v142.Cluster} § 11.4.5.2
 */
export enum WebRtcEndReason {
    /**
     * No media connection could be established to the other party
     */
    IceFailed = 0,

    /**
     * The call timed out whilst waiting for ICE candidate gathering to complete
     */
    IceTimeout = 1,

    /**
     * The user chose to end the call
     */
    UserHangup = 2,

    /**
     * The remote party is busy
     */
    UserBusy = 3,

    /**
     * The call was replaced by another call
     */
    Replaced = 4,

    /**
     * An error code when there is no local mic/camera to use. This may be because the hardware isn’t plugged in, or the
     * user has explicitly denied access
     */
    NoUserMedia = 5,

    /**
     * The call timed out whilst waiting for the offer/answer step to complete
     */
    InviteTimeout = 6,

    /**
     * The call was answered from a different device
     */
    AnsweredElsewhere = 7,

    /**
     * The was unable to continue due to not enough resources or available streams
     */
    OutOfResources = 8,

    /**
     * The call ended due to a media timeout
     */
    MediaTimeout = 9,

    /**
     * The call ended due to hitting a low power condition
     */
    LowPower = 10,

    /**
     * The call ended due to the camera being set into a privacy mode.
     */
    PrivacyMode = 11,

    /**
     * Unknown or unspecified reason
     */
    UnknownReason = 12
}
