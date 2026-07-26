/**
 * Component-level wiring test for the ordering toolbar: it drives the real
 * ProjectProvider (reducer + derived timeline), so a passing test means the
 * Sort dropdown, Shuffle, order badge, and Undo actually mutate project state.
 */
import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectProvider, useProject } from "../../state/ProjectContext";
import { MediaToolbar } from "./MediaToolbar";
import type { ImageMediaItem } from "../../types";

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    revokeObjectURL: vi.fn(),
    createObjectURL: vi.fn(() => "blob:x"),
  });
});

function img(id: string, name: string, createdAt: number): ImageMediaItem {
  return {
    id,
    kind: "image",
    file: new File([], name),
    name,
    size: 1,
    previewUrl: "",
    width: 1,
    height: 1,
    createdAt,
    dateSource: "upload-time",
  };
}

/** Seeds the provider once and mirrors the live order for assertions. */
function Harness({ items }: { items: ImageMediaItem[] }) {
  const { state, dispatch } = useProject();
  useEffect(() => {
    if (state.visualItems.length === 0) dispatch({ type: "add-visual", items });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (state.visualItems.length === 0) return null;
  return (
    <>
      <MediaToolbar />
      <ol data-testid="order">
        {state.visualItems.map((i) => (
          <li key={i.id}>{i.id}</li>
        ))}
      </ol>
    </>
  );
}

function currentOrder(): string[] {
  return Array.from(
    screen.getByTestId("order").querySelectorAll("li"),
  ).map((li) => li.textContent ?? "");
}

function seed() {
  // names chosen so filename A→Z differs from insertion order
  return [
    img("a", "c.jpg", 300),
    img("b", "a.jpg", 100),
    img("c", "b.jpg", 200),
  ];
}

describe("MediaToolbar", () => {
  it("sorts by filename A→Z through the dropdown", async () => {
    const user = userEvent.setup();
    render(
      <ProjectProvider>
        <Harness items={seed()} />
      </ProjectProvider>,
    );
    expect(currentOrder()).toEqual(["a", "b", "c"]);
    await user.selectOptions(
      screen.getByRole("combobox"),
      "Filename (A→Z)",
    );
    // a.jpg(b) < b.jpg(c) < c.jpg(a)
    expect(currentOrder()).toEqual(["b", "c", "a"]);
    expect(screen.getByText("Filename A→Z")).toBeInTheDocument();
  });

  it("shuffles the order and undoes back to the exact previous order", async () => {
    const user = userEvent.setup();
    render(
      <ProjectProvider>
        <Harness items={seed()} />
      </ProjectProvider>,
    );
    const before = currentOrder();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Shuffle" }));
    expect(currentOrder()).not.toEqual(before); // shuffle changed the order
    expect(
      screen.getByText("Shuffled", {
        selector: ".media-toolbar__order-badge",
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(currentOrder()).toEqual(before); // exact previous order restored
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });
});
