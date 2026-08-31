using JobAutofill.Domain.Models;

namespace JobAutofill.App.Services;

public interface IProfileSession
{
    Profile Current { get; }
}
