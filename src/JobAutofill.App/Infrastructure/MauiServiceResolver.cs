using Microsoft.Extensions.DependencyInjection;
using Microsoft.Maui.Controls;

namespace JobAutofill.App.Infrastructure;

internal static class MauiServiceResolver
{
    public static T ResolveRequiredService<T>() where T : notnull
    {
        var services = Application.Current?.Handler?.MauiContext?.Services;
        if (services is null)
        {
            throw new InvalidOperationException($"Could not resolve {typeof(T).Name} because the MAUI service provider is unavailable.");
        }

        return services.GetRequiredService<T>();
    }

    public static IEnumerable<T> ResolveServices<T>() where T : notnull
    {
        var services = Application.Current?.Handler?.MauiContext?.Services;
        if (services is null)
        {
            throw new InvalidOperationException($"Could not resolve {typeof(T).Name} because the MAUI service provider is unavailable.");
        }

        return services.GetServices<T>();
    }
}
