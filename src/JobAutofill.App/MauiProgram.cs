using JobAutofill.Core.Contracts;
using JobAutofill.Core.Workflow;
using JobAutofill.Core.Matching;
using JobAutofill.Infrastructure.Api;
using JobAutofill.Infrastructure.Persistence;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Maui.Controls;
#if MAUI_DEVFLOW
using Microsoft.Maui.DevFlow.Agent;
#endif

namespace JobAutofill.App;

public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();

        builder
            .UseMauiApp<App>()
            .ConfigureFonts(fonts =>
            {
                fonts.AddFont("OpenSans-Regular.ttf", "OpenSansRegular");
            });

    #if MAUI_DEVFLOW
        builder.AddMauiDevFlowAgent();
    #endif

#if ANDROID
        builder.ConfigureMauiHandlers(handlers =>
        {
            handlers.AddHandler(typeof(Microsoft.Maui.Controls.WebView), typeof(JobAutofill.App.Platforms.Android.Handlers.CustomWebViewHandler));
        });
#endif

        builder.Services.AddSingleton<ProfileRepository>();
        builder.Services.AddSingleton<LocalProfileFieldMatcher>();
        builder.Services.AddSingleton<DetectedFieldNormalizer>();
        builder.Services.AddSingleton<FillCommandPlanner>();
        builder.Services.AddSingleton<IApiFieldDecisionClient, PlaceholderApiFieldDecisionClient>();
        builder.Services.AddSingleton<FieldApprovalWorkflow>();
        builder.Services.AddSingleton<AutofillWorkflow>();
        

        return builder.Build();
    }
}
