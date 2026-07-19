import { useProject } from "../state/ProjectContext";

/** Non-blocking notices for rejected/duplicate files. */
export function Notices() {
  const { state, dispatch } = useProject();
  if (state.notices.length === 0) return null;
  return (
    <div className="notices" role="status">
      <ul>
        {state.notices.map((n, i) => (
          <li key={`${i}-${n}`}>{n}</li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={() => dispatch({ type: "dismiss-notices" })}
      >
        Dismiss
      </button>
    </div>
  );
}
