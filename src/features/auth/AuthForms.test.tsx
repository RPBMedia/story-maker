import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AuthUnconfiguredNote, AccountUnavailableNotice } from "./AuthForms";

describe("AuthUnconfiguredNote", () => {
  it("in development mode, names the missing variables as a developer diagnostic", () => {
    // Vitest runs with import.meta.env.DEV === true by default, and no real
    // .env exists in this repo/test environment, so config.authConfigured
    // is false here — exercising the real default path.
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
