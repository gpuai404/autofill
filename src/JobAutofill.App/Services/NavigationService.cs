namespace JobAutofill.App.Services;

public class NavigationService : INavigationService
{
    public Task NavigateToAsync(string route)
    {
        return Task.CompletedTask;
    }
}
