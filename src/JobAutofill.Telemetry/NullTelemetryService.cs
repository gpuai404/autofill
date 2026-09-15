namespace JobAutofill.Telemetry;

public sealed class NullTelemetryService : ITelemetryService
{
    public void Track(string eventName, Dictionary<string, string>? properties = null)
    {
        // Intentionally empty: production telemetry has not been configured.
    }
}
