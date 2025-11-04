/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { MediaPlayback } from "#clusters/media-playback";

export namespace MediaPlaybackInterface {
    export interface Base {
        /**
         * This command is used to start playback of the media.
         *
         * Upon receipt, this shall play media. If content is currently in a FastForward or Rewind state. Play shall
         * return media to normal playback speed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.1
         */
        play(): MaybePromise<MediaPlayback.PlaybackResponse>;

        /**
         * This command is used to pause playback of the media. Upon receipt, this shall pause playback of the media.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.2
         */
        pause(): MaybePromise<MediaPlayback.PlaybackResponse>;

        /**
         * This command is used to stop playback of the media.
         *
         * Upon receipt, this shall stop playback of the media. User-visible outcome is context-specific. This may
         * navigate the user back to the location from where the media was originally launched.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.3
         */
        stop(): MaybePromise<MediaPlayback.PlaybackResponse>;

        /**
         * This command is used to start playback of the media from the beginning. Upon receipt, this shall Start Over
         * with the current media playback item.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.4
         */
        startOver(): MaybePromise<MediaPlayback.PlaybackResponse>;

        /**
         * This command is used to go back to the previous media playback item.
         *
         * Upon receipt, this shall cause the handler to be invoked for "Previous". User experience is context-specific.
         * This will often Go back to the previous media playback item.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.5
         */
        previous(): MaybePromise<MediaPlayback.PlaybackResponse>;

        /**
         * This command is used to go to the next media playback item.
         *
         * Upon receipt, this shall cause the handler to be invoked for "Next". User experience is context-specific.
         * This will often Go forward to the next media playback item.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.6
         */
        next(): MaybePromise<MediaPlayback.PlaybackResponse>;

        /**
         * This command is used to skip forward in the media.
         *
         * Upon receipt, this shall Skip forward in the media by the given number of milliseconds.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.9
         */
        skipForward(request: MediaPlayback.SkipForwardRequest): MaybePromise<MediaPlayback.PlaybackResponse>;

        /**
         * This command is used to skip backward in the media.
         *
         * Upon receipt, this shall Skip backward in the media by the given number of milliseconds.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.10
         */
        skipBackward(request: MediaPlayback.SkipBackwardRequest): MaybePromise<MediaPlayback.PlaybackResponse>;
    }

    export interface AdvancedSeek {
        /**
         * This command is used to seek to a specific position in the media.
         *
         * Upon receipt, this shall change the playback position in the media to the given position.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.11
         */
        seek(request: MediaPlayback.SeekRequest): MaybePromise<MediaPlayback.PlaybackResponse>;
    }

    export interface AudioTracks {
        /**
         * This command is used to activate a specific Audio Track for the media being played.
         *
         * Upon receipt, the server shall set the active Audio Track to the one identified by the TrackID in the Track
         * catalog for the streaming media. If the TrackID does not exist in the Track catalog, OR does not correspond
         * to the streaming media OR no media is being streamed at the time of receipt of this command, the server will
         * return an error status of INVALID_ARGUMENT.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.13
         */
        activateAudioTrack(request: MediaPlayback.ActivateAudioTrackRequest): MaybePromise;
    }

    export interface TextTracks {
        /**
         * This command is used to activate a specific Text Track for the media being played.
         *
         * Upon receipt, the server shall set the active Text Track to the one identified by the TrackID in the Track
         * catalog for the streaming media. If the TrackID does not exist in the Track catalog, OR does not correspond
         * to the streaming media OR no media is being streamed at the time of receipt of this command, the server shall
         * return an error status of INVALID_ARGUMENT.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.14
         */
        activateTextTrack(request: MediaPlayback.ActivateTextTrackRequest): MaybePromise;

        /**
         * This command is used to deactivate a specific Text Track for the media being played.
         *
         * If a Text Track is active (i.e. being displayed), upon receipt of this command, the server shall stop
         * displaying it.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.15
         */
        deactivateTextTrack(): MaybePromise;
    }

    export interface VariableSpeed {
        /**
         * This command is used to rewind the media.
         *
         * Upon receipt, this shall start playback of the media backward in case the media is currently playing in the
         * forward direction or is not playing. If the playback is already happening in the backwards direction receipt
         * of this command shall increase the speed of the media playback backwards.
         *
         * Different "rewind" speeds may be reflected on the media playback device based upon the number of sequential
         * calls to this function and the capability of the device. This is to avoid needing to define every speed
         * (multiple fast, slow motion, etc). If the PlaybackSpeed attribute is supported it shall be updated to reflect
         * the new speed of playback. If the playback speed cannot be changed for the media being played(for example, in
         * live streaming content not supporting seek), the status of NOT_ALLOWED shall be returned. If the playback
         * speed has reached the maximum supported speed for media playing backwards, the status of SPEED_OUT_OF_RANGE
         * shall be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.7
         */
        rewind(request: MediaPlayback.RewindRequest): MaybePromise<MediaPlayback.PlaybackResponse>;

        /**
         * This command is used to fast forward the media.
         *
         * Upon receipt, this shall start playback of the media in the forward direction in case the media is currently
         * playing in the backward direction or is not playing. If the playback is already happening in the forward
         * direction receipt of this command shall increase the speed of the media playback.
         *
         * Different "fast-forward" speeds may be reflected on the media playback device based upon the number of
         * sequential calls to this function and the capability of the device. This is to avoid needing to define every
         * speed (multiple fast, slow motion, etc). If the PlaybackSpeed attribute is supported it shall be updated to
         * reflect the new speed of playback. If the playback speed cannot be changed for the media being played(for
         * example, in live streaming content not supporting seek), the status of NOT_ALLOWED shall be returned. If the
         * playback speed has reached the maximum supported speed for media playing forward, the status of
         * SPEED_OUT_OF_RANGE shall be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.8
         */
        fastForward(request: MediaPlayback.FastForwardRequest): MaybePromise<MediaPlayback.PlaybackResponse>;
    }
}

export type MediaPlaybackInterface = {
    components: [
        { flags: {}, methods: MediaPlaybackInterface.Base },
        { flags: { advancedSeek: true }, methods: MediaPlaybackInterface.AdvancedSeek },
        { flags: { audioTracks: true }, methods: MediaPlaybackInterface.AudioTracks },
        { flags: { textTracks: true }, methods: MediaPlaybackInterface.TextTracks },
        { flags: { variableSpeed: true }, methods: MediaPlaybackInterface.VariableSpeed }
    ]
};
