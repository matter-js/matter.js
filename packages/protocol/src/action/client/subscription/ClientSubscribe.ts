import { Subscribe } from "#action/request/Subscribe.js";
import type { IcdPeerWakefulness } from "#icd/IcdPeerWakefulness.js";
import type { MaybePromise, Observable } from "@matter/general";
import type { EventNumber, NodeId } from "@matter/types";
import type { ClientRead } from "../ClientRead.js";
import { ClientRequest } from "../ClientRequest.js";
import type { SustainedSubscription } from "./SustainedSubscription.js";

export interface PlainClientSubscribe extends Subscribe, ClientRequest, Pick<ClientRead, "includeKnownVersions"> {
    /**
     * If true the subscription is virtualized and the underlying subscription is reestablished when lost.
     */
    sustain?: false;
}

export interface SustainedClientSubscribe extends Subscribe, ClientRequest, Pick<ClientRead, "includeKnownVersions"> {
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
     *
     * Once the subscription delivered an event, it replaces the `eventFilters` of the returned request with one filter
     * for the events above {@link SustainedSubscription.maxEventNumber}.
     */
    refreshRequest?: (request: SustainedClientSubscribe) => SustainedClientSubscribe;

    /**
     * Called with the new value whenever {@link SustainedSubscription.maxEventNumber} rises, before the delivery of the
     * report that raised it settles, so a consumer can persist the value and seed `eventFilters` of a later
     * subscription with it.  A failure of this callback is logged and does not change the outcome of the delivery.
     *
     * @see {@link MatterSpecification.v161.Core} § 8.9.3.1
     */
    maxEventNumberChanged?: (maxEventNumber: EventNumber) => MaybePromise<void>;

    /**
     * Live provider of the peer's {@link IcdPeerWakefulness}.  Read on each sustained-subscription loop decision: when
     * it returns a wakefulness in await mode the subscription parks on the peer's wake signal instead of running a
     * timed retry/probe; otherwise it behaves as a non-ICD sustained subscription.  Attached by the node layer, which
     * resolves the peer's wakefulness live so a peer registered after subscribe, or flipped SIT⇄LIT, is honored.
     */
    icdWakefulness?: () => IcdPeerWakefulness | undefined;

    /**
     * Live provider of the fabric ICD registry's "peer fed" signal (emits the peer node ID whenever its registration
     * starts).  A subscription running without a wakefulness races this so the registration recreates the subscription
     * for the peer's mode.  Attached by the node layer alongside {@link icdWakefulness}.
     */
    icdPeerFed?: () => Observable<[NodeId]> | undefined;
}

export type ClientSubscribe = PlainClientSubscribe | SustainedClientSubscribe;
