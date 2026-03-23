/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise, Bytes } from "@matter/general";
import { StatusResponseError } from "../common/StatusResponseError.js";
import { Status as GlobalStatus } from "../globals/Status.js";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { MediaPlayback as MediaPlaybackModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the MediaPlayback cluster.
 */
export namespace MediaPlayback {
    /**
     * {@link MediaPlayback} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates the current playback state of media.
             *
             * During fast-forward, rewind, and other seek operations; this attribute shall be set to PLAYING.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.6.1
             */
            readonly currentState: PlaybackState;
        }

        export interface Commands {
            /**
             * This command is used to start playback of the media.
             *
             * Upon receipt, this shall play media. If content is currently in a FastForward or Rewind state. Play shall
             * return media to normal playback speed.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.1
             */
            play(): MaybePromise<PlaybackResponse>;

            /**
             * This command is used to pause playback of the media.
             *
             * Upon receipt, this shall pause playback of the media.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.2
             */
            pause(): MaybePromise<PlaybackResponse>;

            /**
             * This command is used to stop playback of the media.
             *
             * Upon receipt, this shall stop playback of the media. User-visible outcome is context-specific. This may
             * navigate the user back to the location from where the media was originally launched.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.3
             */
            stop(): MaybePromise<PlaybackResponse>;

            /**
             * This command is used to start playback of the media from the beginning.
             *
             * Upon receipt, this shall Start Over with the current media playback item.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.4
             */
            startOver(): MaybePromise<PlaybackResponse>;

            /**
             * This command is used to go back to the previous media playback item.
             *
             * Upon receipt, this shall cause the handler to be invoked for "Previous". User experience is
             * context-specific. This will often Go back to the previous media playback item.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.5
             */
            previous(): MaybePromise<PlaybackResponse>;

            /**
             * This command is used to go to the next media playback item.
             *
             * Upon receipt, this shall cause the handler to be invoked for "Next". User experience is context-specific.
             * This will often Go forward to the next media playback item.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.6
             */
            next(): MaybePromise<PlaybackResponse>;

            /**
             * This command is used to skip forward in the media.
             *
             * Upon receipt, this shall Skip forward in the media by the given number of milliseconds.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.9
             */
            skipForward(request: SkipForwardRequest): MaybePromise<PlaybackResponse>;

            /**
             * This command is used to skip backward in the media.
             *
             * Upon receipt, this shall Skip backward in the media by the given number of milliseconds.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.10
             */
            skipBackward(request: SkipBackwardRequest): MaybePromise<PlaybackResponse>;
        }

        export interface Events {
            /**
             * If supported, this event shall be generated when there is a change in any of the supported attributes of
             * the Media Playback cluster.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.8.1
             */
            stateChanged?: StateChangedEvent;
        }
    }

    /**
     * {@link MediaPlayback} supports these elements if it supports feature "AdvancedSeek".
     */
    export namespace AdvancedSeekComponent {
        export interface Attributes {
            /**
             * Indicates the start time of the media, in case the media has a fixed start time (for example, live stream
             * or television broadcast), or null when start time does not apply to the current media (for example,
             * video-on-demand). This time is a UTC time. The client needs to handle conversion to local time, as
             * required, taking in account time zone and possible local DST offset.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.6.2
             */
            readonly startTime: number | bigint | null;

            /**
             * Indicates the duration, in milliseconds, of the current media being played back or null when duration is
             * not applicable (for example, in live streaming content with no known duration). This attribute shall
             * never be 0.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.6.3
             */
            readonly duration: number | bigint | null;

            /**
             * Indicates the position of playback (Position field) at the time (UpdateAt field) specified in the
             * attribute. The client may use the SampledPosition attribute to compute the current position within the
             * media stream based on the PlaybackSpeed, PlaybackPositionStruct.UpdatedAt and
             * PlaybackPositionStruct.Position fields. To enable this, the SampledPosition attribute shall be updated
             * whenever a change in either the playback speed or the playback position is triggered outside the normal
             * playback of the media. The events which may cause this to happen include:
             *
             *   - Starting or resumption of playback
             *
             *   - Seeking
             *
             *   - Skipping forward or backward
             *
             *   - Fast-forwarding or rewinding
             *
             *   - Updating of playback speed as a result of explicit request, or as a result of buffering events
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.6.4
             */
            readonly sampledPosition: PlaybackPosition | null;

            /**
             * Indicates the speed at which the current media is being played. The new PlaybackSpeed shall be reflected
             * in this attribute whenever any of the following occurs:
             *
             *   - Starting of playback
             *
             *   - Resuming of playback
             *
             *   - Fast-forwarding
             *
             *   - Rewinding
             *
             * The PlaybackSpeed shall reflect the ratio of time elapsed in the media to the actual time taken for the
             * playback assuming no changes to media playback (for example buffering events or requests to
             * pause/rewind/forward).
             *
             *   - A value for PlaybackSpeed of 1 shall indicate normal playback where, for example, playback for 1
             *     second causes the media to advance by 1 second within the duration of the media.
             *
             *   - A value for PlaybackSpeed which is greater than 0 shall indicate that as playback is happening the
             *     media is currently advancing in time within the duration of the media.
             *
             *   - A value for PlaybackSpeed which is less than 0 shall indicate that as playback is happening the media
             *     is currently going back in time within the duration of the media.
             *
             *   - A value for PlaybackSpeed of 0 shall indicate that the media is currently not playing back. When the
             *     CurrentState attribute has the value of PAUSED, NOT_PLAYING or BUFFERING, the PlaybackSpeed shall be
             *     set to 0 to reflect that the media is not playing.
             *
             * Following examples illustrate the PlaybackSpeed attribute values in various conditions.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.6.5
             */
            readonly playbackSpeed: number;

            /**
             * Indicates the furthest forward valid position to which a client may seek forward, in milliseconds from
             * the start of the media. When the media has an associated StartTime, a value of null shall indicate that a
             * seek forward is valid only until the current time within the media, using a position computed from the
             * difference between the current time offset and StartTime, in milliseconds from start of the media,
             * truncating fractional milliseconds towards 0. A value of NULL when StartTime is not specified shall
             * indicate that seeking forward is not allowed.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.6.7
             */
            readonly seekRangeEnd: number | bigint | null;

            /**
             * Indicates the earliest valid position to which a client may seek back, in milliseconds from start of the
             * media. A value of NULL shall indicate that seeking backwards is not allowed.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.6.6
             */
            readonly seekRangeStart: number | bigint | null;
        }

        export interface Commands {
            /**
             * This command is used to seek to a specific position in the media.
             *
             * Upon receipt, this shall change the playback position in the media to the given position.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.11
             */
            seek(request: SeekRequest): MaybePromise<PlaybackResponse>;
        }
    }

    /**
     * {@link MediaPlayback} supports these elements if it supports feature "AudioTracks".
     */
    export namespace AudioTracksComponent {
        export interface Attributes {
            /**
             * ActiveTrack refers to the Audio track currently set and being used for the streaming media. A value of
             * null shall indicate that no Audio Track corresponding to the current media is currently being played.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.6.8
             */
            readonly activeAudioTrack: Track | null;

            /**
             * AvailableAudioTracks refers to the list of Audio tracks available for the current title being played. A
             * value of null shall indicate that no Audio Tracks corresponding to the current media are selectable by
             * the client.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.6.9
             */
            readonly availableAudioTracks: Track[] | null;
        }

        export interface Commands {
            /**
             * This command is used to activate a specific Audio Track for the media being played.
             *
             * Upon receipt, the server shall set the active Audio Track to the one identified by the TrackID in the
             * Track catalog for the streaming media. If the TrackID does not exist in the Track catalog, OR does not
             * correspond to the streaming media OR no media is being streamed at the time of receipt of this command,
             * the server will return an error status of INVALID_ARGUMENT.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.13
             */
            activateAudioTrack(request: ActivateAudioTrackRequest): MaybePromise;
        }
    }

    /**
     * {@link MediaPlayback} supports these elements if it supports feature "TextTracks".
     */
    export namespace TextTracksComponent {
        export interface Attributes {
            /**
             * ActiveTrack refers to the Text track currently set and being used for the streaming media. This can be
             * nil. A value of null shall indicate that no Text Track corresponding to the current media is currently
             * being displayed.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.6.10
             */
            readonly activeTextTrack: Track | null;

            /**
             * AvailableTextTracks refers to the list of Text tracks available for the current title being played. This
             * can be an empty list. A value of null shall indicate that no Text Tracks corresponding to the current
             * media are selectable by the client.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.6.11
             */
            readonly availableTextTracks: Track[] | null;
        }

        export interface Commands {
            /**
             * This command is used to activate a specific Text Track for the media being played.
             *
             * Upon receipt, the server shall set the active Text Track to the one identified by the TrackID in the
             * Track catalog for the streaming media. If the TrackID does not exist in the Track catalog, OR does not
             * correspond to the streaming media OR no media is being streamed at the time of receipt of this command,
             * the server shall return an error status of INVALID_ARGUMENT.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.14
             */
            activateTextTrack(request: ActivateTextTrackRequest): MaybePromise;

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
    }

    /**
     * {@link MediaPlayback} supports these elements if it supports feature "VariableSpeed".
     */
    export namespace VariableSpeedComponent {
        export interface Commands {
            /**
             * This command is used to rewind the media.
             *
             * Upon receipt, this shall start playback of the media backward in case the media is currently playing in
             * the forward direction or is not playing. If the playback is already happening in the backwards direction
             * receipt of this command shall increase the speed of the media playback backwards.
             *
             * Different "rewind" speeds may be reflected on the media playback device based upon the number of
             * sequential calls to this function and the capability of the device. This is to avoid needing to define
             * every speed (multiple fast, slow motion, etc). If the PlaybackSpeed attribute is supported it shall be
             * updated to reflect the new speed of playback. If the playback speed cannot be changed for the media being
             * played(for example, in live streaming content not supporting seek), the status of NOT_ALLOWED shall be
             * returned. If the playback speed has reached the maximum supported speed for media playing backwards, the
             * status of SPEED_OUT_OF_RANGE shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.7
             */
            rewind(request: RewindRequest): MaybePromise<PlaybackResponse>;

            /**
             * This command is used to fast forward the media.
             *
             * Upon receipt, this shall start playback of the media in the forward direction in case the media is
             * currently playing in the backward direction or is not playing. If the playback is already happening in
             * the forward direction receipt of this command shall increase the speed of the media playback.
             *
             * Different "fast-forward" speeds may be reflected on the media playback device based upon the number of
             * sequential calls to this function and the capability of the device. This is to avoid needing to define
             * every speed (multiple fast, slow motion, etc). If the PlaybackSpeed attribute is supported it shall be
             * updated to reflect the new speed of playback. If the playback speed cannot be changed for the media being
             * played(for example, in live streaming content not supporting seek), the status of NOT_ALLOWED shall be
             * returned. If the playback speed has reached the maximum supported speed for media playing forward, the
             * status of SPEED_OUT_OF_RANGE shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.8
             */
            fastForward(request: FastForwardRequest): MaybePromise<PlaybackResponse>;
        }
    }

    /**
     * Attributes that may appear in {@link MediaPlayback}.
     *
     * Device support for attributes may be affected by a device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the current playback state of media.
         *
         * During fast-forward, rewind, and other seek operations; this attribute shall be set to PLAYING.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.6.1
         */
        readonly currentState: PlaybackState;

        /**
         * Indicates the start time of the media, in case the media has a fixed start time (for example, live stream or
         * television broadcast), or null when start time does not apply to the current media (for example,
         * video-on-demand). This time is a UTC time. The client needs to handle conversion to local time, as required,
         * taking in account time zone and possible local DST offset.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.6.2
         */
        readonly startTime: number | bigint | null;

        /**
         * Indicates the duration, in milliseconds, of the current media being played back or null when duration is not
         * applicable (for example, in live streaming content with no known duration). This attribute shall never be 0.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.6.3
         */
        readonly duration: number | bigint | null;

        /**
         * Indicates the position of playback (Position field) at the time (UpdateAt field) specified in the attribute.
         * The client may use the SampledPosition attribute to compute the current position within the media stream
         * based on the PlaybackSpeed, PlaybackPositionStruct.UpdatedAt and PlaybackPositionStruct.Position fields. To
         * enable this, the SampledPosition attribute shall be updated whenever a change in either the playback speed or
         * the playback position is triggered outside the normal playback of the media. The events which may cause this
         * to happen include:
         *
         *   - Starting or resumption of playback
         *
         *   - Seeking
         *
         *   - Skipping forward or backward
         *
         *   - Fast-forwarding or rewinding
         *
         *   - Updating of playback speed as a result of explicit request, or as a result of buffering events
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.6.4
         */
        readonly sampledPosition: PlaybackPosition | null;

        /**
         * Indicates the speed at which the current media is being played. The new PlaybackSpeed shall be reflected in
         * this attribute whenever any of the following occurs:
         *
         *   - Starting of playback
         *
         *   - Resuming of playback
         *
         *   - Fast-forwarding
         *
         *   - Rewinding
         *
         * The PlaybackSpeed shall reflect the ratio of time elapsed in the media to the actual time taken for the
         * playback assuming no changes to media playback (for example buffering events or requests to
         * pause/rewind/forward).
         *
         *   - A value for PlaybackSpeed of 1 shall indicate normal playback where, for example, playback for 1 second
         *     causes the media to advance by 1 second within the duration of the media.
         *
         *   - A value for PlaybackSpeed which is greater than 0 shall indicate that as playback is happening the media
         *     is currently advancing in time within the duration of the media.
         *
         *   - A value for PlaybackSpeed which is less than 0 shall indicate that as playback is happening the media is
         *     currently going back in time within the duration of the media.
         *
         *   - A value for PlaybackSpeed of 0 shall indicate that the media is currently not playing back. When the
         *     CurrentState attribute has the value of PAUSED, NOT_PLAYING or BUFFERING, the PlaybackSpeed shall be set
         *     to 0 to reflect that the media is not playing.
         *
         * Following examples illustrate the PlaybackSpeed attribute values in various conditions.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.6.5
         */
        readonly playbackSpeed: number;

        /**
         * Indicates the furthest forward valid position to which a client may seek forward, in milliseconds from the
         * start of the media. When the media has an associated StartTime, a value of null shall indicate that a seek
         * forward is valid only until the current time within the media, using a position computed from the difference
         * between the current time offset and StartTime, in milliseconds from start of the media, truncating fractional
         * milliseconds towards 0. A value of NULL when StartTime is not specified shall indicate that seeking forward
         * is not allowed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.6.7
         */
        readonly seekRangeEnd: number | bigint | null;

        /**
         * Indicates the earliest valid position to which a client may seek back, in milliseconds from start of the
         * media. A value of NULL shall indicate that seeking backwards is not allowed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.6.6
         */
        readonly seekRangeStart: number | bigint | null;

        /**
         * ActiveTrack refers to the Audio track currently set and being used for the streaming media. A value of null
         * shall indicate that no Audio Track corresponding to the current media is currently being played.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.6.8
         */
        readonly activeAudioTrack: Track | null;

        /**
         * AvailableAudioTracks refers to the list of Audio tracks available for the current title being played. A value
         * of null shall indicate that no Audio Tracks corresponding to the current media are selectable by the client.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.6.9
         */
        readonly availableAudioTracks: Track[] | null;

        /**
         * ActiveTrack refers to the Text track currently set and being used for the streaming media. This can be nil. A
         * value of null shall indicate that no Text Track corresponding to the current media is currently being
         * displayed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.6.10
         */
        readonly activeTextTrack: Track | null;

        /**
         * AvailableTextTracks refers to the list of Text tracks available for the current title being played. This can
         * be an empty list. A value of null shall indicate that no Text Tracks corresponding to the current media are
         * selectable by the client.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.6.11
         */
        readonly availableTextTracks: Track[] | null;
    }

    export interface Commands extends Base.Commands, AdvancedSeekComponent.Commands, AudioTracksComponent.Commands, TextTracksComponent.Commands, VariableSpeedComponent.Commands {}

    /**
     * Events that may appear in {@link MediaPlayback}.
     *
     * Devices may not support all of these events. Device support for events may also be affected by a device's
     * supported {@link Features}.
     */
    export interface Events {
        /**
         * If supported, this event shall be generated when there is a change in any of the supported attributes of the
         * Media Playback cluster.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.8.1
         */
        stateChanged: StateChangedEvent;
    }

    export type Components = [
        { flags: {}, attributes: Base.Attributes, commands: Base.Commands, events: Base.Events },
        {
            flags: { advancedSeek: true },
            attributes: AdvancedSeekComponent.Attributes,
            commands: AdvancedSeekComponent.Commands
        },
        {
            flags: { audioTracks: true },
            attributes: AudioTracksComponent.Attributes,
            commands: AudioTracksComponent.Commands
        },
        {
            flags: { textTracks: true },
            attributes: TextTracksComponent.Attributes,
            commands: TextTracksComponent.Commands
        },
        { flags: { variableSpeed: true }, commands: VariableSpeedComponent.Commands }
    ];

    export type Features = "AdvancedSeek" | "VariableSpeed" | "TextTracks" | "AudioTracks" | "AudioAdvance";

    /**
     * These are optional features supported by MediaPlaybackCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.10.4
     */
    export enum Feature {
        /**
         * AdvancedSeek (AS)
         *
         * This feature provides access to the time offset location within current playback media and allows for jumping
         * to a specific location using time offsets. This enables clients to implement more advanced media seeking
         * behavior in their user interface, for instance a "seek bar".
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.4.1
         */
        AdvancedSeek = "AdvancedSeek",

        /**
         * VariableSpeed (VS)
         *
         * This feature is for a device which supports variable speed playback on media that supports it.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.4.2
         */
        VariableSpeed = "VariableSpeed",

        /**
         * TextTracks (TT)
         *
         * This feature is for a device or app that supports Text Tracks.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.4.3
         */
        TextTracks = "TextTracks",

        /**
         * AudioTracks (AT)
         *
         * This feature is for a device or app that supports Audio Tracks.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.4.4
         */
        AudioTracks = "AudioTracks",

        /**
         * AudioAdvance (AA)
         *
         * This feature is for a device or app that supports playing audio during fast and slow advance and rewind
         * (e.g., while playback speed is not 1). A device that supports this feature may only support playing audio
         * during certain speeds.
         *
         * A cluster implementing AA shall implement AS.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.4.5
         */
        AudioAdvance = "AudioAdvance"
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.10.5.1
     */
    export enum PlaybackState {
        /**
         * Media is currently playing (includes FF and REW)
         */
        Playing = 0,

        /**
         * Media is currently paused
         */
        Paused = 1,

        /**
         * Media is not currently playing
         */
        NotPlaying = 2,

        /**
         * Media is not currently buffering and playback will start when buffer has been filled
         */
        Buffering = 3
    }

    /**
     * This command is used to indicate the status of the command that was issued by the client.
     *
     * This command shall be generated in response to various Playback Commands.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.12
     */
    export interface PlaybackResponse {
        /**
         * This field shall indicate the status of the command which resulted in this response.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.12.1
         */
        status: Status;

        /**
         * This field shall indicate Optional app-specific data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.12.2
         */
        data?: string;
    }

    /**
     * This command is used to skip forward in the media.
     *
     * Upon receipt, this shall Skip forward in the media by the given number of milliseconds.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.9
     */
    export interface SkipForwardRequest {
        /**
         * This field shall indicate the duration of the time span to skip forward in the media, in milliseconds. In
         * case the resulting position falls in the middle of a frame, the server shall set the position to the
         * beginning of that frame and set the SampledPosition attribute on the cluster accordingly. If the resultant
         * position falls beyond the furthest valid position in the media the client may seek forward to, the position
         * should be set to that furthest valid position. If the SampledPosition attribute is supported it shall be
         * updated on the cluster accordingly.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.9.1
         */
        deltaPositionMilliseconds: number | bigint;
    }

    /**
     * This command is used to skip backward in the media.
     *
     * Upon receipt, this shall Skip backward in the media by the given number of milliseconds.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.10
     */
    export interface SkipBackwardRequest {
        /**
         * This field shall indicate the duration of the time span to skip backward in the media, in milliseconds. In
         * case the resulting position falls in the middle of a frame, the server shall set the position to the
         * beginning of that frame and set the SampledPosition attribute on the cluster accordingly. If the resultant
         * position falls before the earliest valid position to which a client may seek back to, the position should be
         * set to that earliest valid position. If the SampledPosition attribute is supported it shall be updated on the
         * cluster accordingly.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.10.1
         */
        deltaPositionMilliseconds: number | bigint;
    }

    /**
     * If supported, this event shall be generated when there is a change in any of the supported attributes of the
     * Media Playback cluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.10.8.1
     */
    export interface StateChangedEvent {
        /**
         * This field shall indicate the updated playback state as defined by the CurrentState attribute, and has the
         * same constraint as that attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.8.1.1
         */
        currentState: PlaybackState;

        /**
         * This field shall indicate the updated start time as defined by the StartTime attribute, and has the same
         * constraint as that attribute.
         *
         * This field value shall be 0 when the value of the StartTime attribute is NULL.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.8.1.2
         */
        startTime?: number | bigint;

        /**
         * This field shall indicate the updated duration as defined by the Duration attribute, and has the same
         * constraint as that attribute.
         *
         * This field value shall be 0 when the value of the Duration attribute is NULL.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.8.1.3
         */
        duration?: number | bigint;

        /**
         * This field shall indicate the updated position of playback as defined by the SampledPosition attribute, and
         * has the same constraint as that attribute.
         *
         * The UpdatedAt field value of the PlaybackPositionStruct shall be 0, and the Position field value of the
         * PlaybackPositionStruct shall be NULL, when the value of the SampledPosition attribute is NULL.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.8.1.4
         */
        sampledPosition?: PlaybackPosition;

        /**
         * This field shall indicate the updated speed at which the current media is being played as defined by the
         * PlaybackSpeed attribute, and has the same constraint as that attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.8.1.5
         */
        playbackSpeed?: number;

        /**
         * This field shall indicate the updated start of the seek range end as defined by the SeekRangeEnd attribute,
         * and has the same constraint as that attribute.
         *
         * This field value shall be 0 when the value of the SeekRangeEnd attribute is NULL.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.8.1.7
         */
        seekRangeEnd?: number | bigint;

        /**
         * This field shall indicate the updated start of the seek range start as defined by the SeekRangeStart
         * attribute, and has the same constraint as that attribute.
         *
         * This field value shall be 0 when the value of the SeekRangeStart attribute is NULL.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.8.1.6
         */
        seekRangeStart?: number | bigint;

        /**
         * This field shall indicate Optional app-specific data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.8.1.8
         */
        data?: Bytes;

        /**
         * This field shall indicate whether audio is unmuted by the player due to a FF or REW command. This field is
         * only meaningful when the PlaybackSpeed is present and not equal to 0 (paused) or 1 (normal playback).
         * Typically the value will be false (muted), however, some players will play audio during certain fast forward
         * and rewind speeds, and in these cases, the value will be true (not muted).
         *
         * A value of true does not guarantee that audio can be heard by the user since the speaker may be muted, turned
         * down to a low level and/or unplugged.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.8.1.9
         */
        audioAdvanceUnmuted?: boolean;
    }

    /**
     * This structure defines a playback position within a media stream being played.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.10.5.4
     */
    export interface PlaybackPosition {
        /**
         * This field shall indicate the time when the position was last updated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.5.4.1
         */
        updatedAt: number | bigint;

        /**
         * This field shall indicate the associated discrete position within the media stream, in milliseconds from the
         * beginning of the stream, being associated with the time indicated by the UpdatedAt field. The Position shall
         * NOT be greater than the duration of the media if duration is specified. The Position shall NOT be greater
         * than the time difference between current time and start time of the media when start time is specified.
         *
         * A value of null shall indicate that playback position is not applicable for the current state of the media
         * playback (For example : Live media with no known duration and where seek is not supported).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.5.4.2
         */
        position: number | bigint | null;
    }

    /**
     * This command is used to seek to a specific position in the media.
     *
     * Upon receipt, this shall change the playback position in the media to the given position.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.11
     */
    export interface SeekRequest {
        /**
         * This field shall indicate the position (in milliseconds) in the media to seek to. In case the position falls
         * in the middle of a frame, the server shall set the position to the beginning of that frame and set the
         * SampledPosition attribute on the cluster accordingly. If the position falls before the earliest valid
         * position or beyond the furthest valid position to which a client may seek back or forward to respectively,
         * the status of SEEK_OUT_OF_RANGE shall be returned and no change shall be made to the position of the
         * playback.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.11.1
         */
        position: number | bigint;
    }

    /**
     * This structure defines a uniquely identifiable Text Track or Audio Track.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.10.5.5
     */
    export interface Track {
        /**
         * This field shall indicate the Identifier for the Track which is unique within the Track catalog. The Track
         * catalog contains all the Text/Audio tracks corresponding to the main media content.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.5.5.1
         */
        id: string;

        /**
         * This field shall indicate the Attributes associated to the Track, like languageCode.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.5.5.2
         */
        trackAttributes: TrackAttributes;
    }

    /**
     * This command is used to activate a specific Audio Track for the media being played.
     *
     * Upon receipt, the server shall set the active Audio Track to the one identified by the TrackID in the Track
     * catalog for the streaming media. If the TrackID does not exist in the Track catalog, OR does not correspond to
     * the streaming media OR no media is being streamed at the time of receipt of this command, the server will return
     * an error status of INVALID_ARGUMENT.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.13
     */
    export interface ActivateAudioTrackRequest {
        /**
         * This field shall indicate the Audio Track to activate.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.13.1
         */
        trackId: string;

        /**
         * This value is the index field of the OutputInfoStruct from the OutputList attribute (from the AudioOutput
         * cluster) and indicates which audio output the Audio Track should be played on. This field is absent for Text
         * Tracks and only present for Audio Tracks. A value of null shall indicate that the server can choose the audio
         * output(s) to play the Audio Track on.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.13.2
         */
        audioOutputIndex?: number | null;
    }

    /**
     * This command is used to activate a specific Text Track for the media being played.
     *
     * Upon receipt, the server shall set the active Text Track to the one identified by the TrackID in the Track
     * catalog for the streaming media. If the TrackID does not exist in the Track catalog, OR does not correspond to
     * the streaming media OR no media is being streamed at the time of receipt of this command, the server shall return
     * an error status of INVALID_ARGUMENT.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.14
     */
    export interface ActivateTextTrackRequest {
        /**
         * This field shall indicate the Text Track to activate.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.14.1
         */
        trackId: string;
    }

    /**
     * This command is used to rewind the media.
     *
     * Upon receipt, this shall start playback of the media backward in case the media is currently playing in the
     * forward direction or is not playing. If the playback is already happening in the backwards direction receipt of
     * this command shall increase the speed of the media playback backwards.
     *
     * Different "rewind" speeds may be reflected on the media playback device based upon the number of sequential calls
     * to this function and the capability of the device. This is to avoid needing to define every speed (multiple fast,
     * slow motion, etc). If the PlaybackSpeed attribute is supported it shall be updated to reflect the new speed of
     * playback. If the playback speed cannot be changed for the media being played(for example, in live streaming
     * content not supporting seek), the status of NOT_ALLOWED shall be returned. If the playback speed has reached the
     * maximum supported speed for media playing backwards, the status of SPEED_OUT_OF_RANGE shall be returned.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.7
     */
    export interface RewindRequest {
        /**
         * This field shall indicate whether audio should be unmuted by the player during rewind.
         *
         * A value of true does not guarantee that audio can be heard by the user since the speaker may be muted, turned
         * down to a low level and/or unplugged.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.7.1
         */
        audioAdvanceUnmuted?: boolean;
    }

    /**
     * This command is used to fast forward the media.
     *
     * Upon receipt, this shall start playback of the media in the forward direction in case the media is currently
     * playing in the backward direction or is not playing. If the playback is already happening in the forward
     * direction receipt of this command shall increase the speed of the media playback.
     *
     * Different "fast-forward" speeds may be reflected on the media playback device based upon the number of sequential
     * calls to this function and the capability of the device. This is to avoid needing to define every speed (multiple
     * fast, slow motion, etc). If the PlaybackSpeed attribute is supported it shall be updated to reflect the new speed
     * of playback. If the playback speed cannot be changed for the media being played(for example, in live streaming
     * content not supporting seek), the status of NOT_ALLOWED shall be returned. If the playback speed has reached the
     * maximum supported speed for media playing forward, the status of SPEED_OUT_OF_RANGE shall be returned.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.8
     */
    export interface FastForwardRequest {
        /**
         * This field shall indicate whether audio should be unmuted by the player during fast forward.
         *
         * A value of true does not guarantee that audio can be heard by the user since the speaker may be muted, turned
         * down to a low level and/or unplugged.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.7.8.1
         */
        audioAdvanceUnmuted?: boolean;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.10.5.2
     */
    export enum Status {
        /**
         * Succeeded
         */
        Success = 0,

        /**
         * Requested playback command is invalid in the current playback state.
         */
        InvalidStateForCommand = 1,

        /**
         * Requested playback command is not allowed in the current playback state. For example, attempting to
         * fast-forward during a commercial might return NotAllowed.
         */
        NotAllowed = 2,

        /**
         * This endpoint is not active for playback.
         */
        NotActive = 3,

        /**
         * The FastForward or Rewind Command was issued but the media is already playing back at the fastest speed
         * supported by the server in the respective direction.
         */
        SpeedOutOfRange = 4,

        /**
         * The Seek Command was issued with a value of position outside of the allowed seek range of the media.
         */
        SeekOutOfRange = 5
    }

    /**
     * Thrown for cluster status code {@link Status.InvalidStateForCommand}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.10.5.2
     */
    export class InvalidStateForCommandError extends StatusResponseError {
        constructor(
            message = "Requested playback command is invalid in the current playback state",
            code = GlobalStatus.Failure,
            clusterCode = Status.InvalidStateForCommand
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link Status.NotAllowed}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.10.5.2
     */
    export class NotAllowedError extends StatusResponseError {
        constructor(
            message = "Requested playback command is not allowed in the current playback state. For example, attempting to fast-forward during a commercial might return NotAllowed",
            code = GlobalStatus.Failure,
            clusterCode = Status.NotAllowed
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link Status.NotActive}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.10.5.2
     */
    export class NotActiveError extends StatusResponseError {
        constructor(
            message = "This endpoint is not active for playback",
            code = GlobalStatus.Failure,
            clusterCode = Status.NotActive
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link Status.SpeedOutOfRange}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.10.5.2
     */
    export class SpeedOutOfRangeError extends StatusResponseError {
        constructor(
            message = "The FastForward or Rewind Command was issued but the media is already playing back at the fastest speed supported by the server in the respective direction",
            code = GlobalStatus.Failure,
            clusterCode = Status.SpeedOutOfRange
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link Status.SeekOutOfRange}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.10.5.2
     */
    export class SeekOutOfRangeError extends StatusResponseError {
        constructor(
            message = "The Seek Command was issued with a value of position outside of the allowed seek range of the media",
            code = GlobalStatus.Failure,
            clusterCode = Status.SeekOutOfRange
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.10.5.3
     */
    export enum Characteristic {
        /**
         * Textual information meant for display when no other text representation is selected. It is used to clarify
         * dialogue, alternate languages, texted graphics or location/person IDs that are not otherwise covered in the
         * dubbed/localized audio.
         */
        ForcedSubtitles = 0,

        /**
         * Textual or audio media component containing a textual description (intended for audio synthesis) or an audio
         * description describing a visual component
         */
        DescribesVideo = 1,

        /**
         * Simplified or reduced captions as specified in [United States Code Title 47 CFR 79.103(c)(9)].
         */
        EasyToRead = 2,

        /**
         * A media characteristic that indicates that a track selection option includes frame-based content.
         */
        FrameBased = 3,

        /**
         * Main media component(s) which is/are intended for presentation if no other information is provided
         */
        MainProgram = 4,

        /**
         * A media characteristic that indicates that a track or media selection option contains original content.
         */
        OriginalContent = 5,

        /**
         * A media characteristic that indicates that a track or media selection option contains a language translation
         * and verbal interpretation of spoken dialog.
         */
        VoiceOverTranslation = 6,

        /**
         * Textual media component containing transcriptions of spoken dialog and auditory cues such as sound effects
         * and music for the hearing impaired.
         */
        Caption = 7,

        /**
         * Textual transcriptions of spoken dialog.
         */
        Subtitle = 8,

        /**
         * Textual media component containing transcriptions of spoken dialog and auditory cues such as sound effects
         * and music for the hearing impaired.
         */
        Alternate = 9,

        /**
         * Media content component that is supplementary to a media content component of a different media component
         * type.
         */
        Supplementary = 10,

        /**
         * Experience that contains a commentary (e.g. director’s commentary) (typically audio)
         */
        Commentary = 11,

        /**
         * Experience that contains an element that is presented in a different language from the original (e.g. dubbed
         * audio, translated captions)
         */
        DubbedTranslation = 12,

        /**
         * Textual or audio media component containing a textual description (intended for audio synthesis) or an audio
         * description describing a visual component
         */
        Description = 13,

        /**
         * Media component containing information intended to be processed by application specific elements.
         */
        Metadata = 14,

        /**
         * Experience containing an element for improved intelligibility of the dialogue.
         */
        EnhancedAudioIntelligibility = 15,

        /**
         * Experience that provides information, about a current emergency, that is intended to enable the protection of
         * life, health, safety, and property, and may also include critical details regarding the emergency and how to
         * respond to the emergency.
         */
        Emergency = 16,

        /**
         * Textual representation of a songs’ lyrics, usually in the same language as the associated song as specified
         * in [SMPTE ST 2067-2].
         */
        Karaoke = 17
    }

    /**
     * This structure includes the attributes associated with a Text/Audio Track
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.10.5.6
     */
    export interface TrackAttributes {
        /**
         * The value is a String containing one of the standard Tags for Identifying Languages RFC 5646, which
         * identifies the primary language used in the Track.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.5.6.1
         */
        languageCode: string;

        /**
         * This is a list of enumerated CharacteristicEnum values that indicate a purpose, trait or feature associated
         * with the Track. A value of null shall indicate that there are no Characteristics corresponding to the Track.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.5.6.2
         */
        characteristics?: Characteristic[] | null;

        /**
         * The value is a String containing a user displayable name for the Track. A value of null shall indicate that
         * there is no DisplayName corresponding to the Track.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.10.5.6.3
         */
        displayName?: string | null;
    }

    export const id = ClusterId(0x506);
    export const name = "MediaPlayback" as const;
    export const revision = 2;
    export const schema = MediaPlaybackModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export interface EventObjects extends ClusterNamespace.EventObjects<Events> {}
    export declare const events: EventObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export type Cluster = typeof MediaPlayback;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `MediaPlayback` instead of `MediaPlayback.Complete`)
     */
    export type Complete = typeof MediaPlayback;

    export declare const Complete: Complete;
    export declare const Typing: MediaPlayback;
}

ClusterNamespace.define(MediaPlayback);
export type MediaPlaybackCluster = MediaPlayback.Cluster;
export const MediaPlaybackCluster = MediaPlayback.Cluster;
export interface MediaPlayback extends ClusterTyping { Attributes: MediaPlayback.Attributes; Commands: MediaPlayback.Commands; Events: MediaPlayback.Events; Features: MediaPlayback.Features; Components: MediaPlayback.Components }
