import { Subscribe } from "#action/request/Subscribe.js";
import type { IcdPeerWakefulness } from "#icd/IcdPeerWakefulness.js";
import { ClientRequest } from "../ClientRequest.js";

export interface PlainClientSubscribe extends Subscribe, ClientRequest {
    /**
     * If true the subscription is virtualized and the underlying subscription is reestablished when lost.
     */
    sustain?: false;
}

export interface SustainedClientSubscribe extends Subscribe, ClientRequest {
    /**
     * If true, the subscription is virtualized and the underlying subscription is reestablished when lost.
     */
    sustain: true;

    /**
     * If true, performs a read prior to establishing the subscription.
     *
     * This retrieves values for attributes that cannot be subscribed and preloads physical device information used to
     * optimize subscription parameters.
     *
     * This flag only applies to sustained subscriptions.
     */
    bootstrapWithRead?: boolean;

    /**
     * If provided, this function is called to modify the request before it is sent to the node.
     * This is mainly used to update the Dataversion filters in the request for sustained subscriptions.
     */
    refreshRequest?: (request: SustainedClientSubscribe) => SustainedClientSubscribe;

    /**
     * Wakefulness signals for a LIT (Long Idle Time) ICD peer.  When present, the sustained subscription parks on the
     * peer's wake signal instead of running a timed retry/probe.  Attached by the node layer, which knows both that the
     * peer is operating in Long Idle Time mode and the peer's {@link IcdPeerWakefulness}.
     */
    icdWakefulness?: IcdPeerWakefulness;
}

export type ClientSubscribe = PlainClientSubscribe | SustainedClientSubscribe;
