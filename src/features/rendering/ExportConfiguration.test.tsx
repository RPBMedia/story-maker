/** Configuration handling — uses the REAL AuthProvider (no auth mock) but
 * FORCES the "unconfigured" state (no Supabase) via module mocks, so the test
 * is deterministic whether or not the developer has a real .env on disk
 * (vitest loads .env through Vite). This is the exact scenario the original
 * bug report described: a dead-end disabled button with a raw technical
 * warning. Verifies the app not only survives it but presents it well.
 */
import { useEffect } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";
import { ProjectProvider, useProject } from "../../state/ProjectContext";
import { AuthProvider } from "../auth/AuthContext";
import { ExportStage } from "./ExportStage";
import type { AudioTrack, ImageMediaItem } from "../../types";

// Force unconfigured: no Supabase client, config reports not-configured.
vi.mock("../../services/supabase", async () => {
  const actual =
    await vi.importActual<typeof import("../../services/supabase")>(
      "../../services/supabase",
    );
  return { ...actual, supabase: null };
});
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

function track(): AudioTrack {
  return {
    id: "a1",
    file: new File(["x"], "a.mp3"),
    name: "a.mp3",
    duration: 10,
    size: 10,
    previewUrl: "blob:a",
  };
}
function image(): ImageMediaItem {
  return {
    id: "i1",
    kind: "image",
    createdAt: 1_700_000_000_000,
    dateSource: "upload-time",
    file: new File(["x"], "i.png"),
    name: "i.png",
    size: 10,
    previewUrl: "blob:i",
    width: 10,
    height: 10,
  };
}

function SeededExport() {
  const { state, dispatch } = useProject();
  useEffect(() => {
    if (state.audioTracks.length === 0) {
      dispatch({ type: "add-audio", tracks: [track()] });
      dispatch({ type: "add-visual", items: [image()] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <ExportStage />;
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});

function renderWithRealAuth() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <ProjectProvider>
          <SeededExport />
        </ProjectProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("missing Supabase configuration (real, unmocked AuthProvider)", () => {
  it("does not crash the app", () => {
    expect(() => renderWithRealAuth()).not.toThrow();
    expect(screen.getByRole("heading", { level: 2, name: "Export" })).toBeTruthy();
  });

  it("shows a calm, non-technical message in the primary export UI", async () => {
    renderWithRealAuth();
    expect(await screen.findByText(/temporarily unavailable/i)).toBeTruthy();
    // The primary/production-facing surface — ExportStage's own notice —
    // must never show variable names or the word "environment". (The
    // separate DEV-only diagnostic inside auth forms is covered by
    // AuthForms.test.tsx and is not part of this primary flow.)
    const heading = screen.getByRole("heading", { level: 2, name: "Export" });
    const exportSection = heading.closest("section")!;
    expect(exportSection.textContent).not.toMatch(/VITE_SUPABASE/);
  });

  it("offers a Retry action rather than leaving a disabled button with nothing to do", async () => {
    renderWithRealAuth();
    expect(await screen.findByRole("button", { name: "Retry" })).toBeTruthy();
  });

  it("the project remains visible/intact behind the notice", async () => {
    renderWithRealAuth();
    await screen.findByText(/temporarily unavailable/i);
    expect(screen.getByText("Output duration")).toBeTruthy();
    expect(screen.getByText("Visual items")).toBeTruthy();
  });
});
