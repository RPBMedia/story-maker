import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// vitest runs with globals:false, so RTL cannot auto-register its cleanup —
// without this, each test's DOM accumulates into the next.
afterEach(cleanup);
