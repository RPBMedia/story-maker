/** OAuth buttons: verify the popup-flow contract — success calls onSuccess
 * (so the caller can close the gate / navigate while the main window, and the
 * whole in-memory project, is preserved), cancellation is silent, a blocked
 * popup produces guidance, and a real error is surfaced.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OAuthButtons } from "./AuthForms";
import {
  OAUTH_CANCELLED,
  OAUTH_POPUP_BLOCKED,
  type AuthApi,
} from "./AuthContext";

// config must look configured so the buttons aren't disabled.
vi.mock("../../config/env", async () => {
  const actual =
    await vi.importActual<typeof import("../../config/env")>("../../config/env");
  return {
    ...actual,
    config: { ...actual.config, authConfigured: true, missingEnvVars: [] },
  };
});

let oauthResult: string | null = null;
const signInWithOAuth = vi.fn(async () => oauthResult);

vi.mock("./AuthContext", async () => {
  const actual =
    await vi.importActual<typeof import("./AuthContext")>("./AuthContext");
  return {
    ...actual,
    useAuth: (): AuthApi =>
      ({
        signInWithOAuth,
      }) as unknown as AuthApi,
  };
});

beforeEach(() => {
  oauthResult = null;
  signInWithOAuth.mockClear();
});

describe("OAuthButtons popup flow", () => {
  it("calls onSuccess after a successful popup sign-in (no navigation away)", async () => {
    oauthResult = null; // success
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const user = userEvent.setup();
    render(<OAuthButtons onError={onError} onSuccess={onSuccess} />);
    await user.click(screen.getByRole("button", { name: /Continue with Google/ }));
    expect(signInWithOAuth).toHaveBeenCalledWith("google");
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("stays silent when the user cancels (closes the popup)", async () => {
    oauthResult = OAUTH_CANCELLED;
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const user = userEvent.setup();
    render(<OAuthButtons onError={onError} onSuccess={onSuccess} />);
    await user.click(screen.getByRole("button", { name: /Continue with Apple/ }));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("guides the user when the popup is blocked", async () => {
    oauthResult = OAUTH_POPUP_BLOCKED;
    const onError = vi.fn();
    const user = userEvent.setup();
    render(<OAuthButtons onError={onError} onSuccess={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /Continue with Google/ }));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/allow popups/i);
  });

  it("surfaces a real error message", async () => {
    oauthResult = "This sign-in method isn't configured yet on the server.";
    const onError = vi.fn();
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(<OAuthButtons onError={onError} onSuccess={onSuccess} />);
    await user.click(screen.getByRole("button", { name: /Continue with Google/ }));
    expect(onError).toHaveBeenCalledWith(
      "This sign-in method isn't configured yet on the server.",
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
