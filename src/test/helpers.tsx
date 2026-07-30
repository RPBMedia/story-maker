/** Shared test scaffolding: renders the app (or a fragment) with router and
 * project state, plus a REACTIVE mocked auth store so tests can simulate a
 * real sign-in/sign-out transition mid-test (not just a fixed status).
 *
 * Usage in a test file:
 *
 *   vi.mock("../auth/AuthContext", async () => {
 *     const actual = await vi.importActual("../auth/AuthContext");
 *     return { ...actual, useAuth: useMockAuth };
 *   });
 *
 *   beforeEach(() => resetMockAuth("signed-out"));
 *   ...
 *   setMockAuthState({ status: "signed-in", userId: "u1", email: "a@b.c", profile: null });
 */
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useSyncExternalStore } from "react";
import { vi } from "vitest";
import type { ReactNode } from "react";
// NOTE: helpers must NOT import PlanContext (or anything else that imports
// AuthContext): the vi.mock("../auth/AuthContext") factories in test files
// `await import` THIS module, so a static chain helpers → PlanContext →
// AuthContext would deadlock module resolution. Tests that need the real
// PlanProvider wrap it themselves (its usePlan falls back to the free plan
// when absent).
import { ProjectProvider } from "../state/ProjectContext";
import type { AuthState } from "../types";
import type { AuthApi } from "../features/auth/AuthContext";

function defaultAuthState(status: AuthState["status"]): AuthState {
  return {
    status,
    userId: status === "signed-in" ? "user-1" : null,
    email: status === "signed-in" ? "rui@example.com" : null,
    profile: null,
  };
}

let mockAuth: AuthState = defaultAuthState("signed-out");
/** When set, the next signInWithPassword/signUpWithPassword call returns
 * this error instead of succeeding, then clears itself. */
let mockAuthError: string | null = null;
const listeners = new Set<() => void>();

/** STABLE spies shared across every render, so a test can assert e.g.
 * "signInWithOAuth was never called just from opening the gate". Recreated
 * on resetMockAuth() so call counts don't leak between tests. */
export let authSpies = makeAuthSpies();

function makeAuthSpies() {
  return {
    signInWithPassword: vi.fn(async (): Promise<string | null> => {
      if (mockAuthError) {
        const err = mockAuthError;
        mockAuthError = null;
        return err;
      }
      setMockAuthState(defaultAuthState("signed-in"));
      return null;
    }),
    signUpWithPassword: vi.fn(async (): Promise<string | null> => {
      if (mockAuthError) {
        const err = mockAuthError;
        mockAuthError = null;
        return err;
      }
      setMockAuthState(defaultAuthState("signed-in"));
      return null;
    }),
    signInWithOAuth: vi.fn(async (): Promise<string | null> => null),
    requestPasswordReset: vi.fn(async (): Promise<string | null> => null),
    updatePassword: vi.fn(async (): Promise<string | null> => null),
    signOut: vi.fn(async () => {
      setMockAuthState(defaultAuthState("signed-out"));
    }),
    reloadProfile: vi.fn(async () => {}),
  };
}

function notify() {
  listeners.forEach((l) => l());
}

/** Reset the shared mock auth store AND the spy call history. */
export function resetMockAuth(status: AuthState["status"] = "signed-out") {
  mockAuth = defaultAuthState(status);
  mockAuthError = null;
  authSpies = makeAuthSpies();
  notify();
}

/** Make the next sign-in/sign-up attempt fail with this message. */
export function setMockAuthError(message: string) {
  mockAuthError = message;
}

/** Push a full custom auth state (e.g. a specific email/profile). */
export function setMockAuthState(next: AuthState) {
  mockAuth = next;
  notify();
}

/** Shared reactive hook: every component calling useAuth() in a test render
 * tree sees the SAME store and the SAME stable spies, so signing in from one
 * component (e.g. the account gate's form) is visible to another (e.g.
 * ExportStage) and call counts are assertable — exactly like the real
 * Supabase-backed context, without needing a live backend. */
export function useMockAuth(): AuthApi {
  const auth = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => mockAuth,
  );

  return {
    auth,
    loading: auth.status === "loading",
    session: null,
    ...authSpies,
  };
}

/** Legacy-style one-shot factory, kept for tests that only need a fixed,
 * non-reactive status for the whole test (no sign-in/out transitions). */
export function makeAuthApi(status: AuthState["status"]): AuthApi {
  const auth = defaultAuthState(status);
  return {
    auth,
    loading: auth.status === "loading",
    session: null,
    signInWithPassword: vi.fn(async () => null),
    signUpWithPassword: vi.fn(async () => null),
    signInWithOAuth: vi.fn(async () => null),
    requestPasswordReset: vi.fn(async () => null),
    updatePassword: vi.fn(async () => null),
    signOut: vi.fn(async () => undefined),
    reloadProfile: vi.fn(async () => {}),
  };
}

export function renderWithProviders(
  ui: ReactNode,
  { route = "/" }: { route?: string } = {},
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ProjectProvider>{ui}</ProjectProvider>
    </MemoryRouter>,
  );
}
