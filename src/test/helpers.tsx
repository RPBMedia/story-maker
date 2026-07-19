/** Shared test scaffolding: renders the app (or a fragment) with router,
 * project state, and a MOCKED auth context so tests control the session. */
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import type { ReactNode } from "react";
import { ProjectProvider } from "../state/ProjectContext";
import type { AuthState } from "../types";
import type { AuthApi } from "../features/auth/AuthContext";

export function makeAuthApi(status: AuthState["status"]): AuthApi {
  return {
    auth: {
      status,
      userId: status === "signed-in" ? "user-1" : null,
      email: status === "signed-in" ? "rui@example.com" : null,
      profile: null,
    },
    signInWithPassword: vi.fn(async () => null),
    signUpWithPassword: vi.fn(async () => null),
    signInWithOAuth: vi.fn(async () => null),
    requestPasswordReset: vi.fn(async () => null),
    updatePassword: vi.fn(async () => null),
    signOut: vi.fn(async () => undefined),
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
