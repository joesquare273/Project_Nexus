/** A floating panel that explains what's happening: a lesson step, or a tip in the practice game. */
export function Coach({
  title,
  text,
  progress,
  actions,
}: {
  title: string;
  text: string;
  /** e.g. "Step 2 of 6". */
  progress?: string;
  actions: { label: string; onClick: () => void; primary?: boolean }[];
}) {
  return (
    <div className="coach" role="dialog" aria-label={title}>
      <div className="coach-head">
        <span className="coach-icon">✦</span>
        <strong>{title}</strong>
        {progress && <span className="coach-progress">{progress}</span>}
      </div>
      <p className="coach-text">{text}</p>
      {actions.length > 0 && (
        <div className="coach-actions">
          {actions.map((a) => (
            <button key={a.label} className={a.primary ? 'primary' : 'ghost'} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
