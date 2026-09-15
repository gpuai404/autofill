using JobAutofill.Domain.Models;

namespace JobAutofill.App.Data;

public sealed class DemoJobCatalog : IJobCatalog
{
    public IReadOnlyList<JobPost> All { get; } =
    [
        new("Software Engineer", "Flex", "Remote", "https://jobs.lever.co/Flex/94e2c098-99e8-4737-97a0-e4a5cafd749b"),
        new("Software Engineer", "SpaceX", "United States", "https://boards.greenhouse.io/spacex/jobs/8578923002"),
        new("Software Engineer", "Autodesk", "Remote", "https://autodesk.wd1.myworkdayjobs.com/en-US/Ext/job/Software-Engineer_26WD100506-1"),
        new("Software Engineer", "Auctor", "Remote", "https://jobs.ashbyhq.com/auctor/45cd780b-30bd-4887-b1e8-0b4858aa8e63"),
        new("Software Engineer", "Western Digital", "United States", "https://jobs.smartrecruiters.com/WesternDigital/744000138727213-summer-2027-software-engineering-internship")
    ];
}
