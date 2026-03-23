/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise } from "@matter/general";
import type { StatusResponseError } from "../common/StatusResponseError.js";
import type { Status as GlobalStatus } from "../globals/Status.js";

/**
 * Definitions for the KeypadInput cluster.
 *
 * This cluster provides an interface for key code based input and control on a device like a Video Player or an
 * endpoint like a Content App. This may include text or action commands such as UP, DOWN, and SELECT.
 *
 * This cluster would be supported on Video Player devices as well as devices that support remote control input from a
 * keypad or remote. This cluster provides the list of supported keypad inputs and provides a command for sending them.
 *
 * The cluster server for Keypad Input is implemented by a device that can receive keypad input, such as a Video Player,
 * or an endpoint that can receive keypad input, such as a Content App.
 *
 * The key codes used are those defined in the HDMI CEC specification (see HDMI).
 *
 * Devices may understand a subset of these key codes. Feature flags are used to indicate a specific subset that is
 * supported. Device may support additional codes beyond what is indicated in feature flags.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 6.8
 */
export declare namespace KeypadInput {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0509;

    /**
     * Textual cluster identifier.
     */
    export const name: "KeypadInput";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the KeypadInput cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link KeypadInput} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * Upon receipt, this shall process a keycode as input to the media endpoint.
         *
         * If a device has multiple media endpoints implementing this cluster, such as a casting video player endpoint
         * with one or more content app endpoints, then only the endpoint receiving the command shall process the
         * keycode as input. In other words, a specific content app endpoint shall NOT process a keycode received by a
         * different content app endpoint.
         *
         * If a second SendKey request with the same KeyCode value is received within 200 ms, then the endpoint will
         * consider the first key press to be a press and hold. When such a repeat KeyCode value is not received within
         * 200 ms, then the endpoint will consider the last key press to be a release.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.8.6.1
         */
        sendKey(request: SendKeyRequest): MaybePromise<SendKeyResponse>;
    }

    /**
     * Commands that may appear in {@link KeypadInput}.
     */
    export interface Commands extends BaseCommands {}

    export type Components = [{ flags: {}, commands: BaseCommands }];
    export type Features = "NavigationKeyCodes" | "LocationKeys" | "NumberKeys";

    /**
     * These are optional features supported by KeypadInputCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.8.4
     */
    export enum Feature {
        /**
         * NavigationKeyCodes (NV)
         *
         * Supports UP, DOWN, LEFT, RIGHT, SELECT, BACK, EXIT, MENU
         */
        NavigationKeyCodes = "NavigationKeyCodes",

        /**
         * LocationKeys (LK)
         *
         * Supports CEC keys 0x0A (Settings) and 0x09 (Home)
         */
        LocationKeys = "LocationKeys",

        /**
         * NumberKeys (NK)
         *
         * Supports numeric input 0..9
         */
        NumberKeys = "NumberKeys"
    }

    /**
     * Upon receipt, this shall process a keycode as input to the media endpoint.
     *
     * If a device has multiple media endpoints implementing this cluster, such as a casting video player endpoint with
     * one or more content app endpoints, then only the endpoint receiving the command shall process the keycode as
     * input. In other words, a specific content app endpoint shall NOT process a keycode received by a different
     * content app endpoint.
     *
     * If a second SendKey request with the same KeyCode value is received within 200 ms, then the endpoint will
     * consider the first key press to be a press and hold. When such a repeat KeyCode value is not received within 200
     * ms, then the endpoint will consider the last key press to be a release.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.8.6.1
     */
    export interface SendKeyRequest {
        /**
         * This field shall indicate the key code to process.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.8.6.1.1
         */
        keyCode: CecKeyCode;
    }

    /**
     * This command shall be generated in response to a SendKey command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.8.6.2
     */
    export interface SendKeyResponse {
        /**
         * This field shall indicate the status of the request.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.8.6.2.1
         */
        status: Status;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.8.5.1
     */
    export enum Status {
        /**
         * Succeeded
         */
        Success = 0,

        /**
         * Key code is not supported.
         */
        UnsupportedKey = 1,

        /**
         * Requested key code is invalid in the context of the responder’s current state.
         */
        InvalidKeyInCurrentState = 2
    }

    /**
     * Thrown for cluster status code {@link Status.UnsupportedKey}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.8.5.1
     */
    export class UnsupportedKeyError extends StatusResponseError {
        constructor(message?: string, code?: GlobalStatus, clusterCode?: number)
    }

    /**
     * Thrown for cluster status code {@link Status.InvalidKeyInCurrentState}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.8.5.1
     */
    export class InvalidKeyInCurrentStateError extends StatusResponseError {
        constructor(message?: string, code?: GlobalStatus, clusterCode?: number)
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.8.5.2
     */
    export enum CecKeyCode {
        Select = 0,
        Up = 1,
        Down = 2,
        Left = 3,
        Right = 4,
        RightUp = 5,
        RightDown = 6,
        LeftUp = 7,
        LeftDown = 8,
        RootMenu = 9,
        SetupMenu = 10,
        ContentsMenu = 11,
        FavoriteMenu = 12,
        Exit = 13,
        MediaTopMenu = 16,
        MediaContextSensitiveMenu = 17,
        NumberEntryMode = 29,
        Number11 = 30,
        Number12 = 31,
        Number0OrNumber10 = 32,
        Numbers1 = 33,
        Numbers2 = 34,
        Numbers3 = 35,
        Numbers4 = 36,
        Numbers5 = 37,
        Numbers6 = 38,
        Numbers7 = 39,
        Numbers8 = 40,
        Numbers9 = 41,
        Dot = 42,
        Enter = 43,
        Clear = 44,
        NextFavorite = 47,
        ChannelUp = 48,
        ChannelDown = 49,
        PreviousChannel = 50,
        SoundSelect = 51,
        InputSelect = 52,
        DisplayInformation = 53,
        Help = 54,
        PageUp = 55,
        PageDown = 56,
        Power = 64,
        VolumeUp = 65,
        VolumeDown = 66,
        Mute = 67,
        Play = 68,
        Stop = 69,
        Pause = 70,
        Record = 71,
        Rewind = 72,
        FastForward = 73,
        Eject = 74,
        Forward = 75,
        Backward = 76,
        StopRecord = 77,
        PauseRecord = 78,
        Angle = 80,
        SubPicture = 81,
        VideoOnDemand = 82,
        ElectronicProgramGuide = 83,
        TimerProgramming = 84,
        InitialConfiguration = 85,
        SelectBroadcastType = 86,
        SelectSoundPresentation = 87,
        PlayFunction = 96,
        PausePlayFunction = 97,
        RecordFunction = 98,
        PauseRecordFunction = 99,
        StopFunction = 100,
        MuteFunction = 101,
        RestoreVolumeFunction = 102,
        TuneFunction = 103,
        SelectMediaFunction = 104,
        SelectAvInputFunction = 105,
        SelectAudioInputFunction = 106,
        PowerToggleFunction = 107,
        PowerOffFunction = 108,
        PowerOnFunction = 109,
        F1Blue = 113,
        F2Red = 114,
        F3Green = 115,
        F4Yellow = 116,
        F5 = 117,
        Data = 118
    }

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterNamespace.CommandObjects<Commands>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterNamespace.Features<Features>;

    /**
     * @deprecated Use {@link KeypadInput}.
     */
    export const Cluster: typeof KeypadInput;

    /**
     * @deprecated Use {@link KeypadInput}.
     */
    export const Complete: typeof KeypadInput;

    export const Typing: KeypadInput;
}

/**
 * @deprecated Use {@link KeypadInput}.
 */
export declare const KeypadInputCluster: typeof KeypadInput;

export interface KeypadInput extends ClusterTyping {
    Commands: KeypadInput.Commands;
    Features: KeypadInput.Features;
    Components: KeypadInput.Components;
}
