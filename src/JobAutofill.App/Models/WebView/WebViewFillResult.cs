namespace JobAutofill.App.Models.WebView;

public sealed record WebViewFillResult(bool Ok, string Message, string? ObservedValue = null);
