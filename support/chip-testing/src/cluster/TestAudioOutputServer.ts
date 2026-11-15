/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AudioOutputServer } from "@matter/main/behaviors/audio-output";
import { AudioOutput } from "@matter/main/clusters/audio-output";
import { StatusResponse } from "@matter/main/types";

/**
 * An audio output switch with the NameUpdates feature chip's tv-app declares on its video player endpoint (FeatureMap
 * 1).
 *
 * SelectOutput and RenameOutput accept an index of the OutputList and answer FAILURE for any other, as chip's tv-app
 * does; § 6.5.7 names no status for an unknown index.
 *
 * @see {@link MatterSpecification.v161.Cluster} § 6.5.7
 */
export class TestAudioOutputServer extends AudioOutputServer.with("NameUpdates") {
    override selectOutput({ index }: AudioOutput.SelectOutputRequest) {
        this.#requireOutput(index);
        this.state.currentOutput = index;
    }

    override renameOutput({ index, name }: AudioOutput.RenameOutputRequest) {
        this.#requireOutput(index);
        this.state.outputList = this.state.outputList.map(output =>
            output.index === index ? { ...output, name } : output,
        );
    }

    #requireOutput(index: number) {
        if (!this.state.outputList.some(output => output.index === index)) {
            throw new StatusResponse.FailureError(`OutputList has no output with index ${index}`);
        }
    }
}
