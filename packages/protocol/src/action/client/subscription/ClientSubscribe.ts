import { Subscribe } from "#action/request/Subscribe.js";

export interface ClientSubscribe extends Subscribe {
    /**
     * If true the subscription is virtualized and the underlying subscription is reestablished when lost.
     */
    sustain?: boolean;
}
