/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "MediaPlayback", pics: "MEDIAPLAYBACK", xref: "cluster§6.10",
    details: "This cluster provides an interface for controlling Media Playback (PLAY, PAUSE, etc) on a media " +
        "device such as a TV, Set-top Box, or Smart Speaker." +
        "\n" +
        "This cluster server would be supported on Video Player devices or endpoints that provide media " +
        "playback, such as a Content App. This cluster provides an interface for controlling Media Playback.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§6.10.4",

            children: [
                {
                    tag: "field", name: "AS", xref: "cluster§6.10.4.1",
                    details: "This feature provides access to the time offset location within current playback media and allows " +
                        "for jumping to a specific location using time offsets. This enables clients to implement more " +
                        "advanced media seeking behavior in their user interface, for instance a \"seek bar\"."
                },

                {
                    tag: "field", name: "VS", xref: "cluster§6.10.4.2",
                    details: "This feature is for a device which supports variable speed playback on media that supports it."
                },
                {
                    tag: "field", name: "TT", xref: "cluster§6.10.4.3",
                    details: "This feature is for a device or app that supports Text Tracks."
                },
                {
                    tag: "field", name: "AT", xref: "cluster§6.10.4.4",
                    details: "This feature is for a device or app that supports Audio Tracks."
                },

                {
                    tag: "field", name: "AA", xref: "cluster§6.10.4.5",
                    details: "This feature is for a device or app that supports playing audio during fast and slow advance and " +
                        "rewind (e.g., while playback speed is not 1). A device that supports this feature may only support " +
                        "playing audio during certain speeds." +
                        "\n" +
                        "A cluster implementing AA shall implement AS."
                }
            ]
        },

        {
            tag: "attribute", name: "CurrentState", xref: "cluster§6.10.6.1",
            details: "Indicates the current playback state of media." +
                "\n" +
                "During fast-forward, rewind, and other seek operations; this attribute shall be set to PLAYING."
        },

        {
            tag: "attribute", name: "StartTime", xref: "cluster§6.10.6.2",
            details: "Indicates the start time of the media, in case the media has a fixed start time (for example, live " +
                "stream or television broadcast), or null when start time does not apply to the current media (for " +
                "example, video-on-demand). This time is a UTC time. The client needs to handle conversion to local " +
                "time, as required, taking in account time zone and possible local DST offset."
        },

        {
            tag: "attribute", name: "Duration", xref: "cluster§6.10.6.3",
            details: "Indicates the duration, in milliseconds, of the current media being played back or null when " +
                "duration is not applicable (for example, in live streaming content with no known duration). This " +
                "attribute shall never be 0."
        },

        {
            tag: "attribute", name: "SampledPosition", xref: "cluster§6.10.6.4",

            details: "Indicates the position of playback (Position field) at the time (UpdateAt field) specified in the " +
                "attribute. The client may use the SampledPosition attribute to compute the current position within " +
                "the media stream based on the PlaybackSpeed, PlaybackPositionStruct.UpdatedAt and " +
                "PlaybackPositionStruct.Position fields. To enable this, the SampledPosition attribute shall be " +
                "updated whenever a change in either the playback speed or the playback position is triggered outside " +
                "the normal playback of the media. The events which may cause this to happen include:" +
                "\n" +
                "  • Starting or resumption of playback" +
                "\n" +
                "  • Seeking" +
                "\n" +
                "  • Skipping forward or backward" +
                "\n" +
                "  • Fast-forwarding or rewinding" +
                "\n" +
                "  • Updating of playback speed as a result of explicit request, or as a result of buffering events"
        },

        {
            tag: "attribute", name: "PlaybackSpeed", xref: "cluster§6.10.6.5",

            details: "Indicates the speed at which the current media is being played. The new PlaybackSpeed shall be " +
                "reflected in this attribute whenever any of the following occurs:" +
                "\n" +
                "  • Starting of playback" +
                "\n" +
                "  • Resuming of playback" +
                "\n" +
                "  • Fast-forwarding" +
                "\n" +
                "  • Rewinding" +
                "\n" +
                "The PlaybackSpeed shall reflect the ratio of time elapsed in the media to the actual time taken for " +
                "the playback assuming no changes to media playback (for example buffering events or requests to " +
                "pause/rewind/forward)." +
                "\n" +
                "  • A value for PlaybackSpeed of 1 shall indicate normal playback where, for example, playback for 1 " +
                "    second causes the media to advance by 1 second within the duration of the media." +
                "\n" +
                "  • A value for PlaybackSpeed which is greater than 0 shall indicate that as playback is happening " +
                "    the media is currently advancing in time within the duration of the media." +
                "\n" +
                "  • A value for PlaybackSpeed which is less than 0 shall indicate that as playback is happening the " +
                "    media is currently going back in time within the duration of the media." +
                "\n" +
                "  • A value for PlaybackSpeed of 0 shall indicate that the media is currently not playing back. When " +
                "    the CurrentState attribute has the value of PAUSED, NOT_PLAYING or BUFFERING, the PlaybackSpeed " +
                "    shall be set to 0 to reflect that the media is not playing." +
                "\n" +
                "Following examples illustrate the PlaybackSpeed attribute values in various conditions."
        },

        {
            tag: "attribute", name: "SeekRangeEnd", xref: "cluster§6.10.6.7",

            details: "Indicates the furthest forward valid position to which a client may seek forward, in milliseconds " +
                "from the start of the media. When the media has an associated StartTime, a value of null shall " +
                "indicate that a seek forward is valid only until the current time within the media, using a position " +
                "computed from the difference between the current time offset and StartTime, in milliseconds from " +
                "start of the media, truncating fractional milliseconds towards 0. A value of NULL when StartTime is " +
                "not specified shall indicate that seeking forward is not allowed."
        },

        {
            tag: "attribute", name: "SeekRangeStart", xref: "cluster§6.10.6.6",
            details: "Indicates the earliest valid position to which a client may seek back, in milliseconds from start of " +
                "the media. A value of NULL shall indicate that seeking backwards is not allowed."
        },

        {
            tag: "attribute", name: "ActiveAudioTrack", xref: "cluster§6.10.6.8",
            details: "ActiveTrack refers to the Audio track currently set and being used for the streaming media. A value " +
                "of null shall indicate that no Audio Track corresponding to the current media is currently being " +
                "played."
        },

        {
            tag: "attribute", name: "AvailableAudioTracks", xref: "cluster§6.10.6.9",
            details: "AvailableAudioTracks refers to the list of Audio tracks available for the current title being " +
                "played. A value of null shall indicate that no Audio Tracks corresponding to the current media are " +
                "selectable by the client."
        },

        {
            tag: "attribute", name: "ActiveTextTrack", xref: "cluster§6.10.6.10",
            details: "ActiveTrack refers to the Text track currently set and being used for the streaming media. This can " +
                "be nil. A value of null shall indicate that no Text Track corresponding to the current media is " +
                "currently being displayed."
        },

        {
            tag: "attribute", name: "AvailableTextTracks", xref: "cluster§6.10.6.11",
            details: "AvailableTextTracks refers to the list of Text tracks available for the current title being played. " +
                "This can be an empty list. A value of null shall indicate that no Text Tracks corresponding to the " +
                "current media are selectable by the client."
        },

        {
            tag: "event", name: "StateChanged", xref: "cluster§6.10.8.1",
            details: "If supported, this event shall be generated when there is a change in any of the supported " +
                "attributes of the Media Playback cluster.",

            children: [
                {
                    tag: "field", name: "CurrentState", xref: "cluster§6.10.8.1.1",
                    details: "This field shall indicate the updated playback state as defined by the CurrentState attribute, and " +
                        "has the same constraint as that attribute."
                },

                {
                    tag: "field", name: "StartTime", xref: "cluster§6.10.8.1.2",
                    details: "This field shall indicate the updated start time as defined by the StartTime attribute, and has the " +
                        "same constraint as that attribute." +
                        "\n" +
                        "This field value shall be 0 when the value of the StartTime attribute is NULL."
                },

                {
                    tag: "field", name: "Duration", xref: "cluster§6.10.8.1.3",
                    details: "This field shall indicate the updated duration as defined by the Duration attribute, and has the " +
                        "same constraint as that attribute." +
                        "\n" +
                        "This field value shall be 0 when the value of the Duration attribute is NULL."
                },

                {
                    tag: "field", name: "SampledPosition", xref: "cluster§6.10.8.1.4",
                    details: "This field shall indicate the updated position of playback as defined by the SampledPosition " +
                        "attribute, and has the same constraint as that attribute." +
                        "\n" +
                        "The UpdatedAt field value of the PlaybackPositionStruct shall be 0, and the Position field value of " +
                        "the PlaybackPositionStruct shall be NULL, when the value of the SampledPosition attribute is NULL."
                },

                {
                    tag: "field", name: "PlaybackSpeed", xref: "cluster§6.10.8.1.5",
                    details: "This field shall indicate the updated speed at which the current media is being played as defined by " +
                        "the PlaybackSpeed attribute, and has the same constraint as that attribute."
                },

                {
                    tag: "field", name: "SeekRangeEnd", xref: "cluster§6.10.8.1.7",
                    details: "This field shall indicate the updated start of the seek range end as defined by the SeekRangeEnd " +
                        "attribute, and has the same constraint as that attribute." +
                        "\n" +
                        "This field value shall be 0 when the value of the SeekRangeEnd attribute is NULL."
                },

                {
                    tag: "field", name: "SeekRangeStart", xref: "cluster§6.10.8.1.6",
                    details: "This field shall indicate the updated start of the seek range start as defined by the SeekRangeStart " +
                        "attribute, and has the same constraint as that attribute." +
                        "\n" +
                        "This field value shall be 0 when the value of the SeekRangeStart attribute is NULL."
                },

                {
                    tag: "field", name: "Data", xref: "cluster§6.10.8.1.8",
                    details: "This field shall indicate Optional app-specific data."
                },

                {
                    tag: "field", name: "AudioAdvanceUnmuted", xref: "cluster§6.10.8.1.9",

                    details: "This field shall indicate whether audio is unmuted by the player due to a FF or REW command. This " +
                        "field is only meaningful when the PlaybackSpeed is present and not equal to 0 (paused) or 1 (normal " +
                        "playback). Typically the value will be false (muted), however, some players will play audio during " +
                        "certain fast forward and rewind speeds, and in these cases, the value will be true (not muted)." +
                        "\n" +
                        "A value of true does not guarantee that audio can be heard by the user since the speaker may be " +
                        "muted, turned down to a low level and/or unplugged."
                }
            ]
        },

        {
            tag: "command", name: "Play", xref: "cluster§6.10.7.1",
            details: "This command is used to start playback of the media." +
                "\n" +
                "Upon receipt, this shall play media. If content is currently in a FastForward or Rewind state. Play " +
                "shall return media to normal playback speed."
        },

        {
            tag: "command", name: "Pause", xref: "cluster§6.10.7.2",
            details: "This command is used to pause playback of the media. Upon receipt, this shall pause playback of the " +
                "media."
        },

        {
            tag: "command", name: "Stop", xref: "cluster§6.10.7.3",
            details: "This command is used to stop playback of the media." +
                "\n" +
                "Upon receipt, this shall stop playback of the media. User-visible outcome is context-specific. This " +
                "may navigate the user back to the location from where the media was originally launched."
        },

        {
            tag: "command", name: "StartOver", xref: "cluster§6.10.7.4",
            details: "This command is used to start playback of the media from the beginning. Upon receipt, this shall " +
                "Start Over with the current media playback item."
        },

        {
            tag: "command", name: "Previous", xref: "cluster§6.10.7.5",
            details: "This command is used to go back to the previous media playback item." +
                "\n" +
                "Upon receipt, this shall cause the handler to be invoked for \"Previous\". User experience is " +
                "context-specific. This will often Go back to the previous media playback item."
        },

        {
            tag: "command", name: "Next", xref: "cluster§6.10.7.6",
            details: "This command is used to go to the next media playback item." +
                "\n" +
                "Upon receipt, this shall cause the handler to be invoked for \"Next\". User experience is " +
                "context-specific. This will often Go forward to the next media playback item."
        },

        {
            tag: "command", name: "Rewind", xref: "cluster§6.10.7.7",

            details: "This command is used to rewind the media." +
                "\n" +
                "Upon receipt, this shall start playback of the media backward in case the media is currently playing " +
                "in the forward direction or is not playing. If the playback is already happening in the backwards " +
                "direction receipt of this command shall increase the speed of the media playback backwards." +
                "\n" +
                "Different \"rewind\" speeds may be reflected on the media playback device based upon the number of " +
                "sequential calls to this function and the capability of the device. This is to avoid needing to " +
                "define every speed (multiple fast, slow motion, etc). If the PlaybackSpeed attribute is supported it " +
                "shall be updated to reflect the new speed of playback. If the playback speed cannot be changed for " +
                "the media being played(for example, in live streaming content not supporting seek), the status of " +
                "NOT_ALLOWED shall be returned. If the playback speed has reached the maximum supported speed for " +
                "media playing backwards, the status of SPEED_OUT_OF_RANGE shall be returned.",

            children: [{
                tag: "field", name: "AudioAdvanceUnmuted", xref: "cluster§6.10.7.7.1",
                details: "This field shall indicate whether audio should be unmuted by the player during rewind." +
                    "\n" +
                    "A value of true does not guarantee that audio can be heard by the user since the speaker may be " +
                    "muted, turned down to a low level and/or unplugged."
            }]
        },

        {
            tag: "command", name: "FastForward", xref: "cluster§6.10.7.8",

            details: "This command is used to fast forward the media." +
                "\n" +
                "Upon receipt, this shall start playback of the media in the forward direction in case the media is " +
                "currently playing in the backward direction or is not playing. If the playback is already happening " +
                "in the forward direction receipt of this command shall increase the speed of the media playback." +
                "\n" +
                "Different \"fast-forward\" speeds may be reflected on the media playback device based upon the number " +
                "of sequential calls to this function and the capability of the device. This is to avoid needing to " +
                "define every speed (multiple fast, slow motion, etc). If the PlaybackSpeed attribute is supported it " +
                "shall be updated to reflect the new speed of playback. If the playback speed cannot be changed for " +
                "the media being played(for example, in live streaming content not supporting seek), the status of " +
                "NOT_ALLOWED shall be returned. If the playback speed has reached the maximum supported speed for " +
                "media playing forward, the status of SPEED_OUT_OF_RANGE shall be returned.",

            children: [{
                tag: "field", name: "AudioAdvanceUnmuted", xref: "cluster§6.10.7.8.1",
                details: "This field shall indicate whether audio should be unmuted by the player during fast forward." +
                    "\n" +
                    "A value of true does not guarantee that audio can be heard by the user since the speaker may be " +
                    "muted, turned down to a low level and/or unplugged."
            }]
        },

        {
            tag: "command", name: "SkipForward", xref: "cluster§6.10.7.9",
            details: "This command is used to skip forward in the media." +
                "\n" +
                "Upon receipt, this shall Skip forward in the media by the given number of milliseconds.",

            children: [{
                tag: "field", name: "DeltaPositionMilliseconds", xref: "cluster§6.10.7.9.1",

                details: "This field shall indicate the duration of the time span to skip forward in the media, in " +
                    "milliseconds. In case the resulting position falls in the middle of a frame, the server shall set " +
                    "the position to the beginning of that frame and set the SampledPosition attribute on the cluster " +
                    "accordingly. If the resultant position falls beyond the furthest valid position in the media the " +
                    "client may seek forward to, the position should be set to that furthest valid position. If the " +
                    "SampledPosition attribute is supported it shall be updated on the cluster accordingly."
            }]
        },

        {
            tag: "command", name: "SkipBackward", xref: "cluster§6.10.7.10",
            details: "This command is used to skip backward in the media." +
                "\n" +
                "Upon receipt, this shall Skip backward in the media by the given number of milliseconds.",

            children: [{
                tag: "field", name: "DeltaPositionMilliseconds", xref: "cluster§6.10.7.10.1",

                details: "This field shall indicate the duration of the time span to skip backward in the media, in " +
                    "milliseconds. In case the resulting position falls in the middle of a frame, the server shall set " +
                    "the position to the beginning of that frame and set the SampledPosition attribute on the cluster " +
                    "accordingly. If the resultant position falls before the earliest valid position to which a client " +
                    "may seek back to, the position should be set to that earliest valid position. If the SampledPosition " +
                    "attribute is supported it shall be updated on the cluster accordingly."
            }]
        },

        {
            tag: "command", name: "PlaybackResponse", xref: "cluster§6.10.7.12",
            details: "This command is used to indicate the status of the command that was issued by the client." +
                "\n" +
                "This command shall be generated in response to various Playback Commands.",

            children: [
                {
                    tag: "field", name: "Status", xref: "cluster§6.10.7.12.1",
                    details: "This field shall indicate the status of the command which resulted in this response."
                },
                {
                    tag: "field", name: "Data", xref: "cluster§6.10.7.12.2",
                    details: "This field shall indicate Optional app-specific data."
                }
            ]
        },

        {
            tag: "command", name: "Seek", xref: "cluster§6.10.7.11",
            details: "This command is used to seek to a specific position in the media." +
                "\n" +
                "Upon receipt, this shall change the playback position in the media to the given position.",

            children: [{
                tag: "field", name: "Position", xref: "cluster§6.10.7.11.1",

                details: "This field shall indicate the position (in milliseconds) in the media to seek to. In case the " +
                    "position falls in the middle of a frame, the server shall set the position to the beginning of that " +
                    "frame and set the SampledPosition attribute on the cluster accordingly. If the position falls before " +
                    "the earliest valid position or beyond the furthest valid position to which a client may seek back or " +
                    "forward to respectively, the status of SEEK_OUT_OF_RANGE shall be returned and no change shall be " +
                    "made to the position of the playback."
            }]
        },

        {
            tag: "command", name: "ActivateAudioTrack", xref: "cluster§6.10.7.13",

            details: "This command is used to activate a specific Audio Track for the media being played." +
                "\n" +
                "Upon receipt, the server shall set the active Audio Track to the one identified by the TrackID in " +
                "the Track catalog for the streaming media. If the TrackID does not exist in the Track catalog, OR " +
                "does not correspond to the streaming media OR no media is being streamed at the time of receipt of " +
                "this command, the server will return an error status of INVALID_ARGUMENT.",

            children: [
                {
                    tag: "field", name: "TrackId", xref: "cluster§6.10.7.13.1",
                    details: "This field shall indicate the Audio Track to activate."
                },

                {
                    tag: "field", name: "AudioOutputIndex", xref: "cluster§6.10.7.13.2",
                    details: "This value is the index field of the OutputInfoStruct from the OutputList attribute (from the " +
                        "AudioOutput cluster) and indicates which audio output the Audio Track should be played on. This " +
                        "field is absent for Text Tracks and only present for Audio Tracks. A value of null shall indicate " +
                        "that the server can choose the audio output(s) to play the Audio Track on."
                }
            ]
        },

        {
            tag: "command", name: "ActivateTextTrack", xref: "cluster§6.10.7.14",

            details: "This command is used to activate a specific Text Track for the media being played." +
                "\n" +
                "Upon receipt, the server shall set the active Text Track to the one identified by the TrackID in the " +
                "Track catalog for the streaming media. If the TrackID does not exist in the Track catalog, OR does " +
                "not correspond to the streaming media OR no media is being streamed at the time of receipt of this " +
                "command, the server shall return an error status of INVALID_ARGUMENT.",

            children: [{
                tag: "field", name: "TrackId", xref: "cluster§6.10.7.14.1",
                details: "This field shall indicate the Text Track to activate."
            }]
        },

        {
            tag: "command", name: "DeactivateTextTrack", xref: "cluster§6.10.7.15",
            details: "This command is used to deactivate a specific Text Track for the media being played." +
                "\n" +
                "If a Text Track is active (i.e. being displayed), upon receipt of this command, the server shall " +
                "stop displaying it."
        },

        {
            tag: "datatype", name: "PlaybackStateEnum", xref: "cluster§6.10.5.1",

            children: [
                { tag: "field", name: "Playing", description: "Media is currently playing (includes FF and REW)" },
                { tag: "field", name: "Paused", description: "Media is currently paused" },
                { tag: "field", name: "NotPlaying", description: "Media is not currently playing" },
                {
                    tag: "field", name: "Buffering",
                    description: "Media is not currently buffering and playback will start when buffer has been filled"
                }
            ]
        },

        {
            tag: "datatype", name: "StatusEnum", xref: "cluster§6.10.5.2",

            children: [
                { tag: "field", name: "Success", description: "Succeeded" },
                {
                    tag: "field", name: "InvalidStateForCommand",
                    description: "Requested playback command is invalid in the current playback state."
                },
                {
                    tag: "field", name: "NotAllowed",
                    description: "Requested playback command is not allowed in the current playback state. For example, attempting to fast-forward during a commercial might return NotAllowed."
                },
                { tag: "field", name: "NotActive", description: "This endpoint is not active for playback." },
                {
                    tag: "field", name: "SpeedOutOfRange",
                    description: "The FastForward or Rewind Command was issued but the media is already playing back at the fastest speed supported by the server in the respective direction."
                },
                {
                    tag: "field", name: "SeekOutOfRange",
                    description: "The Seek Command was issued with a value of position outside of the allowed seek range of the media."
                }
            ]
        },

        {
            tag: "datatype", name: "CharacteristicEnum", xref: "cluster§6.10.5.3",

            children: [
                {
                    tag: "field", name: "ForcedSubtitles",
                    description: "Textual information meant for display when no other text representation is selected. It is used to clarify dialogue, alternate languages, texted graphics or location/person IDs that are not otherwise covered in the dubbed/localized audio."
                },
                {
                    tag: "field", name: "DescribesVideo",
                    description: "Textual or audio media component containing a textual description (intended for audio synthesis) or an audio description describing a visual component"
                },
                {
                    tag: "field", name: "EasyToRead",
                    description: "Simplified or reduced captions as specified in [United States Code Title 47 CFR 79.103(c)(9)]."
                },
                {
                    tag: "field", name: "FrameBased",
                    description: "A media characteristic that indicates that a track selection option includes frame-based content."
                },
                {
                    tag: "field", name: "MainProgram",
                    description: "Main media component(s) which is/are intended for presentation if no other information is provided"
                },
                {
                    tag: "field", name: "OriginalContent",
                    description: "A media characteristic that indicates that a track or media selection option contains original content."
                },
                {
                    tag: "field", name: "VoiceOverTranslation",
                    description: "A media characteristic that indicates that a track or media selection option contains a language translation and verbal interpretation of spoken dialog."
                },
                {
                    tag: "field", name: "Caption",
                    description: "Textual media component containing transcriptions of spoken dialog and auditory cues such as sound effects and music for the hearing impaired."
                },
                { tag: "field", name: "Subtitle", description: "Textual transcriptions of spoken dialog." },
                {
                    tag: "field", name: "Alternate",
                    description: "Textual media component containing transcriptions of spoken dialog and auditory cues such as sound effects and music for the hearing impaired."
                },
                {
                    tag: "field", name: "Supplementary",
                    description: "Media content component that is supplementary to a media content component of a different media component type."
                },
                {
                    tag: "field", name: "Commentary",
                    description: "Experience that contains a commentary (e.g. director’s commentary) (typically audio)"
                },
                {
                    tag: "field", name: "DubbedTranslation",
                    description: "Experience that contains an element that is presented in a different language from the original (e.g. dubbed audio, translated captions)"
                },
                {
                    tag: "field", name: "Description",
                    description: "Textual or audio media component containing a textual description (intended for audio synthesis) or an audio description describing a visual component"
                },
                {
                    tag: "field", name: "Metadata",
                    description: "Media component containing information intended to be processed by application specific elements."
                },
                {
                    tag: "field", name: "EnhancedAudioIntelligibility",
                    description: "Experience containing an element for improved intelligibility of the dialogue."
                },
                {
                    tag: "field", name: "Emergency",
                    description: "Experience that provides information, about a current emergency, that is intended to enable the protection of life, health, safety, and property, and may also include critical details regarding the emergency and how to respond to the emergency."
                },
                {
                    tag: "field", name: "Karaoke",
                    description: "Textual representation of a songs’ lyrics, usually in the same language as the associated song as specified in [SMPTE ST 2067-2]."
                }
            ]
        },

        {
            tag: "datatype", name: "PlaybackPositionStruct", xref: "cluster§6.10.5.4",
            details: "This structure defines a playback position within a media stream being played.",

            children: [
                {
                    tag: "field", name: "UpdatedAt", xref: "cluster§6.10.5.4.1",
                    details: "This field shall indicate the time when the position was last updated."
                },

                {
                    tag: "field", name: "Position", xref: "cluster§6.10.5.4.2",

                    details: "This field shall indicate the associated discrete position within the media stream, in milliseconds " +
                        "from the beginning of the stream, being associated with the time indicated by the UpdatedAt field. " +
                        "The Position shall NOT be greater than the duration of the media if duration is specified. The " +
                        "Position shall NOT be greater than the time difference between current time and start time of the " +
                        "media when start time is specified." +
                        "\n" +
                        "A value of null shall indicate that playback position is not applicable for the current state of the " +
                        "media playback (For example : Live media with no known duration and where seek is not supported)."
                }
            ]
        },

        {
            tag: "datatype", name: "TrackStruct", xref: "cluster§6.10.5.5",
            details: "This structure defines a uniquely identifiable Text Track or Audio Track.",

            children: [
                {
                    tag: "field", name: "Id", xref: "cluster§6.10.5.5.1",
                    details: "This field shall indicate the Identifier for the Track which is unique within the Track catalog. The " +
                        "Track catalog contains all the Text/Audio tracks corresponding to the main media content."
                },
                {
                    tag: "field", name: "TrackAttributes", xref: "cluster§6.10.5.5.2",
                    details: "This field shall indicate the Attributes associated to the Track, like languageCode."
                }
            ]
        },

        {
            tag: "datatype", name: "TrackAttributesStruct", xref: "cluster§6.10.5.6",
            details: "This structure includes the attributes associated with a Text/Audio Track",

            children: [
                {
                    tag: "field", name: "LanguageCode", xref: "cluster§6.10.5.6.1",
                    details: "The value is a String containing one of the standard Tags for Identifying Languages RFC 5646, which " +
                        "identifies the primary language used in the Track."
                },

                {
                    tag: "field", name: "Characteristics", xref: "cluster§6.10.5.6.2",
                    details: "This is a list of enumerated CharacteristicEnum values that indicate a purpose, trait or feature " +
                        "associated with the Track. A value of null shall indicate that there are no Characteristics " +
                        "corresponding to the Track."
                },

                {
                    tag: "field", name: "DisplayName", xref: "cluster§6.10.5.6.3",
                    details: "The value is a String containing a user displayable name for the Track. A value of null shall " +
                        "indicate that there is no DisplayName corresponding to the Track."
                }
            ]
        }
    ]
});
