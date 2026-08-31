using JobAutofill.App.Models.WebView;
using JobAutofill.App.ViewModels;
using JobAutofill.Domain.Models;

namespace JobAutofill.App.Services;

public interface IJobBrowserWorkflowService
{
    Task<List<DetectedFieldViewModel>> PrepareDetectedFieldsAsync(
        string pageUrl,
        IReadOnlyList<DetectedField> scanFields,
        WebViewCapabilityResult capability,
        Profile profile);

    IReadOnlyList<FillCommand> BuildFillCommands(IEnumerable<DetectedFieldViewModel> fields);
}
