import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AccountMenu } from "./AccountMenu";
import { PlanProvider } from "../plan/PlanContext";
import { resetMockAuth, setMockAuthState } from "../../test/helpers";

// vi.mock factories are hoisted above imports, so they can't close over an
// imported binding directly — dynamically import it inside the factory
// instead (https://vitest.dev/api/vi.html#vi-mock).
vi.mock("./AuthContext", async () => {
  const actual = await vi.importActual("./AuthContext");
  const { useMockAuth } = await import("../../test/helpers");
  return { ...actual, useAuth: useMockAuth };
});

function renderMenu() {
  return render(
    <MemoryRouter>
      <AccountMenu />
    </MemoryRouter>,
  );
}

beforeEach(() => resetMockAuth("signed-out"));

describe("header authentication control", () => {
  it("signed-out users see both Sign in and Create account", () => {
    renderMenu();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create account" })).toBeTruthy();
  });

  it("unconfigured (no Supabase backend) still shows the entry points, not a blank header", () => {
    resetMockAuth("unconfigured");
    renderMenu();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create account" })).toBeTruthy();
  });

  it("signed-in users see the account control instead", () => {
    setMockAuthState({
      status: "signed-in",
      userId: "u1",
      email: "rui@example.com",
      profile: null,
    });
    renderMenu();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.getByRole("button", { name: /rui@example.com/ })).toBeTruthy();
  });

  it("the account menu offers sign-out and restores the signed-out actions", async () => {
    const user = userEvent.setup();
    setMockAuthState({
      status: "signed-in",
      userId: "u1",
      email: "rui@example.com",
      profile: null,
    });
    renderMenu();
    await user.click(screen.getByRole("button", { name: /rui@example.com/ }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(await screen.findByRole("link", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Create account" })).toBeTruthy();
  });

  it("shows a neutral loading indicator, not sign-in actions, while the session resolves", () => {
    resetMockAuth("loading");
    renderMenu();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Account/ })).toBeNull();
  });

  it("renders the avatar with a no-referrer policy (Google avatars need it)", () => {
    setMockAuthState({
      status: "signed-in",
      userId: "u1",
      email: "rui@example.com",
      profile: {
        id: "u1",
        email: "rui@example.com",
        displayName: "Rui Baiao",
        avatarUrl: "https://lh3.googleusercontent.com/a/abc123",
        plan: "free",
        exportCount: 0,
      },
    });
    renderMenu();
    const img = document.querySelector("img.account__avatar") as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(img.src).toContain("googleusercontent.com");
  });

  it("falls back to the initial (never a broken-image icon) if the avatar fails to load", () => {
    setMockAuthState({
      status: "signed-in",
      userId: "u1",
      email: "rui@example.com",
      profile: {
        id: "u1",
        email: "rui@example.com",
        displayName: "Rui Baiao",
        avatarUrl: "https://broken.example/x.png",
        plan: "free",
        exportCount: 0,
      },
    });
    renderMenu();
    const img = document.querySelector("img.account__avatar") as HTMLImageElement;
    fireEvent.error(img);
    // after the error, the img is gone and the initial letter is shown
    expect(document.querySelector("img.account__avatar")).toBeNull();
    expect(screen.getByText("R")).toBeTruthy();
  });
});


describe("god-mode plan switcher", () => {
  function renderMenuWithPlan() {
    return render(
      <MemoryRouter>
        <PlanProvider>
          <AccountMenu />
        </PlanProvider>
      </MemoryRouter>,
    );
  }

  function signInAs(email: string) {
    setMockAuthState({
      status: "signed-in",
      userId: "u1",
      email,
      profile: {
        id: "u1",
        email,
        displayName: null,
        avatarUrl: null,
        plan: "free",
        exportCount: 0,
      },
    });
  }

  it("the god account can switch between all three tiers from the menu", async () => {
    const user = userEvent.setup();
    signInAs("rui.palma.baiao@gmail.com");
    renderMenuWithPlan();

    await user.click(
      screen.getByRole("button", { name: /rui\.palma\.baiao@gmail\.com/ }),
    );
    // God-mode switcher is present with the three tiers and prices.
    expect(screen.getByText(/God mode/)).toBeTruthy();
    const pro = screen.getByRole("button", { name: /Pro\s*\$15\/mo/ });
    const creator = screen.getByRole("button", { name: /Creator\s*\$5\/mo/ });
    expect(screen.getByRole("button", { name: /Free\s*Free/ })).toBeTruthy();

    // Switch to Pro → button becomes the active tier.
    await user.click(pro);
    expect(pro.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Testing as/).textContent).toMatch(/Pro/);

    // Switch to Creator.
    await user.click(creator);
    expect(creator.getAttribute("aria-pressed")).toBe("true");

    // Reset returns to the account plan (free).
    await user.click(
      screen.getByRole("button", { name: "Reset to my account plan" }),
    );
    expect(screen.getByText(/Testing as/).textContent).toMatch(/Free/);
  });

  it("a normal account sees its plan, not the god switcher", async () => {
    const user = userEvent.setup();
    signInAs("someone@else.com");
    renderMenuWithPlan();
    await user.click(
      screen.getByRole("button", { name: /someone@else\.com/ }),
    );
    expect(screen.queryByText(/God mode/)).toBeNull();
    expect(screen.getByText(/Plan:/)).toBeTruthy();
  });
});
