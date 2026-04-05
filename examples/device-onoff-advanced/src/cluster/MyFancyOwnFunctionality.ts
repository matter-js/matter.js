/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NotImplementedError, Observable } from "@matter/general";
import type { ActionContext } from "@matter/main";
import { ClusterBehavior, ClusterId, MaybePromise, VendorId } from "@matter/main";
import { attribute, cluster, command, event, field, int16, nullable, response, string } from "@matter/main/model";

/** Define the Cluster ID, custom clusters use a special extended format that also contains the Vendor Id */
const myFancyClusterId = ClusterId.buildVendorSpecific(VendorId(0xfff4), 0xfc00);

/**
 * Input to the myFancyCommand command.
 */
export class MyFancyCommandRequest {
    @field(string)
    value!: string;
}

/**
 * Response of the myFancyCommand command.
 */
export class MyFancyCommandResponse {
    @field(string)
    response!: string;
}

/**
 * Event payload for the myFancyEvent event.
 */
export class MyFancyEvent {
    @field(string)
    eventValue!: string;
}

/**
 * My Fancy Cluster
 *
 * This cluster provides an interface to some fancy custom functions.
 */
@cluster(myFancyClusterId)
export class MyFancyOwnFunctionalityBehavior extends ClusterBehavior {
    declare state: MyFancyOwnFunctionalityBehavior.State;
    declare events: MyFancyOwnFunctionalityBehavior.Events;

    @command(0x1, MyFancyCommandRequest)
    @response(MyFancyCommandResponse)
    myFancyCommand(_request: MyFancyCommandRequest): MaybePromise<MyFancyCommandResponse> {
        throw new NotImplementedError();
    }
}

export namespace MyFancyOwnFunctionalityBehavior {
    export class State {
        @attribute(0x0, int16, nullable)
        myFancyValue?: number | null;
    }

    export class Events extends ClusterBehavior.Events {
        @event(0x5, MyFancyEvent)
        myFancyEvent = Observable<[payload: MyFancyEvent, context: ActionContext]>();
    }
}
