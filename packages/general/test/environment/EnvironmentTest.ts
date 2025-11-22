/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment } from "#environment/Environment.js";
import { Environmental } from "#environment/Environmental.js";

class TestService {
    static [Environmental.create](environment: Environment) {
        return environment.get(TestService);
    }

    closed = false;

    close() {
        this.closed = true;
    }
}

class AnotherService {
    static [Environmental.create](environment: Environment) {
        return environment.get(AnotherService);
    }

    closed = false;

    close() {
        this.closed = true;
    }
}

describe("Environment", () => {
    describe("basic service management", () => {
        it("creates and retrieves a service", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            expect(env.get(TestService)).to.equal(service);
        });

        it("has() returns true for existing service", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            expect(env.has(TestService)).to.be.true;
        });

        it("has() returns false for non-existing service", () => {
            const env = new Environment("test");

            expect(env.has(TestService)).to.be.false;
        });

        it("owns() returns true for directly owned service", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            expect(env.owns(TestService)).to.be.true;
        });

        it("owns() returns false for inherited service", () => {
            const parent = new Environment("parent");
            const child = new Environment("child", parent);
            const service = new TestService();
            parent.set(TestService, service);

            expect(child.has(TestService)).to.be.true;
            expect(child.owns(TestService)).to.be.false;
        });

        it("deletes a service", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            env.delete(TestService);

            expect(env.has(TestService)).to.be.false;
        });

        it("closes a service", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            env.close(TestService);

            expect(service.closed).to.be.true;
            expect(env.has(TestService)).to.be.false;
        });
    });

    describe("participant tracking - get()", () => {
        it("tracks a single participant and returns same instance", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);
            const participant1 = { name: "participant1" };

            const retrieved = env.get(TestService, participant1);

            expect(retrieved).to.equal(service);
            expect(retrieved).to.be.instanceOf(TestService);
        });

        it("tracks multiple participants and returns same instance for each", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);
            const participant1 = { name: "participant1" };
            const participant2 = { name: "participant2" };

            const retrieved1 = env.get(TestService, participant1);
            const retrieved2 = env.get(TestService, participant2);

            // Both should return the exact same instance
            expect(retrieved1).to.equal(service);
            expect(retrieved2).to.equal(service);
            expect(env.has(TestService)).to.be.true;
        });

        it("allows getting service without participant and returns same instance", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            const retrieved = env.get(TestService);

            expect(retrieved).to.equal(service);
            expect(retrieved).to.be.instanceOf(TestService);
        });

        it("enforces consistent participant mode - cannot mix with and without", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);
            const participant1 = { name: "participant1" };

            // First access without participant sets mode to "without"
            const retrieved1 = env.get(TestService);
            expect(retrieved1).to.equal(service);

            // Second access with participant should throw
            expect(() => env.get(TestService, participant1)).to.throw(
                /was initialized without participants but is being accessed with participants/,
            );
        });

        it("returns same instance on repeated get with same participant", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);
            const participant1 = { name: "participant1" };

            const retrieved1 = env.get(TestService, participant1);
            const retrieved2 = env.get(TestService, participant1);
            const retrieved3 = env.get(TestService, participant1);

            // All should return the exact same instance
            expect(retrieved1).to.equal(service);
            expect(retrieved2).to.equal(service);
            expect(retrieved3).to.equal(service);
        });

        it("returns same instance when getting without participant multiple times", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            const retrieved1 = env.get(TestService);
            const retrieved2 = env.get(TestService);
            const retrieved3 = env.get(TestService);

            // All should return the exact same instance
            expect(retrieved1).to.equal(service);
            expect(retrieved2).to.equal(service);
            expect(retrieved3).to.equal(service);
        });
    });

    describe("participant tracking - delete()", () => {
        it("does not delete service when participants remain", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);
            const participant1 = { name: "participant1" };
            const participant2 = { name: "participant2" };

            env.get(TestService, participant1);
            env.get(TestService, participant2);

            // Delete for one participant
            env.delete(TestService, undefined, participant1);

            // Service should still exist
            expect(env.has(TestService)).to.be.true;
            expect(service.closed).to.be.false;
        });

        it("deletes service when last participant is removed", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);
            const participant1 = { name: "participant1" };
            const participant2 = { name: "participant2" };

            env.get(TestService, participant1);
            env.get(TestService, participant2);

            // Delete both participants
            env.delete(TestService, undefined, participant1);
            env.delete(TestService, undefined, participant2);

            // Service should be deleted
            expect(env.has(TestService)).to.be.false;
        });

        it("deletes service immediately without participant tracking", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            env.delete(TestService);

            expect(env.has(TestService)).to.be.false;
        });

        it("blocks service but doesn't emit event if instance doesn't match", () => {
            const env = new Environment("test");
            const service = new TestService();
            const otherService = new TestService();
            let deletedEmitted = false;

            env.set(TestService, service);

            env.deleted.on(() => {
                deletedEmitted = true;
            });

            // Try to delete with wrong instance
            env.delete(TestService, otherService);

            // Service is blocked (has() returns false) but deleted event not emitted
            expect(env.has(TestService)).to.be.false;
            expect(deletedEmitted).to.be.false;
            expect(service.closed).to.be.false; // Service not actually closed
        });

        it("deletes and emits event with correct instance", () => {
            const env = new Environment("test");
            const service = new TestService();
            let deletedEmitted = false;

            env.set(TestService, service);

            env.deleted.on((type, instance) => {
                if (type === TestService && instance === service) {
                    deletedEmitted = true;
                }
            });

            env.delete(TestService, undefined, service);

            expect(env.has(TestService)).to.be.false;
            expect(deletedEmitted).to.be.true;
        });
    });

    describe("participant tracking - close()", () => {
        it("does not close service when participants remain", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);
            const participant1 = { name: "participant1" };
            const participant2 = { name: "participant2" };

            env.get(TestService, participant1);
            env.get(TestService, participant2);

            // Close for one participant
            env.close(TestService, participant1);

            // Service should still exist and not be closed
            expect(env.has(TestService)).to.be.true;
            expect(service.closed).to.be.false;
        });

        it("closes service when last participant is removed", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);
            const participant1 = { name: "participant1" };
            const participant2 = { name: "participant2" };

            env.get(TestService, participant1);
            env.get(TestService, participant2);

            // Close both participants
            env.close(TestService, participant1);
            env.close(TestService, participant2);

            // Service should be closed and deleted
            expect(service.closed).to.be.true;
            expect(env.has(TestService)).to.be.false;
        });

        it("closes service immediately without participant tracking", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            env.close(TestService);

            expect(service.closed).to.be.true;
            expect(env.has(TestService)).to.be.false;
        });

        it("handles closing service without close method", () => {
            class SimpleService {
                static [Environmental.create](environment: Environment) {
                    return environment.get(SimpleService);
                }
            }

            const env = new Environment("test");
            const service = new SimpleService();
            env.set(SimpleService, service);

            // Should not throw
            env.close(SimpleService);

            expect(env.has(SimpleService)).to.be.false;
        });
    });

    describe("participant tracking - mixed scenarios", () => {
        it("handles participant added multiple times", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);
            const participant1 = { name: "participant1" };

            // Add same participant multiple times
            env.get(TestService, participant1);
            env.get(TestService, participant1);
            env.get(TestService, participant1);

            // Should only need to remove once (Set behavior)
            env.close(TestService, participant1);

            expect(service.closed).to.be.true;
        });

        it("handles participant removal when not tracked", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);
            const participant1 = { name: "participant1" };

            // Try to remove participant that was never added
            env.delete(TestService, undefined, participant1);

            // Service should be marked as deleted but not closed
            expect(env.has(TestService)).to.be.false;
        });

        it("tracks participants across multiple services independently", () => {
            const env = new Environment("test");
            const service1 = new TestService();
            const service2 = new AnotherService();
            env.set(TestService, service1);
            env.set(AnotherService, service2);

            const participant1 = { name: "participant1" };

            env.get(TestService, participant1);
            env.get(AnotherService, participant1);

            // Close service1 for participant1
            env.close(TestService, participant1);

            // service1 should be closed, service2 should not
            expect(service1.closed).to.be.true;
            expect(service2.closed).to.be.false;
            expect(env.has(TestService)).to.be.false;
            expect(env.has(AnotherService)).to.be.true;
        });
    });

    describe("service events", () => {
        it("emits added event when service is set", () => {
            const env = new Environment("test");
            const service = new TestService();
            let addedEmitted = false;

            env.added.on((type, instance) => {
                if (type === TestService && instance === service) {
                    addedEmitted = true;
                }
            });

            env.set(TestService, service);

            expect(addedEmitted).to.be.true;
        });

        it("emits deleted event when service is deleted", () => {
            const env = new Environment("test");
            const service = new TestService();
            let deletedEmitted = false;

            env.set(TestService, service);

            env.deleted.on((type, instance) => {
                if (type === TestService && instance === service) {
                    deletedEmitted = true;
                }
            });

            env.delete(TestService);

            expect(deletedEmitted).to.be.true;
        });

        it("does not emit deleted event when participants remain", () => {
            const env = new Environment("test");
            const service = new TestService();
            const participant1 = { name: "participant1" };
            const participant2 = { name: "participant2" };
            let deletedEmitted = false;

            env.set(TestService, service);
            env.get(TestService, participant1);
            env.get(TestService, participant2);

            env.deleted.on(() => {
                deletedEmitted = true;
            });

            env.delete(TestService, undefined, participant1);

            expect(deletedEmitted).to.be.false;
        });
    });

    describe("service inheritance", () => {
        it("inherits services from parent and returns same instance", () => {
            const parent = new Environment("parent");
            const child = new Environment("child", parent);
            const service = new TestService();
            parent.set(TestService, service);

            const retrieved = child.get(TestService);

            expect(retrieved).to.equal(service);
            expect(retrieved).to.be.instanceOf(TestService);
        });

        it("tracks participants in parent service and returns same instance", () => {
            const parent = new Environment("parent");
            const child = new Environment("child", parent);
            const service = new TestService();
            parent.set(TestService, service);

            const participant1 = { name: "participant1" };
            const participant2 = { name: "participant2" };

            // Get from child with participants
            const retrieved1 = child.get(TestService, participant1);
            const retrieved2 = child.get(TestService, participant2);

            // Should return the same instance from parent
            expect(retrieved1).to.equal(service);
            expect(retrieved2).to.equal(service);
            expect(retrieved1).to.equal(retrieved2);

            // Delete from parent should track participants
            parent.delete(TestService, undefined, participant1);
            expect(parent.has(TestService)).to.be.true; // Still has participant2

            parent.delete(TestService, undefined, participant2);
            expect(parent.has(TestService)).to.be.false;
        });

        it("returns same instance when child and parent both get service", () => {
            const parent = new Environment("parent");
            const child = new Environment("child", parent);
            const service = new TestService();
            parent.set(TestService, service);

            const fromParent1 = parent.get(TestService);
            const fromChild1 = child.get(TestService);
            const fromParent2 = parent.get(TestService);
            const fromChild2 = child.get(TestService);

            // All should return the exact same instance
            expect(fromParent1).to.equal(service);
            expect(fromChild1).to.equal(service);
            expect(fromParent2).to.equal(service);
            expect(fromChild2).to.equal(service);
            expect(fromParent1).to.equal(fromChild1);
            expect(fromChild1).to.equal(fromParent2);
            expect(fromParent2).to.equal(fromChild2);
        });

        it("child can override parent service with different instance", () => {
            const parent = new Environment("parent");
            const child = new Environment("child", parent);
            const parentService = new TestService();
            const childService = new TestService();

            parent.set(TestService, parentService);
            child.set(TestService, childService);

            const fromParent = parent.get(TestService);
            const fromChild = child.get(TestService);

            // Each environment should return its own instance
            expect(fromParent).to.equal(parentService);
            expect(fromChild).to.equal(childService);
            expect(fromParent).to.not.equal(fromChild);
        });

        it("tracks participants separately in parent and child when overridden", () => {
            const parent = new Environment("parent");
            const child = new Environment("child", parent);
            const parentService = new TestService();
            const childService = new TestService();

            parent.set(TestService, parentService);
            child.set(TestService, childService);

            const participant1 = { name: "participant1" };
            const participant2 = { name: "participant2" };

            const fromParent = parent.get(TestService, participant1);
            const fromChild = child.get(TestService, participant2);

            // Should return different instances
            expect(fromParent).to.equal(parentService);
            expect(fromChild).to.equal(childService);

            // Closing child's service shouldn't affect parent's
            child.close(TestService, participant2);
            expect(childService.closed).to.be.true;
            expect(parentService.closed).to.be.false;
            expect(parent.has(TestService)).to.be.true;
        });

        it("closes inherited service from child when all participants are removed from parent", () => {
            const parent = new Environment("parent");
            const child = new Environment("child", parent);
            const service = new TestService();
            parent.set(TestService, service);

            const participant1 = { name: "participant1" };
            const participant2 = { name: "participant2" };

            // Get from child with multiple participants - they're tracked in parent
            const retrieved1 = child.get(TestService, participant1);
            const retrieved2 = child.get(TestService, participant2);

            expect(retrieved1).to.equal(service);
            expect(retrieved2).to.equal(service);

            // Close from parent for first participant - service should remain
            parent.close(TestService, participant1);
            expect(service.closed).to.be.false;
            expect(parent.has(TestService)).to.be.true;
            expect(child.has(TestService)).to.be.true;

            // Close from parent for second participant - service should be closed
            parent.close(TestService, participant2);
            expect(service.closed).to.be.true;
            expect(parent.has(TestService)).to.be.false;
            expect(child.has(TestService)).to.be.false; // Child inherits parent's state
        });

        it("closes inherited service only when participants from all environments are removed", () => {
            const parent = new Environment("parent");
            const child = new Environment("child", parent);
            const service = new TestService();
            parent.set(TestService, service);

            const parentParticipant = { name: "parentParticipant" };
            const childParticipant1 = { name: "childParticipant1" };
            const childParticipant2 = { name: "childParticipant2" };

            // Get from both parent and child with participants
            parent.get(TestService, parentParticipant);
            child.get(TestService, childParticipant1);
            child.get(TestService, childParticipant2);

            // Close from child for first participant
            child.close(TestService, childParticipant1);
            expect(service.closed).to.be.false; // Still has other participants
            expect(parent.has(TestService)).to.be.true;

            // Close from child for second participant
            child.close(TestService, childParticipant2);
            expect(service.closed).to.be.false; // Still has parent participant
            expect(parent.has(TestService)).to.be.true;

            // Close from parent for last participant - now it should close
            parent.close(TestService, parentParticipant);
            expect(service.closed).to.be.true;
            expect(parent.has(TestService)).to.be.false;
        });

        it("allows closing inherited service from child without affecting parent participant tracking", () => {
            const parent = new Environment("parent");
            const child = new Environment("child", parent);
            const service = new TestService();
            parent.set(TestService, service);

            const parentParticipant = { name: "parentParticipant" };
            const childParticipant = { name: "childParticipant" };

            // Get from both environments
            parent.get(TestService, parentParticipant);
            const fromChild = child.get(TestService, childParticipant);

            expect(fromChild).to.equal(service);

            // Close from child with its participant
            child.close(TestService, childParticipant);

            // Service should not be closed (parent still has participant)
            expect(service.closed).to.be.false;
            expect(parent.has(TestService)).to.be.true;

            // Parent can still access it (must use participant mode consistently)
            const stillAvailable = parent.get(TestService, parentParticipant);
            expect(stillAvailable).to.equal(service);
        });

        it("properly tracks participants when getting from multiple child environments", () => {
            const parent = new Environment("parent");
            const child1 = new Environment("child1", parent);
            const child2 = new Environment("child2", parent);
            const service = new TestService();
            parent.set(TestService, service);

            const participant1 = { name: "participant1" };
            const participant2 = { name: "participant2" };
            const participant3 = { name: "participant3" };

            // Get from different environments with different participants
            parent.get(TestService, participant1);
            child1.get(TestService, participant2);
            child2.get(TestService, participant3);

            // Close from child1
            child1.close(TestService, participant2);
            expect(service.closed).to.be.false; // Still has other participants
            expect(parent.has(TestService)).to.be.true;

            // Close from child2
            child2.close(TestService, participant3);
            expect(service.closed).to.be.false; // Still has parent participant
            expect(parent.has(TestService)).to.be.true;

            // Close from parent - now it should close
            parent.close(TestService, participant1);
            expect(service.closed).to.be.true;
            expect(parent.has(TestService)).to.be.false;
        });

        it("blocks inheritance in child when closing without removing all participants", () => {
            const parent = new Environment("parent");
            const child = new Environment("child", parent);
            const service = new TestService();
            parent.set(TestService, service);

            const participant1 = { name: "participant1" };
            const participant2 = { name: "participant2" };

            // Get from child with participants
            child.get(TestService, participant1);
            child.get(TestService, participant2);

            // Close from child for one participant
            child.close(TestService, participant1);

            // Service not closed yet (still has participant2)
            expect(service.closed).to.be.false;
            expect(parent.has(TestService)).to.be.true;

            // But child still has it via remaining participant
            expect(child.has(TestService)).to.be.true;
            const stillAvailable = child.get(TestService, participant2);
            expect(stillAvailable).to.equal(service);
        });
    });

    describe("participant mode enforcement", () => {
        it("throws error when service set without participants is accessed with participant", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            // First access without participant - establishes "without" mode
            env.get(TestService);

            // Try to access with participant - should throw
            const participant = { name: "participant1" };
            expect(() => env.get(TestService, participant)).to.throw(
                "was initialized without participants but is being accessed with participants",
            );
        });

        it("throws error when service accessed with participant is then accessed without", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            // First access with participant - establishes "with" mode
            const participant = { name: "participant1" };
            env.get(TestService, participant);

            // Try to access without participant - should throw
            expect(() => env.get(TestService)).to.throw(
                "was initialized with participants but is being accessed without participants",
            );
        });

        it("throws error when deleting service with wrong participant mode", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            // Access without participant
            env.get(TestService);

            // Try to delete with participant - should throw
            const participant = { name: "participant1" };
            expect(() => env.delete(TestService, undefined, participant)).to.throw(
                "was initialized without participants but is being accessed with participants",
            );
        });

        it("throws error when closing service with wrong participant mode", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            // Access with participant
            const participant = { name: "participant1" };
            env.get(TestService, participant);

            // Try to close without participant - should throw
            expect(() => env.close(TestService)).to.throw(
                "was initialized with participants but is being accessed without participants",
            );
        });

        it("allows consistent participant mode usage throughout lifecycle", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            const participant1 = { name: "participant1" };
            const participant2 = { name: "participant2" };

            // Access with participants
            env.get(TestService, participant1);
            env.get(TestService, participant2);

            // Delete with participant
            env.delete(TestService, undefined, participant1);

            // Close with participant - should work fine
            env.close(TestService, participant2);

            expect(service.closed).to.be.true;
        });

        it("allows consistent non-participant mode usage throughout lifecycle", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            // Access without participant
            env.get(TestService);

            // Close without participant - should work fine
            env.close(TestService);

            expect(service.closed).to.be.true;
        });

        it("enforces mode across multiple get calls", () => {
            const env = new Environment("test");
            const service = new TestService();
            env.set(TestService, service);

            const participant = { name: "participant1" };

            // First access with participant
            env.get(TestService, participant);

            // Second access with participant - should work
            env.get(TestService, participant);

            // Third access without participant - should throw
            expect(() => env.get(TestService)).to.throw(
                "was initialized with participants but is being accessed without participants",
            );
        });
    });
});
