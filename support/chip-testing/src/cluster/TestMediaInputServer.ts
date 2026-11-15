/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MediaInputServer } from "@matter/main/behaviors/media-input";
import { MediaInput } from "@matter/main/clusters/media-input";
import { StatusResponse } from "@matter/main/types";

/**
 * A media input switch with the NameUpdates feature chip's tv-app declares on its video player endpoint (FeatureMap
 * 1).
 *
 * SelectInput and RenameInput accept an index of the InputList and answer FAILURE for any other, as chip's tv-app does.
 * ShowInputStatus and HideInputStatus always succeed: the TH has no screen.
 *
 * @see {@link MatterSpecification.v161.Cluster} § 6.9.7
 */
export class TestMediaInputServer extends MediaInputServer.with("NameUpdates") {
    override selectInput({ index }: MediaInput.SelectInputRequest) {
        this.#requireInput(index);
        this.state.currentInput = index;
    }

    override showInputStatus() {}

    override hideInputStatus() {}

    override renameInput({ index, name }: MediaInput.RenameInputRequest) {
        this.#requireInput(index);
        this.state.inputList = this.state.inputList.map(input => (input.index === index ? { ...input, name } : input));
    }

    #requireInput(index: number) {
        if (!this.state.inputList.some(input => input.index === index)) {
            throw new StatusResponse.FailureError(`InputList has no input with index ${index}`);
        }
    }
}
