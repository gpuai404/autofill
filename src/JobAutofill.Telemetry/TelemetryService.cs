namespace JobAutofill.Telemetry;

public sealed class TelemetryService : ITelemetryService
{
    public void Track(string eventName, Dictionary<string, string>? properties = null)
    {
        // Tier 3 placeholder - intentionally no-op for initial structure.
    }
}
