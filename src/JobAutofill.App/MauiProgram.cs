using JobAutofill.Core.Contracts;
using JobAutofill.Core.Workflow;
using JobAutofill.Core.Matching;
using JobAutofill.App.Data;
using JobAutofill.App.Mappers;
using JobAutofill.App.Pages;
using JobAutofill.App.Services;
using JobAutofill.App.ViewModels;
using JobAutofill.Infrastructure;
using JobAutofill.Infrastructure.Persistence;
using JobAutofill.Telemetry;
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

        builder.Services.AddJobAutofillInfrastructure();
        builder.Services.AddSingleton<IProfileRepository, ProfileRepository>();
        builder.Services.AddSingleton<IJobCatalog, SampleJobCatalog>();
        builder.Services.AddSingleton<IJobApplicationUrlResolver, JobApplicationUrlResolver>();
        builder.Services.AddSingleton<IJobBrowserStatusService, JobBrowserStatusService>();
        builder.Services.AddSingleton<ITelemetryService, TelemetryService>();
        builder.Services.AddSingleton<INavigationService, NavigationService>();
        builder.Services.AddTransient<IJobBrowserViewModel, JobBrowserViewModel>();
        builder.Services.AddTransient<IProfileEditorViewModel, ProfileEditorViewModel>();
        builder.Services.AddSingleton<IDetectedFieldViewModelMapper, DetectedFieldViewModelMapper>();
        builder.Services.AddSingleton<LocalProfileFieldMatcher>();
        builder.Services.AddSingleton<DetectedFieldNormalizer>();
        builder.Services.AddSingleton<FillCommandPlanner>();
        builder.Services.AddSingleton<FieldApprovalWorkflow>();
        builder.Services.AddSingleton<AutofillWorkflow>();
        builder.Services.AddSingleton<IJobBrowserWorkflowService, JobBrowserWorkflowService>();
        builder.Services.AddSingleton<IJobBrowserPageServiceFactory, JobBrowserPageServiceFactory>();
        builder.Services.AddSingleton<AppShell>();
        builder.Services.AddTransient<JobsListPage>();
        builder.Services.AddTransient<ProfileEditorPage>();
        builder.Services.AddTransient<JobBrowserPage>();
        

        return builder.Build();
    }
}
