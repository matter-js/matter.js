/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint } from "#device/Endpoint.js";
import { ImplementationError, InternalError, Logger, MatterError, camelize, isDeepEqual, serialize } from "#general";
import { AccessLevel, AttributeModel, ClusterModel, DatatypeModel, FabricIndex, MatterModel } from "#model";
import { Fabric, Message, NoAssociatedFabricError, SecureSession, Session } from "#protocol";
import {
    Attribute,
    AttributeId,
    Attributes,
    BitSchema,
    Cluster,
    Commands,
    Events,
    StatusCode,
    StatusResponseError,
    TlvSchema,
    TypeFromPartialBitSchema,
    ValidationError,
} from "#types";
import { ClusterDatasource } from "./ClusterDatasource.js";

const logger = Logger.get("AttributeServer");

const FabricIndexName = camelize(FabricIndex.name);

/**
 * Thrown when an operation cannot complete because fabric information is
 * unavailable.
 */
export class FabricScopeError extends MatterError {}

export type AnyAttributeServer<T = any> = AttributeServer<T> | FabricScopedAttributeServer<T> | FixedAttributeServer<T>;

type DelayedChangeData = {
    oldValue: any;
    newValue: any;
    changed: boolean;
};

/**
 * Factory function to create an attribute server.
 */
export function createAttributeServer<
    T,
    F extends BitSchema,
    SF extends TypeFromPartialBitSchema<F>,
    A extends Attributes,
    C extends Commands,
    E extends Events,
>(
    clusterDef: Cluster<F, SF, A, C, E>,
    attributeDef: Attribute<T, F>,
    attributeName: string,
    initValue: T,
    datasource: ClusterDatasource,
    getter?: (session?: Session, endpoint?: Endpoint, isFabricFiltered?: boolean, message?: Message) => T,
    setter?: (value: T, session?: Session, endpoint?: Endpoint, message?: Message) => boolean,
    validator?: (value: T, session?: Session, endpoint?: Endpoint) => void,
) {
    const {
        id,
        schema,
        writable,
        fabricScoped,
        fixed,
        omitChanges,
        timed,
        default: defaultValue,
        readAcl,
        writeAcl,
    } = attributeDef;

    if (fixed) {
        return new FixedAttributeServer(
            id,
            attributeName,
            readAcl,
            writeAcl,
            schema,
            writable,
            false,
            timed,
            initValue,
            defaultValue,
            datasource,
            getter,
        );
    }

    if (fabricScoped) {
        return new FabricScopedAttributeServer(
            id,
            attributeName,
            readAcl,
            writeAcl,
            schema,
            writable,
            !omitChanges,
            timed,
            initValue,
            defaultValue,
            clusterDef,
            datasource,
            getter,
            setter,
            validator,
        );
    }

    return new AttributeServer(
        id,
        attributeName,
        readAcl,
        writeAcl,
        schema,
        writable,
        !omitChanges,
        timed,
        initValue,
        defaultValue,
        datasource,
        getter,
        setter,
        validator,
    );
}

/**
 * Base class for all attribute servers.
 */
export abstract class BaseAttributeServer<T> {
    /**
     * The value is undefined when getter/setter are used. But we still handle the version number here.
     */
    protected value: T | undefined = undefined;
    protected endpoint?: Endpoint;
    readonly defaultValue: T;
    #readAcl: AccessLevel | undefined;
    #writeAcl: AccessLevel | undefined;

    constructor(
        readonly id: AttributeId,
        readonly name: string,
        readAcl: AccessLevel | undefined,
        writeAcl: AccessLevel | undefined,
        readonly schema: TlvSchema<T>,
        readonly isWritable: boolean,
        readonly isSubscribable: boolean,
        readonly requiresTimedInteraction: boolean,
        initValue: T,
        defaultValue: T | undefined,
    ) {
        this.#readAcl = readAcl;
        this.#writeAcl = writeAcl;
        try {
            this.validateWithSchema(initValue);
            this.value = initValue;
        } catch (error) {
            logger.warn(
                `Attribute value to initialize for ${name} has an invalid value ${serialize(
                    initValue,
                )}. Restore to default ${serialize(defaultValue)}`,
            );
            if (defaultValue === undefined) {
                throw new ImplementationError(`Attribute value to initialize for ${name} cannot be undefined.`);
            }
            this.validateWithSchema(defaultValue);
            this.value = defaultValue;
        }
        this.defaultValue = this.value;
    }

    get hasFabricSensitiveData() {
        return false;
    }

    validateWithSchema(value: T) {
        try {
            this.schema.validate(value);
        } catch (e) {
            ValidationError.accept(e);

            // Handle potential error cases where a custom validator is used.
            e.message = `Validation error for attribute "${this.name}"${e.fieldName !== undefined ? ` in field ${e.fieldName}` : ""}: ${e.message}`;
            throw e;
        }
    }

    assignToEndpoint(endpoint: Endpoint) {
        this.endpoint = endpoint;
    }

    /**
     * Initialize the value of the attribute, used when a persisted value is set initially or when values needs to be
     * adjusted before the Device gets announced. Do not use this method to change values when the device is in use!
     */
    abstract init(value: T | undefined): void;

    get writeAcl() {
        return this.#writeAcl ?? AccessLevel.Operate; // ???
    }

    get readAcl() {
        return this.#readAcl ?? AccessLevel.View; // ???
    }
}

/**
 * Attribute server class that handled fixed attribute values that never change and is the base class for other
 * Attribute server types.
 */
export class FixedAttributeServer<T> extends BaseAttributeServer<T> {
    readonly isFixed: boolean = true;
    protected readonly getter: (
        session?: Session,
        endpoint?: Endpoint,
        isFabricFiltered?: boolean,
        message?: Message,
    ) => T;

    constructor(
        id: AttributeId,
        name: string,
        readAcl: AccessLevel | undefined,
        writeAcl: AccessLevel | undefined,
        schema: TlvSchema<T>,
        isWritable: boolean,
        isSubscribable: boolean,
        requiresTimedInteraction: boolean,
        initValue: T,
        defaultValue: T | undefined,
        protected readonly datasource: ClusterDatasource,

        /**
         * Optional getter function to handle special requirements or the data are stored in different places.
         *
         * @param session the session that is requesting the value (if any)
         * @param endpoint the endpoint the cluster server of this attribute is assigned to
         * @param isFabricFiltered whether the read request is fabric scoped or not
         * @param message the wire message that initiated the request (if any)
         */
        getter?: (session?: Session, endpoint?: Endpoint, isFabricFiltered?: boolean, message?: Message) => T,
    ) {
        super(
            id,
            name,
            readAcl,
            writeAcl,
            schema,
            isWritable,
            isSubscribable,
            requiresTimedInteraction,
            initValue,
            defaultValue,
        ); // Fixed attributes do not change, so are not subscribable

        if (getter === undefined) {
            this.getter = () => {
                if (this.value === undefined) {
                    // Should not happen
                    throw new InternalError(`Attribute value for attribute "${name}" is not initialized.`);
                }
                return this.value;
            };
        } else {
            this.getter = getter;
        }
    }

    /**
     * Get the value of the attribute. This method is used by the Interaction model to read the value of the attribute
     * and includes the ACL check. It should not be used locally in the code!
     *
     * If a getter is defined the value is determined by that getter method.
     */
    get(session: Session, isFabricFiltered: boolean, message?: Message): T {
        // TODO: check ACL

        return this.getter(session, this.endpoint, isFabricFiltered, message);
    }

    /**
     * Get the value of the attribute including the version number. This method is used by the Interaction model to read
     * the value of the attribute and includes the ACL check. It should not be used locally in the code!
     *
     * If a getter is defined the value is determined by that getter method. The version number is always 0 for fixed
     * attributes.
     */
    getWithVersion(session: Session, isFabricFiltered: boolean, message?: Message) {
        return { version: this.datasource.version, value: this.get(session, isFabricFiltered, message) };
    }

    /**
     * Get the value of the attribute locally. This method should be used locally in the code and does not include the
     * ACL check.
     * If a getter is defined the value is determined by that getter method.
     */
    getLocal(): T {
        return this.getter(undefined, this.endpoint);
    }

    /**
     * Initialize the value of the attribute, used when a persisted value is set initially or when values needs to be
     * adjusted before the Device gets announced. Do not use this method to change values when the device is in use!
     * If a getter or setter is defined the value must be undefined The version number must also be undefined.
     */
    init(value: T | undefined) {
        if (value === undefined) {
            throw new InternalError(`Cannot initialize fixed attribute "${this.name}" with undefined value.`);
        }
        this.validateWithSchema(value);
        this.value = value;
    }

    /**
     * Add an internal listener that is called when the value of the attribute changes. The listener is called with the
     * new value and the version number.
     */
    addValueChangeListener(_listener: (value: T, version: number) => void) {
        /** Fixed attributes do not change. */
    }

    /**
     * Remove an internal listener.
     */
    removeValueChangeListener(_listener: (value: T, version: number) => void) {
        /** Fixed attributes do not change. */
    }

    /**
     * Add an external listener that is called when the value of the attribute changes. The listener is called with the
     * new value and the old value.
     */
    addValueSetListener(_listener: (newValue: T, oldValue: T) => void) {
        /** Fixed attributes do not change. */
    }

    /**
     * Add an external listener that is called when the value of the attribute changes. The listener is called with the
     * new value and the old value. This method is a convenient alias for addValueSetListener.
     */
    subscribe(_listener: (newValue: T, oldValue: T) => void) {
        /** Fixed attributes do not change. */
    }

    /**
     * Remove an external listener.
     */
    removeValueSetListener(_listener: (newValue: T, oldValue: T) => void) {
        /** Fixed attributes do not change. */
    }
}

/**
 * Attribute server for normal attributes that can be read and written.
 */
export class AttributeServer<T> extends FixedAttributeServer<T> {
    override readonly isFixed = false;
    protected readonly valueChangeListeners = new Array<(value: T, version: number) => void>();
    protected readonly valueSetListeners = new Array<(newValue: T, oldValue: T) => void>();
    protected readonly setter: (value: T, session?: Session, endpoint?: Endpoint, message?: Message) => boolean;
    protected readonly validator: (value: T, session?: Session, endpoint?: Endpoint) => void;
    protected delayedChangeData?: DelayedChangeData = undefined;

    constructor(
        id: AttributeId,
        name: string,
        readAcl: AccessLevel | undefined,
        writeAcl: AccessLevel | undefined,
        schema: TlvSchema<T>,
        isWritable: boolean,
        isSubscribable: boolean,
        requiresTimedInteraction: boolean,
        initValue: T,
        defaultValue: T | undefined,
        datasource: ClusterDatasource,
        getter?: (session?: Session, endpoint?: Endpoint, isFabricFiltered?: boolean, message?: Message) => T,

        /**
         * Optional setter function to handle special requirements or the data are stored in different places. If a
         * setter method is used for a writable attribute, the getter method must be implemented as well. The method
         * needs to return if the stored value has changed or not.
         *
         * @param value the value to be set.
         * @param session the session that is requesting the value (if any).
         * @param endpoint the endpoint the cluster server of this attribute is assigned to.
         * @returns true if the value has changed, false otherwise.
         */
        setter?: (value: T, session?: Session, endpoint?: Endpoint, message?: Message) => boolean,

        /**
         * Optional Validator function to handle special requirements for verification of stored data. The method should
         * throw an error if the value is not valid. If a StatusResponseError is thrown this one is also returned to the
         * client.
         *
         * If a setter is used then no validator should be used as the setter should handle the validation itself!
         *
         * @param value the value to be set.
         * @param session the session that is requesting the value (if any).
         * @param endpoint the endpoint the cluster server of this attribute is assigned to.
         */
        validator?: (value: T, session?: Session, endpoint?: Endpoint) => void,
    ) {
        if (
            isWritable &&
            (getter === undefined || setter === undefined) &&
            !(getter === undefined && setter === undefined)
        ) {
            throw new ImplementationError(
                `Getter and setter must be implemented together for writeable attribute "${name}".`,
            );
        }

        super(
            id,
            name,
            readAcl,
            writeAcl,
            schema,
            isWritable,
            isSubscribable,
            requiresTimedInteraction,
            initValue,
            defaultValue,
            datasource,
            getter,
        );

        if (setter === undefined) {
            this.setter = value => {
                const oldValue = this.value;
                this.value = value;
                return !isDeepEqual(value, oldValue);
            };
        } else {
            this.setter = setter;
        }

        this.validator = (value, session, endpoint) => {
            this.validateWithSchema(value);
            if (validator !== undefined) {
                validator(value, session, endpoint);
            }
        };
    }

    /**
     * Initialize the value of the attribute, used when a persisted value is set initially or when values needs to be
     * adjusted before the Device gets announced. Do not use this method to change values when the device is in use!
     */
    override init(value: T | undefined) {
        if (value === undefined) {
            value = this.getter(undefined, this.endpoint);
        }
        if (value === undefined) {
            throw new InternalError(`Cannot initialize attribute "${this.name}" with undefined value.`);
        }
        this.validator(value, undefined, this.endpoint);
        this.value = value;
    }

    /**
     * Set the value of the attribute. This method is used by the Interaction model to write the value of the attribute
     * and includes the ACL check. It should not be used locally in the code!
     *
     * If a setter is defined this setter method is called to store the value.
     *
     * Listeners are called when the value changes (internal listeners) or in any case (external listeners).
     */
    set(value: T, session: Session, message?: Message, delayChangeEvents = false) {
        if (!this.isWritable) {
            throw new StatusResponseError(`Attribute "${this.name}" is not writable.`, StatusCode.UnsupportedWrite);
        }

        this.setRemote(value, session, message, delayChangeEvents);
    }

    /**
     * Method that contains the logic to set a value "from remote" (e.g. from a client).
     */
    protected setRemote(value: T, session: Session, message?: Message, delayChangeEvents = false) {
        this.processSet(value, session, message, delayChangeEvents);
        this.value = value;
    }

    /**
     * Set the value of the attribute locally. This method should be used locally in the code and does not include the
     * ACL check.
     *
     * If a setter is defined this setter method is called to validate and store the value.
     *
     * Else if a validator is defined the value is validated before it is stored.
     *
     * Listeners are called when the value changes (internal listeners) or in any case (external listeners).
     */
    setLocal(value: T) {
        this.processSet(value, undefined);
        this.value = value;
    }

    /**
     * Helper Method to process the set of a value in a generic way. This method is used internally.
     */
    protected processSet(value: T, session?: Session, message?: Message, delayChangeEvents = false) {
        this.validator(value, session, this.endpoint);
        const oldValue = this.getter(session, this.endpoint, undefined, message);
        const valueChanged = this.setter(value, session, this.endpoint, message);
        if (delayChangeEvents) {
            this.delayedChangeData = {
                oldValue: this.delayedChangeData?.oldValue ?? oldValue, // We keep the oldest value
                newValue: value,
                changed: !!this.delayedChangeData?.changed || valueChanged, // We combine the changed flag
            };
            logger.info(`Delay change for attribute "${this.name}" with value ${serialize(value)}`);
        } else {
            this.handleVersionAndTriggerListeners(value, oldValue, valueChanged);
        }
    }

    triggerDelayedChangeEvents() {
        if (this.delayedChangeData !== undefined) {
            const { oldValue, newValue, changed } = this.delayedChangeData;
            this.delayedChangeData = undefined;
            logger.info(`Trigger delayed change for attribute "${this.name}" with value ${serialize(newValue)}`);
            this.handleVersionAndTriggerListeners(newValue, oldValue, changed);
        }
    }

    /**
     * Helper Method to handle needed version increases and trigger the relevant listeners. This method is used
     * internally.
     */
    protected handleVersionAndTriggerListeners(value: T, oldValue: T | undefined, considerVersionChanged: boolean) {
        if (considerVersionChanged) {
            const version = this.datasource.increaseVersion();
            this.valueChangeListeners.forEach(listener => listener(value, version));
        }
        if (oldValue !== undefined) {
            this.valueSetListeners.forEach(listener => listener(value, oldValue));
        }
    }

    /**
     * When the value is handled by getter or setter methods and is changed by other processes this method can be used
     * to notify the attribute server that the value has changed. This will increase the version number and trigger the
     * listeners.
     *
     * ACL checks needs to be performed before calling this method.
     */
    updated(session: SecureSession) {
        const oldValue = this.value ?? this.defaultValue;
        try {
            this.value = this.get(session, false);
        } catch (e) {
            NoAssociatedFabricError.accept(e);

            // Handle potential error cases where the session does not have a fabric assigned.
            if (this.value === undefined) {
                this.value = this.defaultValue;
            }
        }
        this.handleVersionAndTriggerListeners(this.value, oldValue, true);
    }

    /**
     * When the value is handled by getter or setter methods and is changed by other processes and no session from the
     * originating process is known this method can be used to notify the attribute server that the value has changed.
     * This will increase the version number and trigger the listeners.
     *
     * ACL checks needs to be performed before calling this method.
     */
    updatedLocal() {
        const oldValue = this.value ?? this.defaultValue;
        this.value = this.getLocal();
        this.handleVersionAndTriggerListeners(this.value, oldValue, true);
    }

    /**
     * Add an internal listener that is called when the value of the attribute changes. The listener is called with the
     * new value and the version number.
     */
    override addValueChangeListener(listener: (value: T, version: number) => void) {
        this.valueChangeListeners.push(listener);
    }

    /**
     * Remove an internal listener.
     */
    override removeValueChangeListener(listener: (value: T, version: number) => void) {
        const entryIndex = this.valueChangeListeners.indexOf(listener);
        if (entryIndex !== -1) {
            this.valueChangeListeners.splice(entryIndex, 1);
        }
    }

    /**
     * Add an external listener that is called when the value of the attribute changes. The listener is called with the
     * new value and the old value.
     */
    override addValueSetListener(listener: (newValue: T, oldValue: T) => void) {
        this.valueSetListeners.push(listener);
    }

    /**
     * Add an external listener that is called when the value of the attribute changes. The listener is called with the
     * new value and the old value. This method is a convenient alias for addValueSetListener.
     */
    override subscribe(listener: (newValue: T, oldValue: T) => void) {
        this.addValueSetListener(listener);
    }

    /**
     * Remove an external listener.
     */
    override removeValueSetListener(listener: (newValue: T, oldValue: T) => void) {
        const entryIndex = this.valueSetListeners.indexOf(listener);
        if (entryIndex !== -1) {
            this.valueSetListeners.splice(entryIndex, 1);
        }
    }
}

/**
 * Attribute server which is getting and setting the value for a defined fabric. The values are automatically persisted
 * on fabric level if no custom getter or setter is defined.
 */
export class FabricScopedAttributeServer<T> extends AttributeServer<T> {
    private readonly fabricSensitiveElementsToRemove = new Array<string>();

    constructor(
        id: AttributeId,
        name: string,
        readAcl: AccessLevel | undefined,
        writeAcl: AccessLevel | undefined,
        schema: TlvSchema<T>,
        isWritable: boolean,
        isSubscribable: boolean,
        requiresTimedInteraction: boolean,
        initValue: T,
        defaultValue: T | undefined,
        readonly cluster: Cluster<any, any, any, any, any>,
        datasource: ClusterDatasource,
        getter?: (session?: Session, endpoint?: Endpoint, isFabricFiltered?: boolean) => T,
        setter?: (value: T, session?: Session, endpoint?: Endpoint, message?: Message) => boolean,
        validator?: (value: T, session?: Session, endpoint?: Endpoint) => void,
    ) {
        if (
            isWritable &&
            (getter === undefined || setter === undefined) &&
            !(getter === undefined && setter === undefined)
        ) {
            throw new ImplementationError(
                `Getter and setter must be implemented together for writeable fabric scoped attribute "${name}".`,
            );
        }

        if (getter === undefined) {
            getter = (session, _endpoint, isFabricFiltered) => {
                if (session === undefined)
                    throw new FabricScopeError(`Session is required for fabric scoped attribute ${name}`);

                if (isFabricFiltered === true) {
                    SecureSession.assert(session);
                    return this.getLocalForFabric(session.associatedFabric);
                } else {
                    const values = new Array<any>();
                    for (const fabric of datasource.fabrics) {
                        const value = this.getLocalForFabric(fabric);
                        if (!Array.isArray(value)) {
                            throw new FabricScopeError(
                                `Fabric scoped attribute "${name}" can only be read for all fabrics if they are arrays.`,
                            );
                        }
                        values.push(...value);
                    }
                    return values as T;
                }
            };
        }

        if (setter === undefined) {
            setter = () => {
                throw new ImplementationError("Legacy FabricScopedAttributeServer data set is not supported anymore.");
            };
        }

        super(
            id,
            name,
            readAcl,
            writeAcl,
            schema,
            isWritable,
            isSubscribable,
            requiresTimedInteraction,
            initValue,
            defaultValue,
            datasource,
            getter,
            setter,
            validator,
        );

        this.#determineSensitiveFieldsToRemove();
    }

    #determineSensitiveFieldsToRemove() {
        const clusterFromModel = MatterModel.standard.get(ClusterModel, this.cluster.id);
        if (clusterFromModel === undefined) {
            logger.debug(`${this.cluster.name}: Cluster for Fabric scoped element not found in Model, ignore`);
            return;
        }
        const attributeFromModel = clusterFromModel.get(AttributeModel, this.id);
        if (attributeFromModel === undefined) {
            logger.debug(
                `${this.cluster.name}.${this.id}: Attribute for Fabric scoped element not found in Model, ignore`,
            );
            return;
        }
        if (!attributeFromModel.fabricScoped) {
            logger.debug(`${this.cluster.name}.${this.id}: Attribute is not Fabric scoped in model, ignore`);
            return;
        }
        if (attributeFromModel.children.length !== 1) {
            logger.debug(`${this.cluster.name}.${this.id}: Attribute has not exactly one child, ignore`);
            return;
        }
        const type = attributeFromModel.children[0].type;
        if (type === undefined) {
            logger.debug(`${this.cluster.name}.${this.id}: Attribute field has no type, ignore`);
            return;
        }
        const dataType = clusterFromModel.get(DatatypeModel, type);
        if (dataType === undefined) {
            logger.debug(`${this.cluster.name}.${this.id}: DataType ${type} not found in model, ignore`);
            return;
        }
        dataType.children
            .filter(field => field.fabricSensitive)
            .forEach(field => this.fabricSensitiveElementsToRemove.push(camelize(field.name)));
    }

    override get hasFabricSensitiveData() {
        return this.fabricSensitiveElementsToRemove.length > 0;
    }

    /**
     * Sanitize the value of the attribute by removing fabric sensitive fields that do not belong to the
     * associated fabric
     */
    sanitizeFabricSensitiveFields(value: T, associatedFabric?: Fabric) {
        if (this.fabricSensitiveElementsToRemove.length && Array.isArray(value)) {
            // Get the associated Fabric Index or uses -1 when no Fabric is associated because this value will
            // never be in the struct
            const associatedFabricIndex = associatedFabric?.fabricIndex ?? -1;
            return value.map(data => {
                if (data[FabricIndexName] !== associatedFabricIndex) {
                    const result = { ...data };
                    this.fabricSensitiveElementsToRemove.forEach(fieldName => delete result[fieldName]);
                    return result;
                }
                return data;
            });
        }
        return value;
    }

    /**
     * Initialize the attribute with a value. Because the value is stored on fabric level this method only initializes
     * the version number.
     */
    override init(value: T | undefined) {
        if (value !== undefined) {
            throw new InternalError(`Cannot initialize fabric scoped attribute "${this.name}" with a value.`);
        }
    }

    /**
     * Fabric scoped enhancement of set to allow setting special fabricindex locally.
     */
    override set(value: T, session: Session, message: Message, delayChangeEvents = false, preserveFabricIndex = false) {
        if (!this.isWritable) {
            throw new StatusResponseError(`Attribute "${this.name}" is not writable.`, StatusCode.UnsupportedWrite);
        }

        this.setRemote(value, session, message, delayChangeEvents, preserveFabricIndex);
    }

    /**
     * Method that contains the logic to set a value "from remote" (e.g. from a client). For Fabric scoped attributes
     * we need to inject the fabric index into the value.
     */
    protected override setRemote(
        value: T,
        session: Session,
        message: Message,
        delayChangeEvents = false,
        preserveFabricIndex = false,
    ) {
        // Inject fabric index into structures in general if undefined, if set it will be used
        value = this.schema.injectField(
            value,
            <number>FabricIndex.id,
            session.associatedFabric.fabricIndex,
            () => !preserveFabricIndex, // No one should send any index and if we simply SHALL ignore it,  but internally we might need it
        );
        logger.info(
            `Set remote value for fabric scoped attribute "${this.name}" to ${serialize(value)} (delayed=${delayChangeEvents})`,
        );

        super.setRemote(value, session, message, delayChangeEvents);
    }

    /**
     * Set Local is not allowed for fabric scoped attributes. Use setLocalForFabric instead.
     */
    override setLocal(_value: T) {
        throw new FabricScopeError(
            `Fabric scoped attribute "${this.name}" can only be set locally by providing a Fabric. Use setLocalForFabric instead.`,
        );
    }

    /**
     * Set the value of the attribute locally for a fabric. This method should be used locally in the code and does not
     * include the ACL check.
     * If a setter is defined this method cannot be used!
     * If a validator is defined the value is validated before it is stored.
     * Listeners are called when the value changes (internal listeners) or in any case (external listeners).
     */
    setLocalForFabric(_value: T, _fabric: Fabric) {
        throw new ImplementationError("Legacy FabricScopedAttributeServer data write is not supported anymore.");
    }

    /**
     * When the value is handled by getter or setter methods and is changed by other processes and no session from the
     * originating process is known this method can be used to notify the attribute server that the value has changed.
     * This will increase the version number and trigger the listeners.
     * ACL checks needs to be performed before calling this method.
     */
    updatedLocalForFabric(fabric: Fabric) {
        const oldValue = this.value ?? this.defaultValue;
        try {
            this.value = this.getLocalForFabric(fabric);
        } catch (e) {
            FabricScopeError.accept(e);

            if (this.value === undefined) {
                this.value = this.defaultValue;
            }
        }
        this.handleVersionAndTriggerListeners(this.value, oldValue, true);
    }

    /**
     * Get the value of the attribute locally for a special Fabric. This method should be used locally in the code and
     * does not include the ACL check.
     * If a getter is defined this method returns an error and the value should be retrieved directly internally.
     */
    getLocalForFabric(_fabric: Fabric): T {
        throw new ImplementationError("Legacy FabricScopedAttributeServer data read is not supported anymore.");
    }
}
