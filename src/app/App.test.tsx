import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { ProjectProvider } from "../state/ProjectContext";

function renderApp() {
  return render(
    <ProjectProvider>
      <App />
    </ProjectProvider>,
  );
}

describe("App shell", () => {
  it("shows the four stages and starts on Soundtrack", () => {
    renderApp();
    expect(screen.getByRole("heading", { name: "StoryMaker" })).toBeTruthy();
    const stepper = within(
      screen.getByRole("navigation", { name: "Project stages" }),
    );
    for (const label of ["Soundtrack", "Visual media", "Review", "Export"]) {
      expect(stepper.getByRole("button", { name: new RegExp(label) })).toBeTruthy();
    }
    expect(
      screen.getByRole("heading", { level: 2, name: "Soundtrack" }),
    ).toBeTruthy();
  });

  it("navigates between stages via the stepper", async () => {
    const user = userEvent.setup();
    renderApp();
    const stepper = within(
      screen.getByRole("navigation", { name: "Project stages" }),
    );
    await user.click(stepper.getByRole("button", { name: /Review/ }));
    expect(
      screen.getByRole("heading", { level: 2, name: "Review" }),
    ).toBeTruthy();
  });

  it("disables Generate Video on an empty project and lists blockers", async () => {
    const user = userEvent.setup();
    renderApp();
    const stepper = within(
      screen.getByRole("navigation", { name: "Project stages" }),
    );
    await user.click(stepper.getByRole("button", { name: /Review/ }));
    const generate = screen.getByRole("button", { name: "Generate Video" });
    expect((generate as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toMatch(/at least one audio/i);
    expect(screen.getByRole("alert").textContent).toMatch(/image or video/i);
  });

  it("shows friendly empty states on upload stages", async () => {
    const user = userEvent.setup();
    renderApp();
    expect(screen.getByText("No tracks yet.")).toBeTruthy();
    const stepper = within(
      screen.getByRole("navigation", { name: "Project stages" }),
    );
    await user.click(stepper.getByRole("button", { name: /Visual media/ }));
    expect(screen.getByText("No visual media yet.")).toBeTruthy();
  });
});
