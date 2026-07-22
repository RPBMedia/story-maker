/** Signed-out (here: unconfigured, the real default test/dev environment
 * with no .env) users must be able to use the WHOLE editor — upload,
 * reorder, configure effects, and reach Export — without ever being forced
 * to authenticate. Only the actual render is account-gated (see
 * ExportStage.test.tsx). Uses the REAL AuthProvider (no mocking) so this
 * exercises the true default "no Supabase configured" path end to end.
 */
import { useEffect } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { App } from "../app/App";
import { ProjectProvider, useProject } from "../state/ProjectContext";
import { AuthProvider } from "./auth/AuthContext";
import type { AudioTrack, ImageMediaItem } from "../types";

function track(duration: number): AudioTrack {
  return {
    id: `a-${Math.random()}`,
    file: new File(["x"], "song.mp3"),
    name: "song.mp3",
    duration,
    size: 1000,
    previewUrl: "blob:a",
  };
}
function image(name: string): ImageMediaItem {
  return {
    id: `i-${Math.random()}`,
    kind: "image",
    file: new File(["x"], name),
    name,
    size: 1000,
    previewUrl: "blob:i",
    width: 100,
    height: 100,
  };
}

/** Seeds a minimal project so Review/Export are reachable, then renders the
 * real App inside the same ProjectProvider the seeding dispatched into. */
function SeededApp() {
  const { state, dispatch } = useProject();
  useEffect(() => {
    if (state.audioTracks.length === 0) {
      dispatch({ type: "add-audio", tracks: [track(20)] });
      dispatch({
        type: "add-visual",
        items: [image("one.png"), image("two.png")],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <App />;
}

function renderEditor() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ProjectProvider>
          <SeededApp />
        </ProjectProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function stepper() {
  return within(screen.getByRole("navigation", { name: "Project stages" }));
}

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:x"),
    revokeObjectURL: vi.fn(),
  });
});

describe("editor access without an account", () => {
  it("signed-out users can view and use the Soundtrack step", async () => {
    renderEditor();
    // starts on Soundtrack by default
    expect(
      screen.getByRole("heading", { level: 2, name: "Soundtrack" }),
    ).toBeTruthy();
    expect(screen.getByText("song.mp3")).toBeTruthy();
    // the header's "Sign in" entry point is allowed (and expected) to be
    // visible from the first screen — what must NOT happen is an
    // authentication gate/modal blocking the step itself.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("signed-out users can reach and use Visual media, including per-item effects", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(stepper().getByRole("button", { name: /Visual media/ }));
    expect(
      screen.getByRole("heading", { level: 2, name: "Visual media" }),
    ).toBeTruthy();
    expect(screen.getByText("one.png")).toBeTruthy();
    // per-item "Effects" disclosure is present and usable
    const effectsToggles = screen.getAllByText("Effects");
    expect(effectsToggles.length).toBeGreaterThan(0);
    await user.click(effectsToggles[0]);
    expect(screen.getAllByText("Subtle zoom").length).toBeGreaterThan(0);
  });

  it("signed-out users can configure project-wide transition and zoom defaults", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(stepper().getByRole("button", { name: /Review/ }));
    expect(screen.getByText("Visual effects")).toBeTruthy();
    const crossfadeBtn = screen.getByRole("button", { name: "Cross-fade" });
    await user.click(crossfadeBtn);
    expect(crossfadeBtn.getAttribute("aria-pressed")).toBe("true");
    // the duration slider only appears once cross-fade is selected
    expect(screen.getByLabelText(/Cross-fade duration/i)).toBeTruthy();
  });

  it("signed-out users can reach Export without being redirected to sign in", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(stepper().getByRole("button", { name: /Export/ }));
    // reaching Export is a plain internal stage change — no navigation to
    // an /auth/* route, no gate blocking the screen from rendering.
    expect(
      screen.getByRole("heading", { level: 2, name: "Export" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Generate Video" })).toBeTruthy();
    // This test environment has no Supabase configured at all (a distinct,
    // config-specific case fully covered by ExportConfiguration.test.tsx and
    // ExportStage.test.tsx); what matters here is simply that Export is
    // reachable and never silently swaps in an auth page instead.
    expect(screen.queryByRole("heading", { name: "Sign in" })).toBeNull();
  });
});
