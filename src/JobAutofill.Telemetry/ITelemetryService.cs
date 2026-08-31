namespace JobAutofill.Telemetry;

public interface ITelemetryService
{
    void Track(string eventName, Dictionary<string, string>? properties = null);
}
