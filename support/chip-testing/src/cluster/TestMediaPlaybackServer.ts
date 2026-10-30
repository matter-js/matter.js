/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MediaPlaybackServer } from "@matter/main/behaviors/media-playback";
import { MediaPlayback } from "@matter/main/clusters/media-playback";
import { StatusResponse } from "@matter/main/types";

const SUCCESS: MediaPlayback.PlaybackResponse = { status: MediaPlayback.Status.Success };

/**
 * A media player with the AudioTracks and TextTracks features, the two of chip's tv-app's video player endpoint
 * (FeatureMap 0x1F) that the client cases need beyond the base commands. The TH plays no media.
 *
 * Every playback command answers Success. Play, Pause and Stop set CurrentState, and Next and Previous set it to
 * Playing, as chip's tv-app does. StartOver, SkipForward and SkipBackward change no state: without the AdvancedSeek
 * feature the TH has no position to move.
 *
 * ActivateAudioTrack and ActivateTextTrack answer INVALID_IN_STATE for a track not in the available list, as chip's
 * tv-app does; § 6.10.7.13 and § 6.10.7.14 name INVALID_ARGUMENT. Like chip's tv-app, the TH ignores the
 * AudioOutputIndex. DeactivateTextTrack always succeeds.
 *
 * @see {@link MatterSpecification.v161.Cluster} § 6.10.7
 */
export class TestMediaPlaybackServer extends MediaPlaybackServer.with("AudioTracks", "TextTracks") {
    override play() {
        this.state.currentState = MediaPlayback.PlaybackState.Playing;
        return SUCCESS;
    }

    override pause() {
        this.state.currentState = MediaPlayback.PlaybackState.Paused;
        return SUCCESS;
    }

    override stop() {
        this.state.currentState = MediaPlayback.PlaybackState.NotPlaying;
        return SUCCESS;
    }

    override startOver() {
        return SUCCESS;
    }

    override previous() {
        return this.play();
    }

    override next() {
        return this.play();
    }

    override skipForward(_request: MediaPlayback.SkipForwardRequest) {
        return SUCCESS;
    }

    override skipBackward(_request: MediaPlayback.SkipBackwardRequest) {
        return SUCCESS;
    }

    override activateAudioTrack({ trackId }: MediaPlayback.ActivateAudioTrackRequest) {
        this.state.activeAudioTrack = availableTrack(this.state.availableAudioTracks, trackId, "audio");
    }

    override activateTextTrack({ trackId }: MediaPlayback.ActivateTextTrackRequest) {
        this.state.activeTextTrack = availableTrack(this.state.availableTextTracks, trackId, "text");
    }

    override deactivateTextTrack() {
        this.state.activeTextTrack = null;
    }
}

function availableTrack(tracks: MediaPlayback.Track[] | null, trackId: string, kind: "audio" | "text") {
    const track = tracks?.find(({ id }) => id === trackId);
    if (track === undefined) {
        throw new StatusResponse.InvalidInStateError(`No available ${kind} track has ID "${trackId}"`);
    }
    return track;
}
