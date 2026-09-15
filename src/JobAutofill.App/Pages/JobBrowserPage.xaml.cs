using JobAutofill.App.Infrastructure;
using JobAutofill.App.Services;
using JobAutofill.App.WebView;
using JobAutofill.App.ViewModels;
using Microsoft.Maui.Controls;
using JobAutofill.Domain.Models;

namespace JobAutofill.App.Pages;

public partial class JobBrowserPage : ContentPage, IQueryAttributable
{
    private const double BottomSheetCollapsedHeight = 104d;
    private const double BottomSheetExpandedHeight = 340d;
    
    private readonly IJobBrowserViewModel _viewModel;
    private readonly IJobBrowserPageService _pageService;
    private readonly IJobApplicationUrlResolver _jobApplicationUrlResolver;
    private readonly JobWebViewBridge _webViewBridge;
    private bool _isBottomSheetExpanded;

    public JobBrowserPage()
        : this(
            MauiServiceResolver.ResolveRequiredService<IJobBrowserViewModel>(),
            MauiServiceResolver.ResolveRequiredService<IJobBrowserPageServiceFactory>(),
            MauiServiceResolver.ResolveRequiredService<IJobApplicationUrlResolver>())
    {
    }

    private JobBrowserPage(
        IJobBrowserViewModel viewModel,
        IJobBrowserPageServiceFactory pageServiceFactory,
        IJobApplicationUrlResolver jobApplicationUrlResolver)
    {
        InitializeComponent();
        _webViewBridge = new JobWebViewBridge(JobWebView);
        _viewModel = viewModel;
        _pageService = pageServiceFactory.Create(_viewModel, _webViewBridge);
        _jobApplicationUrlResolver = jobApplicationUrlResolver;

        BindingContext = _viewModel;
        Shell.SetBackButtonBehavior(this, new BackButtonBehavior
        {
            Command = new Command(async () => await NavigateBackAsync())
        });
    }

    public void ApplyQueryAttributes(IDictionary<string, object> query)
    {
        if (query.TryGetValue("JobPost", out var value) && value is JobPost jobPost)
        {
            var site = _jobApplicationUrlResolver.Resolve(jobPost.Url);
            var jobUrl = site.ScannableUrl;
            _webViewBridge.ConfigureSite(site, EnableWebDiagnostics);
            Title = jobPost.Company;
            _viewModel.SetJob(jobPost, jobUrl);
            
            _pageService.ResetForNewJob();
            ScanToolbarItem.IsEnabled = false;
            FillToolbarItem.IsEnabled = false;
            DebugToolbarItem.IsEnabled = false;
            SetBottomSheetExpanded(false);
            JobWebView.Source = new UrlWebViewSource { Url = jobUrl };
        }
    }

    private static bool EnableWebDiagnostics
    {
        get
        {
#if DEBUG
            return true;
#else
            return false;
#endif
        }
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
            var pageLanguage = await _webViewBridge.GetCurrentPageLanguageAsync();
            AppLocalizer.ApplyPageLanguage(pageLanguage);
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
}
