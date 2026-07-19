/** Account gating + render-time communication tests. AuthContext is mocked
 * per-test via the module mock; the project store is real. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthApi } from "../auth/AuthContext";
import { makeAuthApi, renderWithProviders } from "../../test/helpers";
import { ExportStage } from "./ExportStage";
import { useProject } from "../../state/ProjectContext";
import type { AudioTrack, ImageMediaItem } from "../../types";
import { useEffect } from "react";

let authApi: AuthApi;
vi.mock("../auth/AuthContext", async () => {
  const actual = await vi.importActual("../auth/AuthContext");
  return {
    ...actual,
    useAuth: () => authApi,
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
});

describe("export gating", () => {
  it("anonymous users see the account gate instead of starting a render", async () => {
    authApi = makeAuthApi("signed-out");
    const user = userEvent.setup();
    renderWithProviders(<SeededExport />);
    await user.click(
      await screen.findByRole("button", { name: "Generate Video" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog.textContent).toMatch(/Create a free account/i);
    expect(dialog.textContent).toMatch(/project stays right here/i);
  });

  it("the gate can always be closed and the project remains", async () => {
    authApi = makeAuthApi("signed-out");
    const user = userEvent.setup();
    renderWithProviders(<SeededExport />);
    await user.click(
      await screen.findByRole("button", { name: "Generate Video" }),
    );
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    // project still valid: generate button still present, no blockers
    expect(screen.getByRole("button", { name: "Generate Video" })).toBeTruthy();
  });

  it("a loading session is NOT treated as signed in", async () => {
    authApi = makeAuthApi("loading");
    const user = userEvent.setup();
    renderWithProviders(<SeededExport />);
    await user.click(
      await screen.findByRole("button", { name: "Generate Video" }),
    );
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("signed-in users get the render confirmation instead of the gate", async () => {
    authApi = makeAuthApi("signed-in");
    const user = userEvent.setup();
    renderWithProviders(<SeededExport />);
    // signed-in + valid project -> confirmation panel is shown directly
    expect(await screen.findByText("Ready to render?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start Rendering" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Go Back" }));
  });

  it("unconfigured auth shows an explanation and disables export", async () => {
    authApi = makeAuthApi("unconfigured");
    renderWithProviders(<SeededExport />);
    expect(
      (await screen.findAllByText(/not configured/i)).length,
    ).toBeGreaterThan(0);
    const btn = screen.getByRole("button", {
      name: "Generate Video",
    }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe("render-time communication", () => {
  it("the export screen shows the 5–15 minute expectation prominently", async () => {
    authApi = makeAuthApi("signed-out");
    renderWithProviders(<SeededExport />);
    expect(
      await screen.findByText(/usually takes around 5–15 minutes/i),
    ).toBeTruthy();
    expect(screen.getByText(/Keep this tab open/i)).toBeTruthy();
  });

  it("the confirmation panel includes the expected render time", async () => {
    authApi = makeAuthApi("signed-in");
    renderWithProviders(<SeededExport />);
    expect(await screen.findByText("Ready to render?")).toBeTruthy();
    expect(screen.getByText("Expected time")).toBeTruthy();
  });

  it("beforeunload protection is active only while rendering", async () => {
    authApi = makeAuthApi("signed-in");
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
    authApi = makeAuthApi("signed-out");
    const { ReviewStage } = await import("../project/ReviewStage");
    renderWithProviders(<ReviewStage onGenerate={() => {}} />);
    await waitFor(() =>
      expect(
        screen.getByText(/usually takes around 5–15 minutes/i),
      ).toBeTruthy(),
    );
  });
});
