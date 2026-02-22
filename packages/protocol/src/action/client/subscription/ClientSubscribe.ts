import { Subscribe } from "#action/request/Subscribe.js";
import { ClientRequest } from "../ClientRequest.js";

export interface ClientSubscribe extends Subscribe, ClientRequest {
    /**
     * If true the subscription is virtualized and the underlying subscription is reestablished when lost.
     */
    sustain?: boolean;

    /**
     * If true, performs a read prior to establishing the subscription.
     *
     * This retrieves values for attributes that cannot be subscribed and preloads physical device information used to
     * optimize subscription parameters.
     *
     * This flag only applies to sustained subscriptions.
     */
    bootstrapWithRead?: boolean;
}
