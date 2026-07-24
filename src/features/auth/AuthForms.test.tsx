import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthUnconfiguredNote, AccountUnavailableNotice } from "./AuthForms";

// Force the "unconfigured" state explicitly so this test is robust whether or
// not a developer has a real .env on disk (vitest loads .env via Vite).
vi.mock("../../config/env", async () => {
  const actual =
    await vi.importActual<typeof import("../../config/env")>("../../config/env");
  return {
    ...actual,
    config: {
      ...actual.config,
      authConfigured: false,
      missingEnvVars: ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"],
    },
  };
});

describe("AuthUnconfiguredNote", () => {
  it("in development mode, names the missing variables as a developer diagnostic", () => {
    // import.meta.env.DEV is true under vitest, and config is mocked
    // unconfigured above → the DEV developer-diagnostic branch renders.
    render(<AuthUnconfiguredNote />);
    const note = screen.getByRole("note");
    expect(note.textContent).toMatch(/Developer note/i);
    expect(note.textContent).toMatch(/VITE_SUPABASE_URL/);
    expect(note.textContent).toMatch(/VITE_SUPABASE_ANON_KEY/);
  });
});

describe("AccountUnavailableNotice", () => {
  it("renders the given calm message and a Retry action, never raw config text", () => {
    render(
      <AccountUnavailableNotice message="Account services are temporarily unavailable. Please try again shortly." />,
    );
    expect(screen.getByText(/temporarily unavailable/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByText(/VITE_SUPABASE/i)).toBeNull();
    expect(screen.queryByText(/environment variable/i)).toBeNull();
  });
});
