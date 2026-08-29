export function PlaceholderPage({
  title,
  blurb,
  milestone,
}: {
  title: string;
  blurb: string;
  milestone: string;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-lg border border-dashed border-border bg-surface p-10 text-center">
        <div className="mb-2 inline-block rounded bg-surface-2 px-2 py-0.5 text-xs font-medium text-muted">
          Arrives in {milestone}
        </div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted">{blurb}</p>
        <p className="mt-6 text-xs text-muted">
          The scaffold, infrastructure and provider layer are in place (M0). This
          screen is wired into navigation and will be built in its milestone — see{" "}
          <code className="font-mono">.planning/ROADMAP.md</code>.
        </p>
      </div>
    </div>
  );
}
