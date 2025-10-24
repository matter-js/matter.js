/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, Command } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvString } from "../tlv/TlvString.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvUInt32, TlvBitmap, TlvDouble, TlvEnum, TlvUInt64, TlvUInt8 } from "../tlv/TlvNumber.js";
import { TlvField, TlvOptionalField, TlvObject } from "../tlv/TlvObject.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { MediaPlayback } from "./media-playback.js";
import { StatusResponseError } from "../common/StatusResponseError.js";
import { Status as GlobalStatus } from "../globals/Status.js";
import { TlvBoolean } from "../tlv/TlvBoolean.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace ContentLauncher {
    /**
     * These are optional features supported by ContentLauncherCluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.4
     */
    export enum Feature {
        /**
         * ContentSearch (CS)
         *
         * Device supports content search (non-app specific)
         */
        ContentSearch = "ContentSearch",

        /**
         * UrlPlayback (UP)
         *
         * Device supports basic URL-based file playback
         */
        UrlPlayback = "UrlPlayback",

        /**
         * AdvancedSeek (AS)
         *
         * Enables clients to implement more advanced media seeking behavior in their user interface, such as for
         * example a "seek bar".
         */
        AdvancedSeek = "AdvancedSeek",

        /**
         * TextTracks (TT)
         *
         * Device or app supports Text Tracks.
         */
        TextTracks = "TextTracks",

        /**
         * AudioTracks (AT)
         *
         * Device or app supports Audio Tracks.
         */
        AudioTracks = "AudioTracks"
    }

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.1
     */
    export const SupportedProtocols = {
        /**
         * Device supports Dynamic Adaptive Streaming over HTTP (DASH)
         */
        dash: BitFlag(0),

        /**
         * Device supports HTTP Live Streaming (HLS)
         */
        hls: BitFlag(1)
    };

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.4
     */
    export enum MetricType {
        /**
         * Dimensions defined in a number of Pixels
         *
         * This value is used for dimensions defined in a number of Pixels.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.4.1
         */
        Pixels = 0,

        /**
         * Dimensions defined as a percentage
         *
         * This value is for dimensions defined as a percentage of the overall display dimensions. For example, if using
         * a Percentage Metric type for a Width measurement of 50.0, against a display width of 1920 pixels, then the
         * resulting value used would be 960 pixels (50.0% of 1920) for that dimension. Whenever a measurement uses this
         * Metric type, the resulting values shall be rounded ("floored") towards 0 if the measurement requires an
         * integer final value.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.4.2
         */
        Percentage = 1
    }

    /**
     * This object defines dimension which can be used for defining Size of background images.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.8
     */
    export const TlvDimension = TlvObject({
        /**
         * This field shall indicate the width using the metric defined in Metric
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.8.1
         */
        width: TlvField(0, TlvDouble),

        /**
         * This field shall indicate the height using the metric defined in Metric
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.8.2
         */
        height: TlvField(1, TlvDouble),

        /**
         * This field shall indicate metric used for defining Height/Width.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.8.3
         */
        metric: TlvField(2, TlvEnum<MetricType>())
    });

    /**
     * This object defines dimension which can be used for defining Size of background images.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.8
     */
    export interface Dimension extends TypeFromSchema<typeof TlvDimension> {}

    /**
     * This object defines style information which can be used by content providers to change the Media Player’s style
     * related properties.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.9
     */
    export const TlvStyleInformation = TlvObject({
        /**
         * This field shall indicate the URL of image used for Styling different Video Player sections like Logo,
         * Watermark etc. The syntax of this field shall follow the syntax as specified in RFC 1738 and shall use the
         * https scheme.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.9.1
         */
        imageUrl: TlvOptionalField(0, TlvString.bound({ maxLength: 8192 })),

        /**
         * This field shall indicate the color, in RGB or RGBA, used for styling different Video Player sections like
         * Logo, Watermark, etc. The value shall conform to the 6-digit or 8-digit format defined for CSS sRGB
         * hexadecimal color notation [https://www.w3.org/TR/css-color-4/#hex-notation]. Examples:
         *
         *   • #76DE19 for R=0x76, G=0xDE, B=0x19, A absent
         *
         *   • #76DE1980 for R=0x76, G=0xDE, B=0x19, A=0x80
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.9.2
         */
        color: TlvOptionalField(1, TlvString),

        /**
         * This field shall indicate the size of the image used for Styling different Video Player sections like Logo,
         * Watermark etc.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.9.3
         */
        size: TlvOptionalField(2, TlvDimension)
    });

    /**
     * This object defines style information which can be used by content providers to change the Media Player’s style
     * related properties.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.9
     */
    export interface StyleInformation extends TypeFromSchema<typeof TlvStyleInformation> {}

    /**
     * This object defines Branding Information which can be provided by the client in order to customize the skin of
     * the Video Player during playback.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.10
     */
    export const TlvBrandingInformation = TlvObject({
        /**
         * This field shall indicate name of the provider for the given content.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.10.1
         */
        providerName: TlvField(0, TlvString.bound({ maxLength: 256 })),

        /**
         * This field shall indicate background of the Video Player while content launch request is being processed by
         * it. This background information may also be used by the Video Player when it is in idle state.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.10.2
         */
        background: TlvOptionalField(1, TlvStyleInformation),

        /**
         * This field shall indicate the logo shown when the Video Player is launching. This is also used when the Video
         * Player is in the idle state and Splash field is not available.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.10.3
         */
        logo: TlvOptionalField(2, TlvStyleInformation),

        /**
         * This field shall indicate the style of progress bar for media playback.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.10.4
         */
        progressBar: TlvOptionalField(3, TlvStyleInformation),

        /**
         * This field shall indicate the screen shown when the Video Player is in an idle state. If this property is not
         * populated, the Video Player shall default to logo or the provider name.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.10.5
         */
        splash: TlvOptionalField(4, TlvStyleInformation),

        /**
         * This field shall indicate watermark shown when the media is playing.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.10.6
         */
        watermark: TlvOptionalField(5, TlvStyleInformation)
    });

    /**
     * This object defines Branding Information which can be provided by the client in order to customize the skin of
     * the Video Player during playback.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.10
     */
    export interface BrandingInformation extends TypeFromSchema<typeof TlvBrandingInformation> {}

    /**
     * This structure defines Text/Audio Track preferences.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.12
     */
    export const TlvTrackPreference = TlvObject({
        /**
         * This field shall contain one of the standard Tags for Identifying Languages RFC 5646, which identifies the
         * primary language used in the Track.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.12.1
         */
        languageCode: TlvField(0, TlvString.bound({ maxLength: 32 })),

        /**
         * This field shall contain a list of enumerated CharacteristicEnum values that indicate a purpose, trait or
         * feature associated with the Track. A value of null shall indicate that there are no Characteristics
         * corresponding to the Track.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.12.2
         */
        characteristics: TlvOptionalField(1, TlvNullable(TlvArray(TlvEnum<MediaPlayback.Characteristic>()))),

        /**
         * This field if present shall indicate the index of the OutputInfoStruct from the OutputList attribute (from
         * the AudioOutput cluster) and indicates which audio output the Audio Track should be played on.
         *
         * This field shall NOT be present if the track is not an audio track.
         *
         * If the track is an audio track, this field MUST be present. A value of null shall indicate that the server
         * can choose the audio output(s) to play the Audio Track on.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.12.3
         */
        audioOutputIndex: TlvOptionalField(2, TlvNullable(TlvUInt8))
    });

    /**
     * This structure defines Text/Audio Track preferences.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.12
     */
    export interface TrackPreference extends TypeFromSchema<typeof TlvTrackPreference> {}

    /**
     * PlaybackPreferencesStruct defines the preferences sent by the client to the receiver in the ContentLauncher
     * LaunchURL or LaunchContent commands.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.11
     */
    export const TlvPlaybackPreferences = TlvObject({
        /**
         * This field shall indicate the preferred position (in milliseconds) in the media to launch playback from. In
         * case the position falls in the middle of a frame, the server shall set the position to the beginning of that
         * frame and set the SampledPosition attribute on the MediaPlayback cluster accordingly. A value of null shall
         * indicate that playback position is not applicable for the current state of the media playback. (For example :
         * Live media with no known duration and where seek is not supported).
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.11.1
         */
        playbackPosition: TlvOptionalField(0, TlvNullable(TlvUInt64)),

        /**
         * This field shall indicate the user’s preferred Text Track. A value of null shall indicate that the user did
         * not specify a preferred Text Track on the client. In such a case, the decision to display and select a Text
         * Track is up to the server.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.11.2
         */
        textTrack: TlvOptionalField(1, TlvNullable(TlvTrackPreference)),

        /**
         * This field shall indicate the list of the user’s preferred Audio Tracks. If the list contains multiple
         * values, each AudioTrack must also specify a unique audioOutputIndex to play the track on. A value of null
         * shall indicate that the user did not specify a preferred Audio Track on the client. In such a case, the
         * decision to play and select an Audio Track is up to the server.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.11.3
         */
        audioTracks: TlvOptionalField(2, TlvNullable(TlvArray(TlvTrackPreference)))
    });

    /**
     * PlaybackPreferencesStruct defines the preferences sent by the client to the receiver in the ContentLauncher
     * LaunchURL or LaunchContent commands.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.11
     */
    export interface PlaybackPreferences extends TypeFromSchema<typeof TlvPlaybackPreferences> {}

    /**
     * Input to the ContentLauncher launchUrl command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.7.2
     */
    export const TlvLaunchUrlRequest = TlvObject({
        /**
         * This field shall indicate the URL of content to launch. The syntax of this field shall follow the syntax as
         * specified in RFC 1738 and shall use the https scheme.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.7.2.1
         */
        contentUrl: TlvField(0, TlvString),

        /**
         * This field, if present, shall provide a string that may be used to describe the content being accessed at the
         * given URL.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.7.2.2
         */
        displayString: TlvOptionalField(1, TlvString),

        /**
         * This field, if present, shall indicate the branding information that may be displayed when playing back the
         * given content.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.7.2.3
         */
        brandingInformation: TlvOptionalField(2, TlvBrandingInformation),

        /**
         * This field, if present, shall indicate the user’s preferred Text/AudioTracks and playbackPosition for the
         * media, sent from the client to the server. If the server does not find an available track for the title being
         * played exactly matching a Track requested here, in the list of available tracks, it may default to picking
         * another track that closely matches the requested track. Alternately, it may go with user preferences set on
         * the server side (it will use this option if these PlaybackPreferences are not specified). In the case of text
         * tracks, that may mean that the subtitle text is not displayed at all. In the cases where the preferred
         * Text/AudioTracks are not available, the server shall return the TextTrackNotAvailable and/or
         * AudioTrackNotAvailable Status(es) in the LauncherResponse.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.7.2.4
         */
        playbackPreferences: TlvOptionalField(3, TlvPlaybackPreferences)
    });

    /**
     * Input to the ContentLauncher launchUrl command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.7.2
     */
    export interface LaunchUrlRequest extends TypeFromSchema<typeof TlvLaunchUrlRequest> {}

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.2
     */
    export enum Status {
        /**
         * Command succeeded
         */
        Success = 0,

        /**
         * Requested URL could not be reached by device.
         */
        UrlNotAvailable = 1,

        /**
         * Requested URL returned 401 error code.
         */
        AuthFailed = 2,

        /**
         * Requested Text Track (in PlaybackPreferences) not available
         */
        TextTrackNotAvailable = 3,

        /**
         * Requested Audio Track (in PlaybackPreferences) not available
         */
        AudioTrackNotAvailable = 4
    }

    /**
     * Thrown for cluster status code {@link Status.UrlNotAvailable}.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.2
     */
    export class UrlNotAvailableError extends StatusResponseError {
        constructor(
            message = "Requested URL could not be reached by device",
            code = GlobalStatus.Failure,
            clusterCode = Status.UrlNotAvailable
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link Status.AuthFailed}.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.2
     */
    export class AuthFailedError extends StatusResponseError {
        constructor(
            message = "Requested URL returned 401 error code",
            code = GlobalStatus.Failure,
            clusterCode = Status.AuthFailed
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link Status.TextTrackNotAvailable}.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.2
     */
    export class TextTrackNotAvailableError extends StatusResponseError {
        constructor(
            message = "Requested Text Track (in PlaybackPreferences) not available",
            code = GlobalStatus.Failure,
            clusterCode = Status.TextTrackNotAvailable
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link Status.AudioTrackNotAvailable}.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.2
     */
    export class AudioTrackNotAvailableError extends StatusResponseError {
        constructor(
            message = "Requested Audio Track (in PlaybackPreferences) not available",
            code = GlobalStatus.Failure,
            clusterCode = Status.AudioTrackNotAvailable
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * This command shall be generated in response to LaunchContent and LaunchURL commands.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.7.3
     */
    export const TlvLauncherResponse = TlvObject({
        /**
         * This field shall indicate the status of the command which resulted in this response.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.7.3.1
         */
        status: TlvField(0, TlvEnum<Status>()),

        /**
         * This field shall indicate Optional app-specific data.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.7.3.2
         */
        data: TlvOptionalField(1, TlvString)
    });

    /**
     * This command shall be generated in response to LaunchContent and LaunchURL commands.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.7.3
     */
    export interface LauncherResponse extends TypeFromSchema<typeof TlvLauncherResponse> {}

    /**
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.3
     */
    export enum Parameter {
        /**
         * Actor represents an actor credited in video media content; for example, “Gaby Hoffman”
         */
        Actor = 0,

        /**
         * Channel represents the identifying data for a television channel; for example, "PBS"
         */
        Channel = 1,

        /**
         * A character represented in video media content; for example, “Snow White”
         */
        Character = 2,

        /**
         * A director of the video media content; for example, “Spike Lee”
         */
        Director = 3,

        /**
         * An event is a reference to a type of event; examples would include sports, music, or other types of events.
         * For example, searching for "Football games" would search for a 'game' event entity and a 'football' sport
         * entity.
         */
        Event = 4,

        /**
         * A franchise is a video entity which can represent a number of video entities, like movies or TV shows. For
         * example, take the fictional franchise "Intergalactic Wars" which represents a collection of movie trilogies,
         * as well as animated and live action TV shows. This entity type was introduced to account for requests by
         * customers such as "Find Intergalactic Wars movies", which would search for all 'Intergalactic Wars' programs
         * of the MOVIE MediaType, rather than attempting to match to a single title.
         */
        Franchise = 5,

        /**
         * Genre represents the genre of video media content such as action, drama or comedy.
         */
        Genre = 6,

        /**
         * League represents the categorical information for a sporting league; for example, "NCAA"
         */
        League = 7,

        /**
         * Popularity indicates whether the user asks for popular content.
         */
        Popularity = 8,

        /**
         * The provider (MSP) the user wants this media to be played on; for example, "Netflix".
         */
        Provider = 9,

        /**
         * Sport represents the categorical information of a sport; for example, football
         */
        Sport = 10,

        /**
         * SportsTeam represents the categorical information of a professional sports team; for example, "University of
         * Washington Huskies"
         */
        SportsTeam = 11,

        /**
         * The type of content requested. Supported types are "Movie", "MovieSeries", "TVSeries", "TVSeason",
         * "TVEpisode", "Trailer", "SportsEvent", "LiveEvent", and "Video"
         */
        Type = 12,

        /**
         * Video represents the identifying data for a specific piece of video content; for example, "Manchester by the
         * Sea".
         */
        Video = 13,

        /**
         * Season represents the specific season number within a TV series.
         */
        Season = 14,

        /**
         * Episode represents a specific episode number within a Season in a TV series.
         */
        Episode = 15,

        /**
         * Represents a search text input across many parameter types or even outside of the defined param types.
         */
        Any = 16
    }

    /**
     * This object defines additional name=value pairs that can be used for identifying content.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.5
     */
    export const TlvAdditionalInfo = TlvObject({
        /**
         * This field shall indicate the name of external id, ex. "musicbrainz".
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.5.1
         */
        name: TlvField(0, TlvString.bound({ maxLength: 256 })),

        /**
         * This field shall indicate the value for external id, ex. "ST0000000666661".
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.5.2
         */
        value: TlvField(1, TlvString.bound({ maxLength: 8192 }))
    });

    /**
     * This object defines additional name=value pairs that can be used for identifying content.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.5
     */
    export interface AdditionalInfo extends TypeFromSchema<typeof TlvAdditionalInfo> {}

    /**
     * This object defines inputs to a search for content for display or playback.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.6
     */
    export const TlvParameterStruct = TlvObject({
        /**
         * This field shall indicate the entity type.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.6.1
         */
        type: TlvField(0, TlvEnum<Parameter>()),

        /**
         * This field shall indicate the entity value, which is a search string, ex. “Manchester by the Sea”.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.6.2
         */
        value: TlvField(1, TlvString.bound({ maxLength: 1024 })),

        /**
         * This field shall indicate the list of additional external content identifiers.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.6.3
         */
        externalIdList: TlvOptionalField(2, TlvArray(TlvAdditionalInfo))
    });

    /**
     * This object defines inputs to a search for content for display or playback.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.6
     */
    export interface ParameterStruct extends TypeFromSchema<typeof TlvParameterStruct> {}

    /**
     * This object defines inputs to a search for content for display or playback.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.7
     */
    export const TlvContentSearch = TlvObject({
        /**
         * This field shall indicate the list of parameters comprising the search. If multiple parameters are provided,
         * the search parameters shall be joined with 'AND' logic. e.g. action movies with Tom Cruise will be
         * represented as [{Actor: 'Tom Cruise'}, {Type: 'Movie'}, {Genre: 'Action'}]
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.7.1
         */
        parameterList: TlvField(0, TlvArray(TlvParameterStruct))
    });

    /**
     * This object defines inputs to a search for content for display or playback.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.5.7
     */
    export interface ContentSearch extends TypeFromSchema<typeof TlvContentSearch> {}

    /**
     * Input to the ContentLauncher launchContent command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.7.1
     */
    export const TlvLaunchContentRequest = TlvObject({
        /**
         * This field shall indicate the content to launch.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.7.1.1
         */
        search: TlvField(0, TlvContentSearch),

        /**
         * This field shall indicate whether to automatically start playing content, where:
         *
         *   • TRUE means best match should start playing automatically.
         *
         *   • FALSE means matches should be displayed on screen for user selection.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.7.1.2
         */
        autoPlay: TlvField(1, TlvBoolean),

        /**
         * This field, if present, shall indicate app-specific data.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.7.1.3
         */
        data: TlvOptionalField(2, TlvString),

        /**
         * This field, if present, shall indicate the user’s preferred Text/AudioTracks and playbackPosition for the
         * media, sent from the client to the server. If the server does not find an available track for the title being
         * played exactly matching a Track requested here, in the list of available tracks, it may default to picking
         * another track that closely matches the requested track. Alternately, it may go with user preferences set on
         * the server side (it will use this option if these PlaybackPreferences are not specified). In the case of text
         * tracks, that may mean that the subtitle text is not displayed at all. In the cases where the preferred
         * Text/AudioTracks are not available, the server shall return the TextTrackNotAvailable and/or
         * AudioTrackNotAvailable Status(es) in the LauncherResponse.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.7.1.4
         */
        playbackPreferences: TlvOptionalField(3, TlvPlaybackPreferences),

        /**
         * This field, if present, shall indicate whether to consider the context of current ongoing activity on the
         * receiver to fulfill the request. For example if the request only includes data in ContentSearch that
         * specifies an Episode number, and UseCurrentContent is set to TRUE, if there is a TV series on going, the
         * request refers to the specific episode of the ongoing season of the TV series. TRUE means current activity
         * context may be considered FALSE means current activity context shall NOT be considered
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.7.7.1.5
         */
        useCurrentContext: TlvOptionalField(4, TlvBoolean)
    });

    /**
     * Input to the ContentLauncher launchContent command
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7.7.1
     */
    export interface LaunchContentRequest extends TypeFromSchema<typeof TlvLaunchContentRequest> {}

    /**
     * A ContentLauncherCluster supports these elements if it supports feature UrlPlayback.
     */
    export const UrlPlaybackComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute shall provide a list of content types supported by the Video Player or Content App in the
             * form of entries in the HTTP "Accept" request header.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 6.7.6.1
             */
            acceptHeader: Attribute(0x0, TlvArray(TlvString, { maxLength: 100 }), { persistent: true, default: [] }),

            /**
             * This attribute shall provide information about supported streaming protocols.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 6.7.6.2
             */
            supportedStreamingProtocols: Attribute(0x1, TlvBitmap(TlvUInt32, SupportedProtocols), { persistent: true })
        },

        commands: {
            /**
             * Upon receipt, this shall launch content from the specified URL.
             *
             * The content types supported include those identified in the AcceptHeader and SupportedStreamingProtocols
             * attributes.
             *
             * A check shall be made to ensure the URL is secure (uses HTTPS).
             *
             * When playing a video stream in response to this command, an indication (ex. visual) of the identity of
             * the origin node of the video stream shall be provided. This could be in the form of a friendly name label
             * which uniquely identifies the node to the user. This friendly name label is typically assigned by the
             * Matter Admin (ex. TV) at the time of commissioning and, when it’s a device, is often editable by the
             * user. It might be a combination of a company name and friendly name, for example, ”Acme” or “Acme
             * Streaming Service on Alice’s Phone”.
             *
             * This command returns a Launch Response.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 6.7.7.2
             */
            launchUrl: Command(0x1, TlvLaunchUrlRequest, 0x2, TlvLauncherResponse)
        }
    });

    /**
     * A ContentLauncherCluster supports these elements if it supports feature ContentSearch.
     */
    export const ContentSearchComponent = MutableCluster.Component({
        commands: {
            /**
             * Upon receipt, this shall launch the specified content with optional search criteria. This command returns
             * a Launch Response.
             *
             * @see {@link MatterSpecification.v141.Cluster} § 6.7.7.1
             */
            launchContent: Command(0x0, TlvLaunchContentRequest, 0x2, TlvLauncherResponse)
        }
    });

    /**
     * A ContentLauncherCluster supports these elements if it supports features ContentSearch or UrlPlayback.
     */
    export const ContentSearchOrUrlPlaybackComponent = MutableCluster.Component({});

    /**
     * These elements and properties are present in all ContentLauncher clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x50a,
        name: "ContentLauncher",
        revision: 2,

        features: {
            /**
             * Device supports content search (non-app specific)
             */
            contentSearch: BitFlag(0),

            /**
             * Device supports basic URL-based file playback
             */
            urlPlayback: BitFlag(1),

            /**
             * Enables clients to implement more advanced media seeking behavior in their user interface, such as for
             * example a "seek bar".
             */
            advancedSeek: BitFlag(2),

            /**
             * Device or app supports Text Tracks.
             */
            textTracks: BitFlag(3),

            /**
             * Device or app supports Audio Tracks.
             */
            audioTracks: BitFlag(4)
        },

        /**
         * This metadata controls which ContentLauncherCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { urlPlayback: true }, component: UrlPlaybackComponent },
            { flags: { contentSearch: true }, component: ContentSearchComponent },
            { flags: { contentSearch: true }, component: ContentSearchOrUrlPlaybackComponent },
            { flags: { urlPlayback: true }, component: ContentSearchOrUrlPlaybackComponent }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * This cluster provides an interface for launching content on a Video Player device such as a Streaming Media
     * Player, Smart TV or Smart Screen.
     *
     * This cluster would be supported on a Video Player device or devices that can playback content, such as a
     * Streaming Media Player, Smart TV or Smart Screen. This cluster supports playing back content referenced by URL.
     * It supports finding content by type and global identifier, and either playing the content or displaying the
     * search results.
     *
     * The cluster server for Content Launcher is implemented by an endpoint that can launch content, such as a Video
     * Player, or an endpoint representing a Content App on such a device.
     *
     * When this cluster is implemented for an Content App Endpoint (Endpoint with type “Content App” and having an
     * Application Basic cluster), the Video Player device shall launch the application when a client invokes the
     * LaunchContent or LaunchURL commands.
     *
     * ContentLauncherCluster supports optional features that you can enable with the ContentLauncherCluster.with()
     * factory method.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 6.7
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const UP = { urlPlayback: true };
    const CS = { contentSearch: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Cluster.id,
        name: Cluster.name,
        revision: Cluster.revision,
        features: Cluster.features,

        attributes: {
            acceptHeader: MutableCluster.AsConditional(
                UrlPlaybackComponent.attributes.acceptHeader,
                { mandatoryIf: [UP] }
            ),
            supportedStreamingProtocols: MutableCluster.AsConditional(
                UrlPlaybackComponent.attributes.supportedStreamingProtocols,
                { mandatoryIf: [UP] }
            )
        },

        commands: {
            launchContent: MutableCluster.AsConditional(
                ContentSearchComponent.commands.launchContent,
                { mandatoryIf: [CS] }
            ),
            launchUrl: MutableCluster.AsConditional(UrlPlaybackComponent.commands.launchUrl, { mandatoryIf: [UP] })
        }
    });

    /**
     * This cluster supports all ContentLauncher features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type ContentLauncherCluster = ContentLauncher.Cluster;
export const ContentLauncherCluster = ContentLauncher.Cluster;
ClusterRegistry.register(ContentLauncher.Complete);
