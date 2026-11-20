// RBAC-1…RBAC-8 — pending acceptance for REQ-046 (custom per-club roles).
//
// The feature is not built. These are registered with `test.todo` so the test
// runner reports them as TODO, not as passing coverage and not as a red build.
// When the implementation starts, replace each `test.todo` with a real `test`;
// the assertion text below is the definition of done.
import test from 'node:test';

test.todo('RBAC-1 create a custom role with a capability subset; duplicate 409, reserved 422, audit row');
test.todo('RBAC-2 admin seeds all ten capabilities, gatekeeper exactly operate_gate, built-ins immutable');
test.todo('RBAC-3 assignment writes membership + claim; access equals capabilities; Customer removes membership');
test.todo('RBAC-4 no capability escalation, no self-demotion, last manage_staff holder protected');
test.todo('RBAC-5 cross-tenant role read/write returns 404/23503/42501 and leaks no row');
test.todo('RBAC-6 authorization is capability-driven; no literal admin/gatekeeper authority branch');
test.todo('RBAC-7 claim-write failure restores membership; change applies at next token refresh');
test.todo('RBAC-8 Users lists club roles + Customer; Roles validates; docs stay open until 1-7 pass');
