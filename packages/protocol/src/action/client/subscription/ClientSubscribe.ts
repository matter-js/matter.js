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
     * Live provider of the peer's {@link IcdPeerWakefulness}.  Read on each sustained-subscription loop decision: when
     * it returns a wakefulness in await mode the subscription parks on the peer's wake signal instead of running a
     * timed retry/probe; otherwise it behaves as a non-ICD sustained subscription.  Attached by the node layer, which
     * resolves the peer's wakefulness live so a peer registered after subscribe, or flipped SIT⇄LIT, is honored.
     */
    icdWakefulness?: () => IcdPeerWakefulness | undefined;
}

export type ClientSubscribe = PlainClientSubscribe | SustainedClientSubscribe;
