/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { MaybePromise } from "@matter/general";
import type { StatusResponseError } from "../common/StatusResponseError.js";
import type { Status as GlobalStatus } from "../globals/Status.js";
import type { MediaPlayback } from "./media-playback.js";
import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { ContentLauncher as ContentLauncherModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the ContentLauncher cluster.
 */
export declare namespace ContentLauncher {
    /**
     * {@link ContentLauncher} supports these elements if it supports feature "UrlPlayback".
     */
    export namespace UrlPlaybackComponent {
        export interface Attributes {
            /**
             * This attribute shall provide a list of content types supported by the Video Player or Content App in the
             * form of entries in the HTTP "Accept" request header.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.7.6.1
             */
            readonly acceptHeader: string[];

            /**
             * This attribute shall provide information about supported streaming protocols.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.7.6.2
             */
            readonly supportedStreamingProtocols: SupportedProtocols;
        }

        export interface Commands {
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
             * @see {@link MatterSpecification.v142.Cluster} § 6.7.7.2
             */
            launchUrl(request: LaunchUrlRequest): MaybePromise<LauncherResponse>;
        }
    }

    /**
     * {@link ContentLauncher} supports these elements if it supports feature "ContentSearch".
     */
    export namespace ContentSearchComponent {
        export interface Commands {
            /**
             * Upon receipt, this shall launch the specified content with optional search criteria.
             *
             * This command returns a Launch Response.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.7.7.1
             */
            launchContent(request: LaunchContentRequest): MaybePromise<LauncherResponse>;
        }
    }

    export interface Attributes extends Partial<UrlPlaybackComponent.Attributes> {}
    export interface Commands extends UrlPlaybackComponent.Commands, ContentSearchComponent.Commands {}

    export type Components = [
        {
            flags: { urlPlayback: true },
            attributes: UrlPlaybackComponent.Attributes,
            commands: UrlPlaybackComponent.Commands
        },
        { flags: { contentSearch: true }, commands: ContentSearchComponent.Commands }
    ];

    export type Features = "ContentSearch" | "UrlPlayback" | "AdvancedSeek" | "TextTracks" | "AudioTracks";

    /**
     * These are optional features supported by ContentLauncherCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.7.4
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
     * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.1
     */
    export interface SupportedProtocols {
        /**
         * Device supports Dynamic Adaptive Streaming over HTTP (DASH)
         */
        dash?: boolean;

        /**
         * Device supports HTTP Live Streaming (HLS)
         */
        hls?: boolean;
    }

    /**
     * Upon receipt, this shall launch content from the specified URL.
     *
     * The content types supported include those identified in the AcceptHeader and SupportedStreamingProtocols
     * attributes.
     *
     * A check shall be made to ensure the URL is secure (uses HTTPS).
     *
     * When playing a video stream in response to this command, an indication (ex. visual) of the identity of the origin
     * node of the video stream shall be provided. This could be in the form of a friendly name label which uniquely
     * identifies the node to the user. This friendly name label is typically assigned by the Matter Admin (ex. TV) at
     * the time of commissioning and, when it’s a device, is often editable by the user. It might be a combination of a
     * company name and friendly name, for example, ”Acme” or “Acme Streaming Service on Alice’s Phone”.
     *
     * This command returns a Launch Response.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.7.7.2
     */
    export interface LaunchUrlRequest {
        /**
         * This field shall indicate the URL of content to launch. The syntax of this field shall follow the syntax as
         * specified in RFC 1738 and shall use the https scheme.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.7.2.1
         */
        contentUrl: string;

        /**
         * This field, if present, shall provide a string that may be used to describe the content being accessed at the
         * given URL.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.7.2.2
         */
        displayString?: string;

        /**
         * This field, if present, shall indicate the branding information that may be displayed when playing back the
         * given content.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.7.2.3
         */
        brandingInformation?: BrandingInformation;

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
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.7.2.4
         */
        playbackPreferences?: PlaybackPreferences;
    }

    /**
     * This command shall be generated in response to LaunchContent and LaunchURL commands.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.7.7.3
     */
    export interface LauncherResponse {
        /**
         * This field shall indicate the status of the command which resulted in this response.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.7.3.1
         */
        status: Status;

        /**
         * This field shall indicate Optional app-specific data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.7.3.2
         */
        data?: string;
    }

    /**
     * Upon receipt, this shall launch the specified content with optional search criteria.
     *
     * This command returns a Launch Response.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.7.7.1
     */
    export interface LaunchContentRequest {
        /**
         * This field shall indicate the content to launch.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.7.1.1
         */
        search: ContentSearch;

        /**
         * This field shall indicate whether to automatically start playing content, where:
         *
         *   - TRUE means best match should start playing automatically.
         *
         *   - FALSE means matches should be displayed on screen for user selection.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.7.1.2
         */
        autoPlay: boolean;

        /**
         * This field, if present, shall indicate app-specific data.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.7.1.3
         */
        data?: string;

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
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.7.1.4
         */
        playbackPreferences?: PlaybackPreferences;

        /**
         * This field, if present, shall indicate whether to consider the context of current ongoing activity on the
         * receiver to fulfill the request. For example if the request only includes data in ContentSearch that
         * specifies an Episode number, and UseCurrentContent is set to TRUE, if there is a TV series on going, the
         * request refers to the specific episode of the ongoing season of the TV series. TRUE means current activity
         * context may be considered FALSE means current activity context shall NOT be considered
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.7.1.5
         */
        useCurrentContext?: boolean;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.2
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
     * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.2
     */
    export class UrlNotAvailableError extends StatusResponseError {
        constructor(message?: string, code?: GlobalStatus, clusterCode?: number)
    }

    /**
     * Thrown for cluster status code {@link Status.AuthFailed}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.2
     */
    export class AuthFailedError extends StatusResponseError {
        constructor(message?: string, code?: GlobalStatus, clusterCode?: number)
    }

    /**
     * Thrown for cluster status code {@link Status.TextTrackNotAvailable}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.2
     */
    export class TextTrackNotAvailableError extends StatusResponseError {
        constructor(message?: string, code?: GlobalStatus, clusterCode?: number)
    }

    /**
     * Thrown for cluster status code {@link Status.AudioTrackNotAvailable}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.2
     */
    export class AudioTrackNotAvailableError extends StatusResponseError {
        constructor(message?: string, code?: GlobalStatus, clusterCode?: number)
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.3
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
     * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.4
     */
    export enum MetricType {
        /**
         * Dimensions defined in a number of Pixels
         *
         * This value is used for dimensions defined in a number of Pixels.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.4.1
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
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.4.2
         */
        Percentage = 1
    }

    /**
     * This object defines additional name=value pairs that can be used for identifying content.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.5
     */
    export interface AdditionalInfo {
        /**
         * This field shall indicate the name of external id, ex. "musicbrainz".
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.5.1
         */
        name: string;

        /**
         * This field shall indicate the value for external id, ex. "ST0000000666661".
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.5.2
         */
        value: string;
    }

    /**
     * This object defines inputs to a search for content for display or playback.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.6
     */
    export interface ParameterStruct {
        /**
         * This field shall indicate the entity type.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.6.1
         */
        type: Parameter;

        /**
         * This field shall indicate the entity value, which is a search string, ex. “Manchester by the Sea”.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.6.2
         */
        value: string;

        /**
         * This field shall indicate the list of additional external content identifiers.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.6.3
         */
        externalIdList?: AdditionalInfo[];
    }

    /**
     * This object defines inputs to a search for content for display or playback.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.7
     */
    export interface ContentSearch {
        /**
         * This field shall indicate the list of parameters comprising the search. If multiple parameters are provided,
         * the search parameters shall be joined with 'AND' logic. e.g. action movies with Tom Cruise will be
         * represented as [{Actor: 'Tom Cruise'}, {Type: 'Movie'}, {Genre: 'Action'}]
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.7.1
         */
        parameterList: ParameterStruct[];
    }

    /**
     * This object defines dimension which can be used for defining Size of background images.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.8
     */
    export interface Dimension {
        /**
         * This field shall indicate the width using the metric defined in Metric
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.8.1
         */
        width: number;

        /**
         * This field shall indicate the height using the metric defined in Metric
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.8.2
         */
        height: number;

        /**
         * This field shall indicate metric used for defining Height/Width.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.8.3
         */
        metric: MetricType;
    }

    /**
     * This object defines style information which can be used by content providers to change the Media Player’s style
     * related properties.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.9
     */
    export interface StyleInformation {
        /**
         * This field shall indicate the URL of image used for Styling different Video Player sections like Logo,
         * Watermark etc. The syntax of this field shall follow the syntax as specified in RFC 1738 and shall use the
         * https scheme.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.9.1
         */
        imageUrl?: string;

        /**
         * This field shall indicate the color, in RGB or RGBA, used for styling different Video Player sections like
         * Logo, Watermark, etc. The value shall conform to the 6-digit or 8-digit format defined for CSS sRGB
         * hexadecimal color notation. Examples:
         *
         *   - #76DE19 for R=0x76, G=0xDE, B=0x19, A absent
         *
         *   - #76DE1980 for R=0x76, G=0xDE, B=0x19, A=0x80
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.9.2
         */
        color?: string;

        /**
         * This field shall indicate the size of the image used for Styling different Video Player sections like Logo,
         * Watermark etc.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.9.3
         */
        size?: Dimension;
    }

    /**
     * This object defines Branding Information which can be provided by the client in order to customize the skin of
     * the Video Player during playback.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.10
     */
    export interface BrandingInformation {
        /**
         * This field shall indicate name of the provider for the given content.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.10.1
         */
        providerName: string;

        /**
         * This field shall indicate background of the Video Player while content launch request is being processed by
         * it. This background information may also be used by the Video Player when it is in idle state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.10.2
         */
        background?: StyleInformation;

        /**
         * This field shall indicate the logo shown when the Video Player is launching. This is also used when the Video
         * Player is in the idle state and Splash field is not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.10.3
         */
        logo?: StyleInformation;

        /**
         * This field shall indicate the style of progress bar for media playback.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.10.4
         */
        progressBar?: StyleInformation;

        /**
         * This field shall indicate the screen shown when the Video Player is in an idle state. If this property is not
         * populated, the Video Player shall default to logo or the provider name.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.10.5
         */
        splash?: StyleInformation;

        /**
         * This field shall indicate watermark shown when the media is playing.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.10.6
         */
        watermark?: StyleInformation;
    }

    /**
     * PlaybackPreferencesStruct defines the preferences sent by the client to the receiver in the ContentLauncher
     * LaunchURL or LaunchContent commands.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.11
     */
    export interface PlaybackPreferences {
        /**
         * This field shall indicate the preferred position (in milliseconds) in the media to launch playback from. In
         * case the position falls in the middle of a frame, the server shall set the position to the beginning of that
         * frame and set the SampledPosition attribute on the MediaPlayback cluster accordingly. A value of null shall
         * indicate that playback position is not applicable for the current state of the media playback. (For example :
         * Live media with no known duration and where seek is not supported).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.11.1
         */
        playbackPosition?: number | bigint | null;

        /**
         * This field shall indicate the user’s preferred Text Track. A value of null shall indicate that the user did
         * not specify a preferred Text Track on the client. In such a case, the decision to display and select a Text
         * Track is up to the server.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.11.2
         */
        textTrack?: TrackPreference | null;

        /**
         * This field shall indicate the list of the user’s preferred Audio Tracks. If the list contains multiple
         * values, each AudioTrack must also specify a unique audioOutputIndex to play the track on. A value of null
         * shall indicate that the user did not specify a preferred Audio Track on the client. In such a case, the
         * decision to play and select an Audio Track is up to the server.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.11.3
         */
        audioTracks?: TrackPreference[] | null;
    }

    /**
     * This structure defines Text/Audio Track preferences.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.12
     */
    export interface TrackPreference {
        /**
         * This field shall contain one of the standard Tags for Identifying Languages RFC 5646, which identifies the
         * primary language used in the Track.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.12.1
         */
        languageCode: string;

        /**
         * This field shall contain a list of enumerated CharacteristicEnum values that indicate a purpose, trait or
         * feature associated with the Track. A value of null shall indicate that there are no Characteristics
         * corresponding to the Track.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.12.2
         */
        characteristics?: MediaPlayback.Characteristic[] | null;

        /**
         * This field if present shall indicate the index of the OutputInfoStruct from the OutputList attribute (from
         * the AudioOutput cluster) and indicates which audio output the Audio Track should be played on.
         *
         * This field shall NOT be present if the track is not an audio track.
         *
         * If the track is an audio track, this field MUST be present. A value of null shall indicate that the server
         * can choose the audio output(s) to play the Audio Track on.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.7.5.12.3
         */
        audioOutputIndex?: number | null;
    }

    export const id: ClusterId;
    export const name: "ContentLauncher";
    export const revision: 2;
    export const schema: typeof ContentLauncherModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export const commands: CommandObjects;
    export const features: ClusterNamespace.Features<Features>;
    export const Cluster: typeof ContentLauncher;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `ContentLauncher` instead of `ContentLauncher.Complete`)
     */
    export const Complete: typeof ContentLauncher;

    export const Typing: ContentLauncher;
}

export declare const ContentLauncherCluster: typeof ContentLauncher;
export interface ContentLauncher extends ClusterTyping { Attributes: ContentLauncher.Attributes; Commands: ContentLauncher.Commands; Features: ContentLauncher.Features; Components: ContentLauncher.Components }
