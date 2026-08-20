export default function LocalWarningBanner() {
  return (
    <div className="local-warning-banner" role="note">
      <strong>Local use only:</strong> this is an intentionally vulnerable
      training application. Never expose it to the public internet or run it on
      a shared/production network.
    </div>
  );
}
