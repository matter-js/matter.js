import { Subscribe } from "#action/request/Subscribe.js";
import { ClientRequest } from "../ClientRequest.js";

export interface ClientSubscribe extends Subscribe, ClientRequest {
    /**
     * If true the subscription is virtualized and the underlying subscription is reestablished when lost.
     */
    sustain?: boolean;
}
