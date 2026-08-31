using JobAutofill.Core.Workflow;
using JobAutofill.Core.Matching;
using JobAutofill.App.Services;
using JobAutofill.App.WebView;
using JobAutofill.App.ViewModels;
using JobAutofill.App.Views;
using JobAutofill.Infrastructure.Api;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Maui.Controls;

namespace JobAutofill.App.Pages;

public partial class JobBrowserPage : ContentPage, IQueryAttributable
{
    private const double BottomSheetCollapsedHeight = 104d;
    private const double BottomSheetExpandedHeight = 340d;
    
    private readonly JobBrowserViewModel _viewModel;
    private readonly JobBrowserPageService _pageService;
    private bool _isBottomSheetExpanded;

    public JobBrowserPage()
        : this(ResolveAutofillWorkflow())
    {
    }

    private JobBrowserPage(AutofillWorkflow autofillWorkflow)
    {
        InitializeComponent();
        var webViewBridge = new JobWebViewBridge(JobWebView);
        _viewModel = new JobBrowserViewModel();
        _pageService = new JobBrowserPageService(_viewModel, autofillWorkflow, webViewBridge, _viewModel.DetectedFields);

        BindingContext = _viewModel;
        DetectedFieldsView.ItemsSource = _viewModel.DetectedFields;
        Shell.SetBackButtonBehavior(this, new BackButtonBehavior
        {
            Command = new Command(async () => await NavigateBackAsync())
        });
    }

    public void ApplyQueryAttributes(IDictionary<string, object> query)
    {
        if (query.TryGetValue("JobPost", out var value) && value is SampleJobPost jobPost)
        {
            var jobUrl = ResolveScannableJobUrl(jobPost.Url);
            Title = jobPost.Company;
            _viewModel.JobTitle = $"{jobPost.Company} - {jobPost.Title}";
            _viewModel.JobUrl = jobUrl;
            
            _pageService.ResetForNewJob();
            ScanToolbarItem.IsEnabled = false;
            FillToolbarItem.IsEnabled = false;
            DebugToolbarItem.IsEnabled = false;
            SetBottomSheetExpanded(false);
            JobWebView.Source = new UrlWebViewSource { Url = jobUrl };
        }
    }

    private static string ResolveScannableJobUrl(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
        {
            return url;
        }

        if (!string.Equals(uri.Host, "jobs.lever.co", StringComparison.OrdinalIgnoreCase))
        {
            return url;
        }

        if (uri.AbsolutePath.EndsWith("/apply", StringComparison.OrdinalIgnoreCase))
        {
            return uri.ToString();
        }

        var builder = new UriBuilder(uri)
        {
            Path = uri.AbsolutePath.TrimEnd('/') + "/apply"
        };

        return builder.Uri.ToString();
    }

    protected override bool OnBackButtonPressed()
    {
        _ = NavigateBackAsync();
        return true;
    }

    private async Task NavigateBackAsync()
    {
        if (JobWebView.CanGoBack)
        {
            JobWebView.GoBack();
            return;
        }

        await Shell.Current.GoToAsync("..");
    }

    private void OnWebViewNavigating(object? sender, WebNavigatingEventArgs e)
    {
        _pageService.OnWebViewNavigating();
        ScanToolbarItem.IsEnabled = false;
        FillToolbarItem.IsEnabled = false;
        DebugToolbarItem.IsEnabled = false;
    }

    private async void OnWebViewNavigated(object? sender, WebNavigatedEventArgs e)
    {
        if (e.Result != WebNavigationResult.Success)
        {
            _viewModel.StatusText = $"Navigation failed: {e.Result}";
            return;
        }

        try
        {
            await _pageService.OnWebViewNavigatedAsync();
            ScanToolbarItem.IsEnabled = true;
        }
        catch
        {
            ScanToolbarItem.IsEnabled = false;
        }
    }

    private void UpdateToolbarItems()
    {
        var approvedCount = _viewModel.DetectedFields.Count(f => f.CanAutoFill);
        FillToolbarItem.IsEnabled = approvedCount > 0;
        DebugToolbarItem.IsEnabled = _viewModel.DetectedFields.Count > 0;
    }

    private void OnBottomSheetTapped(object? sender, TappedEventArgs e)
    {
        SetBottomSheetExpanded(!_isBottomSheetExpanded);
    }

    private void OnBottomSheetPanUpdated(object? sender, PanUpdatedEventArgs e)
    {
        if (e.StatusType != GestureStatus.Completed)
        {
            return;
        }

        if (e.TotalY < -20)
        {
            SetBottomSheetExpanded(true);
            return;
        }

        if (e.TotalY > 20)
        {
            SetBottomSheetExpanded(false);
        }
    }

    private void SetBottomSheetExpanded(bool expanded)
    {
        _isBottomSheetExpanded = expanded;
        BottomSheet.HeightRequest = expanded ? BottomSheetExpandedHeight : BottomSheetCollapsedHeight;
        DetectedFieldsPanel.IsVisible = expanded;
    }

    private async void OnScanClicked(object? sender, EventArgs e)
    {
        var pageUrl = (JobWebView.Source as UrlWebViewSource)?.Url ?? string.Empty;
        await _pageService.ScanAsync(pageUrl);
        UpdateToolbarItems();
    }

    private async void OnFillClicked(object? sender, EventArgs e)
    {
        await _pageService.FillAsync();
        UpdateToolbarItems();
    }

    private async void OnApproveFieldClicked(object? sender, EventArgs e)
    {
        if (sender is not Button { CommandParameter: DetectedFieldViewModel field })
        {
            return;
        }

        await _pageService.ApproveFieldAsync(field);
        UpdateToolbarItems();
    }

    private async void OnDetectedFieldTapped(object? sender, TappedEventArgs e)
    {
        if (e.Parameter is not DetectedFieldViewModel field)
        {
            return;
        }

        await _pageService.FocusFieldAsync(field);
    }

    private async void OnDebugClicked(object? sender, EventArgs e)
    {
        await _pageService.DebugAsync();
    }

    private async void OnDetectedFieldOptionClicked(object? sender, EventArgs e)
    {
        if (sender is not Button { CommandParameter: DetectedFieldOptionViewModel option })
        {
            return;
        }

        await _pageService.SelectOptionAsync(option);
        UpdateToolbarItems();
    }

    private static AutofillWorkflow ResolveAutofillWorkflow()
    {
        var services = global::Microsoft.Maui.Controls.Application.Current?.Handler?.MauiContext?.Services;
        return services?.GetService<AutofillWorkflow>() ??
            new AutofillWorkflow(
                new DetectedFieldNormalizer(),
                new FieldApprovalWorkflow(new LocalProfileFieldMatcher(), new PlaceholderApiFieldDecisionClient()),
                new FillCommandPlanner());
    }
}
