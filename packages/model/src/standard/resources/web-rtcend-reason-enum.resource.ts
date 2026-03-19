/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "WebRTCEndReasonEnum", xref: "cluster§11.4.5.2",

    children: [
        { tag: "field", name: "IceFailed", description: "No media connection could be established to the other party" },
        {
            tag: "field", name: "IceTimeout",
            description: "The call timed out whilst waiting for ICE candidate gathering to complete"
        },
        { tag: "field", name: "UserHangup", description: "The user chose to end the call" },
        { tag: "field", name: "UserBusy", description: "The remote party is busy" },
        { tag: "field", name: "Replaced", description: "The call was replaced by another call" },
        {
            tag: "field", name: "NoUserMedia",
            description: "An error code when there is no local mic/camera to use. This may be because the hardware isn’t plugged in, or the user has explicitly denied access"
        },
        {
            tag: "field", name: "InviteTimeout",
            description: "The call timed out whilst waiting for the offer/answer step to complete"
        },
        { tag: "field", name: "AnsweredElsewhere", description: "The call was answered from a different device" },
        {
            tag: "field", name: "OutOfResources",
            description: "The was unable to continue due to not enough resources or available streams"
        },
        { tag: "field", name: "MediaTimeout", description: "The call ended due to a media timeout" },
        { tag: "field", name: "LowPower", description: "The call ended due to hitting a low power condition" },
        {
            tag: "field", name: "PrivacyMode",
            description: "The call ended due to the camera being set into a privacy mode."
        },
        { tag: "field", name: "UnknownReason", description: "Unknown or unspecified reason" }
    ]
});
