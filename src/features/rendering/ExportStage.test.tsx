/** Account gating, project preservation, and render-time communication.
 * Uses the reactive mock auth store (src/test/helpers.tsx) so a single test
 * can simulate a genuine sign-in transition and observe every consumer
 * (ExportStage + the nested gate's own forms) react to the SAME store,
 * exactly like the real Supabase-backed context would.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import {
  authSpies,
  renderWithProviders,
  resetMockAuth,
  setMockAuthError,
  setMockAuthState,
} from "../../test/helpers";
import { ExportStage } from "./ExportStage";
import { renderingService } from "../../services/rendering/RenderingService";
import { useProject } from "../../state/ProjectContext";
import type { AudioTrack, ImageMediaItem } from "../../types";

// vi.mock factories are hoisted above imports, so they can't close over an
// imported binding directly — dynamically import it inside the factory
// instead (https://vitest.dev/api/vi.html#vi-mock).
vi.mock("../auth/AuthContext", async () => {
  const actual = await vi.importActual("../auth/AuthContext");
  const { useMockAuth } = await import("../../test/helpers");
  return { ...actual, useAuth: useMockAuth };
});

// These tests simulate a WORKING, configured Supabase backend (auth state
// comes from the reactive mock above); AuthForms/AuthPages independently
// check config.authConfigured to disable their own submit buttons, so it
// must be forced true here too — otherwise every form appears disabled
// regardless of the mocked auth status, which would misrepresent a real
// "configured but signed-out" environment (the actual bug this feature
// fixes). The genuinely-unconfigured case is covered separately by
// ExportConfiguration.test.tsx and AuthForms.test.tsx.
vi.mock("../../config/env", async () => {
  const actual =
    await vi.importActual<typeof import("../../config/env")>("../../config/env");
  return {
    ...actual,
    config: {
      ...actual.config,
      authConfigured: true,
      missingEnvVars: [],
      // services/supabase.ts also reads these directly to construct its
      // client at import time — dummy-but-valid so createClient() doesn't
      // throw. No network call happens just from constructing the client.
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "test-anon-key",
    },
  };
});

function track(duration: number): AudioTrack {
  return {
    id: `a-${Math.random()}`,
    file: new File(["x"], "a.mp3"),
    name: "a.mp3",
    duration,
    size: 10,
    previewUrl: "blob:a",
  };
}
function image(): ImageMediaItem {
  return {
    id: `i-${Math.random()}`,
    kind: "image",
    file: new File(["x"], "i.png"),
    name: "i.png",
    size: 10,
    previewUrl: "blob:i",
    width: 10,
    height: 10,
  };
}

/** Seeds a minimal valid project into the store, then renders ExportStage. */
function SeededExport() {
  const { state, dispatch } = useProject();
  useEffect(() => {
    if (state.audioTracks.length === 0) {
      dispatch({ type: "add-audio", tracks: [track(10)] });
      dispatch({ type: "add-visual", items: [image()] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <ExportStage />;
}

beforeEach(() => {
  // jsdom's URL lacks the object-URL methods; add them without destroying
  // the constructor (new URL(...) is used elsewhere).
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  resetMockAuth("signed-out");
});

function outputDuration() {
  return screen.getByText("Output duration").nextSibling?.textContent;
}

describe("export gating", () => {
  it("signed-out users see an actionable (non-disabled) Generate Video button — not a dead end", async () => {
    renderWithProviders(<SeededExport />);
    const btn = (await screen.findByRole("button", {
      name: "Generate Video",
    })) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("pressing Generate Video opens the authentication gate", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SeededExport />);
    await user.click(
      await screen.findByRole("button", { name: "Generate Video" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/Create a free account/i);
    expect(dialog.textContent).toMatch(/remain in place/i);
  });

  it("the gate can always be closed and the project remains intact", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SeededExport />);
    const before = outputDuration();
    await user.click(
      await screen.findByRole("button", { name: "Generate Video" }),
    );
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Generate Video" })).toBeTruthy();
    expect(outputDuration()).toBe(before);
  });

  it("a loading session is NOT treated as signed in, and cannot start a render", async () => {
    resetMockAuth("loading");
    renderWithProviders(<SeededExport />);
    const btn = (await screen.findByRole("button", {
      name: /Checking your account/i,
    })) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("successful email/password sign-in closes the gate and enables Start Rendering", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SeededExport />);
    await user.click(
      await screen.findByRole("button", { name: "Generate Video" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Email"), "rui@example.com");
    await user.type(within(dialog).getByLabelText("Password"), "hunter2hunter");
    await user.type(
      within(dialog).getByLabelText("Confirm password"),
      "hunter2hunter",
    );
    await user.click(within(dialog).getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Ready to render?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start Rendering" })).toBeTruthy();
  });

  it("signing out blocks export again after being signed in", async () => {
    setMockAuthState({
      status: "signed-in",
      userId: "u1",
      email: "rui@example.com",
      profile: null,
    });
    renderWithProviders(<SeededExport />);
    expect(await screen.findByText("Ready to render?")).toBeTruthy();

    resetMockAuth("signed-out");
    await waitFor(() =>
      expect(screen.queryByText("Ready to render?")).toBeNull(),
    );
    expect(screen.getByRole("button", { name: "Generate Video" })).toBeTruthy();
  });

  it("authentication errors are shown and the project remains intact", async () => {
    const user = userEvent.setup();
    setMockAuthError("That email and password combination doesn't match.");
    renderWithProviders(<SeededExport />);
    const before = outputDuration();
    await user.click(
      await screen.findByRole("button", { name: "Generate Video" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("tab", { name: "Sign in" }));
    await user.type(within(dialog).getByLabelText("Email"), "rui@example.com");
    await user.type(within(dialog).getByLabelText("Password"), "wrong");
    await user.click(within(dialog).getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/doesn't match/i);
    // still signed out, gate still open, project untouched
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(outputDuration()).toBe(before);
  });

  it("unconfigured auth shows a calm notice with Retry, never a raw config warning, and disables Generate Video", async () => {
    resetMockAuth("unconfigured");
    renderWithProviders(<SeededExport />);
    expect(await screen.findByText(/temporarily unavailable/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.queryByText(/VITE_SUPABASE/i)).toBeNull();
    expect(screen.queryByText(/not configured/i)).toBeNull();
    const btn = screen.getByRole("button", {
      name: "Generate Video",
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe("project preservation through authentication", () => {
  it("email/password sign-in does not reset project state", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SeededExport />);
    const before = outputDuration();
    await user.click(
      await screen.findByRole("button", { name: "Generate Video" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("tab", { name: "Sign in" }));
    await user.type(within(dialog).getByLabelText("Email"), "rui@example.com");
    await user.type(within(dialog).getByLabelText("Password"), "hunter2hunter");
    await user.click(within(dialog).getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(outputDuration()).toBe(before);
  });

  it("creating an account does not reset project state", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SeededExport />);
    const before = outputDuration();
    await user.click(
      await screen.findByRole("button", { name: "Generate Video" }),
    );
    const dialog = await screen.findByRole("dialog"); // default tab: create account
    await user.type(within(dialog).getByLabelText("Email"), "rui@example.com");
    await user.type(within(dialog).getByLabelText("Password"), "hunter2hunter");
    await user.type(
      within(dialog).getByLabelText("Confirm password"),
      "hunter2hunter",
    );
    await user.click(within(dialog).getByRole("button", { name: "Create account" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(outputDuration()).toBe(before);
  });
});

describe("render-time communication", () => {
  it("the export screen shows the 5–15 minute expectation prominently", async () => {
    renderWithProviders(<SeededExport />);
    expect(
      await screen.findByText(/usually takes around 5–15 minutes/i),
    ).toBeTruthy();
    expect(screen.getByText(/Keep this tab open/i)).toBeTruthy();
  });

  it("the confirmation panel restates the expected render time", async () => {
    setMockAuthState({
      status: "signed-in",
      userId: "u1",
      email: "rui@example.com",
      profile: null,
    });
    renderWithProviders(<SeededExport />);
    const heading = await screen.findByText("Ready to render?");
    const panel = heading.closest(".confirm-panel")!;
    expect(within(panel as HTMLElement).getByText(/this usually takes/i)).toBeTruthy();
  });

  it("beforeunload protection is active only while rendering", async () => {
    setMockAuthState({
      status: "signed-in",
      userId: "u1",
      email: "rui@example.com",
      profile: null,
    });
    renderWithProviders(<SeededExport />);
    await screen.findByText("Ready to render?");
    // not rendering: beforeunload must NOT be prevented
    const ev = new Event("beforeunload", { cancelable: true });
    fireEvent(window, ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe("review screen communication", () => {
  it("shows the render-time panel", async () => {
    resetMockAuth("signed-out");
    const { ReviewStage } = await import("../project/ReviewStage");
    renderWithProviders(<ReviewStage onGenerate={() => {}} />);
    await waitFor(() =>
      expect(
        screen.getByText(/usually takes around 5–15 minutes/i),
      ).toBeTruthy(),
    );
  });
});

describe("no automatic authentication; explicit action only", () => {
  it("opening the gate calls NO authentication function (no auto/anonymous/mock sign-in)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SeededExport />);
    await user.click(
      await screen.findByRole("button", { name: "Generate Video" }),
    );
    await screen.findByRole("dialog");
    // The mere act of pressing Generate Video must not authenticate anyone.
    expect(authSpies.signInWithPassword).not.toHaveBeenCalled();
    expect(authSpies.signUpWithPassword).not.toHaveBeenCalled();
    expect(authSpies.signInWithOAuth).not.toHaveBeenCalled();
  });

  it("rendering does not begin while signed out", async () => {
    const renderSpy = vi
      .spyOn(renderingService, "render")
      .mockResolvedValue({
        url: "blob:out",
        blob: new Blob(),
        size: 10_000,
        duration: 10,
      });
    const user = userEvent.setup();
    renderWithProviders(<SeededExport />);
    await user.click(
      await screen.findByRole("button", { name: "Generate Video" }),
    );
    await screen.findByRole("dialog");
    expect(renderSpy).not.toHaveBeenCalled();
    renderSpy.mockRestore();
  });

  it("Google/Apple auth run ONLY when the user clicks them", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SeededExport />);
    await user.click(
      await screen.findByRole("button", { name: "Generate Video" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(authSpies.signInWithOAuth).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("button", { name: /Continue with Google/ }),
    );
    expect(authSpies.signInWithOAuth).toHaveBeenCalledTimes(1);
    expect(authSpies.signInWithOAuth).toHaveBeenCalledWith("google");
  });

  it("successful sign-in does NOT auto-start rendering; one explicit click is still required", async () => {
    const renderSpy = vi
      .spyOn(renderingService, "render")
      .mockResolvedValue({
        url: "blob:out",
        blob: new Blob(),
        size: 10_000,
        duration: 10,
      });
    const user = userEvent.setup();
    renderWithProviders(<SeededExport />);
    await user.click(
      await screen.findByRole("button", { name: "Generate Video" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Email"), "rui@example.com");
    await user.type(within(dialog).getByLabelText("Password"), "hunter2hunter");
    await user.type(
      within(dialog).getByLabelText("Confirm password"),
      "hunter2hunter",
    );
    await user.click(within(dialog).getByRole("button", { name: "Create account" }));

    // Gate closes, Start Rendering appears — but rendering has NOT begun.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const startBtn = await screen.findByRole("button", { name: "Start Rendering" });
    expect(renderSpy).not.toHaveBeenCalled();

    // Exactly one explicit click starts it.
    await user.click(startBtn);
    expect(renderSpy).toHaveBeenCalledTimes(1);
    renderSpy.mockRestore();
  });

  it("the 'Not now' action dismisses the gate and preserves the project", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SeededExport />);
    const before = outputDuration();
    await user.click(
      await screen.findByRole("button", { name: "Generate Video" }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(outputDuration()).toBe(before);
    expect(authSpies.signInWithPassword).not.toHaveBeenCalled();
  });
});
