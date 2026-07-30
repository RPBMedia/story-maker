/** Effective-plan resolution + "god mode".
 *
 * The user's real plan comes from their auth profile (Supabase). For the
 * god-mode account (see entitlements.ts) we allow a purely client-side plan
 * OVERRIDE, persisted to localStorage, so all three tiers can be tested
 * without payment. Everything that gates on a plan reads `usePlan()` — never
 * `auth.profile.plan` directly — so the override applies everywhere.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { PlanEntitlements, PlanId } from "../../types";
import { entitlementsFor, isGodModeEmail } from "../../services/entitlements";
import { useAuth } from "../auth/AuthContext";

const OVERRIDE_KEY = "sm_plan_override";

interface PlanContextValue {
  /** The plan actually in effect (god override wins for the god account). */
  plan: PlanId;
  entitlements: PlanEntitlements;
  /** The plan from the auth profile, ignoring any god override. */
  accountPlan: PlanId;
  /** True when the signed-in account may switch plans freely. */
  isGod: boolean;
  /** The active god override, or null when following the account plan. */
  override: PlanId | null;
  /** God mode only: set (or clear with null) the plan override. */
  setOverride: (plan: PlanId | null) => void;
}

const PlanContext = createContext<PlanContextValue | null>(null);

function readOverride(): PlanId | null {
  try {
    const v = localStorage.getItem(OVERRIDE_KEY);
    return v === "free" || v === "creator" || v === "professional" ? v : null;
  } catch {
    return null;
  }
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const { auth } = useAuth();
  const [override, setOverrideState] = useState<PlanId | null>(() =>
    readOverride(),
  );

  // God mode is a dev/testing affordance — OFF in production so real users
  // (and the owner testing real payments) hit the real paywall. Re-enable on a
  // deployed build only by setting VITE_ENABLE_GOD_MODE="true".
  const godAllowed =
    import.meta.env.DEV || import.meta.env.VITE_ENABLE_GOD_MODE === "true";
  const isGod = godAllowed && isGodModeEmail(auth.email);
  const accountPlan: PlanId = auth.profile?.plan ?? "free";
  // Only the god account may deviate from its account plan.
  const plan: PlanId = isGod && override ? override : accountPlan;

  const setOverride = useCallback((next: PlanId | null) => {
    setOverrideState(next);
    try {
      if (next) localStorage.setItem(OVERRIDE_KEY, next);
      else localStorage.removeItem(OVERRIDE_KEY);
    } catch {
      /* storage unavailable — override stays in memory for this session */
    }
  }, []);

  const value = useMemo<PlanContextValue>(
    () => ({
      plan,
      entitlements: entitlementsFor(plan),
      accountPlan,
      isGod,
      override: isGod ? override : null,
      setOverride,
    }),
    [plan, accountPlan, isGod, override, setOverride],
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

/** Safe default when a component renders outside PlanProvider (the real app
 * always wraps in one — this keeps isolated component tests simple). */
const FALLBACK: PlanContextValue = {
  plan: "free",
  entitlements: entitlementsFor("free"),
  accountPlan: "free",
  isGod: false,
  override: null,
  setOverride: () => {},
};

// eslint-disable-next-line react-refresh/only-export-components
export function usePlan(): PlanContextValue {
  return useContext(PlanContext) ?? FALLBACK;
}
