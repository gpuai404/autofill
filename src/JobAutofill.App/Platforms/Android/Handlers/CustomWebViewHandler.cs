using Android.Webkit;
using AndroidX.WebKit;
using Microsoft.Maui.Handlers;
using System.IO;

namespace JobAutofill.App.Platforms.Android.Handlers;

public class CustomWebViewHandler : WebViewHandler
{
    private static string? _documentStartScript;

    protected override void ConnectHandler(global::Android.Webkit.WebView platformView)
    {
        base.ConnectHandler(platformView);

        platformView.Settings.JavaScriptEnabled = true;
        platformView.Settings.DomStorageEnabled = true;

        TryRegisterDocumentStartScript(platformView);
    }

    private static void TryRegisterDocumentStartScript(global::Android.Webkit.WebView platformView)
    {
        try
        {
            if (!WebViewFeature.IsFeatureSupported(WebViewFeature.DocumentStartScript))
            {
                return;
            }

            _documentStartScript ??= LoadAsset(platformView, "dom-shared.js");
            WebViewCompat.AddDocumentStartJavaScript(
                platformView,
                _documentStartScript,
                new[] { "*" });
        }
        catch
        {
            // The regular bridge still injects dom-shared.js after navigation.
        }
    }

    private static string LoadAsset(global::Android.Webkit.WebView platformView, string fileName)
    {
        ArgumentNullException.ThrowIfNull(platformView);

        var assets = platformView.Context?.Assets;
        if (assets is null)
        {
            return string.Empty;
        }

        using var stream = assets.Open(fileName);
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
