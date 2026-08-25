using System.Collections.ObjectModel;

namespace JobAutofill.App.Views;

public static class SampleJobs
{
    public static ObservableCollection<SampleJobPost> All { get; } = new(
    [
        // Lever.co - standard forms with text/email/phone
        new("Software Engineer", "Flex", "Remote", "https://jobs.lever.co/Flex/94e2c098-99e8-4737-97a0-e4a5cafd749b"),
        new("Sr. Full-Stack Developer", "Smarsh", "United States", "https://jobs.lever.co/smarsh/31c21dac-c6b2-44ff-8d1c-074ce7cd4f3c"),
        new("Software Engineer", "Deep Sky", "Remote", "https://jobs.lever.co/deepsky/d3668e63-9a23-4325-82a2-22707e4946be"),
        
        // Greenhouse - Iframe-hosted forms
        new("Software Engineer, Low Latency Computing", "SpaceX", "United States", "https://boards.greenhouse.io/spacex/jobs/8578923002"),
        new("DevOps Platform Engineer", "AppsFlyer", "Remote", "https://boards.greenhouse.io/appsflyer/jobs/8695882002"),

        // Workday - Fully custom web components with hidden internal DOM
        new("Staff Software Engineer", "Visa", "Hybrid", "https://visa.wd5.myworkdayjobs.com/en-US/Visa/job/Staff-Software-Engineer_REF082266W"),
        new("Software Engineer", "Autodesk", "Remote", "https://autodesk.wd1.myworkdayjobs.com/en-US/Ext/job/Software-Engineer_26WD100506-1"),

        // Ashby - Pages that render fields only after multi-step UI interaction
        new("Software Engineer", "Auctor", "Remote", "https://jobs.ashbyhq.com/auctor/45cd780b-30bd-4887-b1e8-0b4858aa8e63"),
        new("Software Engineer - Apps", "CertifyOS", "Remote", "https://jobs.ashbyhq.com/certifyos/619a3b78-ece1-464f-b335-8d1c2e7fb163"),

        // SmartRecruiters - Hidden or conditional multi-step forms
        new("Software Engineering Intern", "Western Digital", "United States", "https://jobs.smartrecruiters.com/WesternDigital/744000138727213-summer-2027-software-engineering-internship"),
        new("Staff Software Engineer", "Cint", "United States", "https://jobs.smartrecruiters.com/Cint/744000137768409-staff-software-engineer-dsm"),

        // IBM Careers - Complex security boundaries or non-form UIs
        new("Software Engineer", "IBM", "Canada", "https://careers.ibm.com/en_US/careers/JobDetail/Software-Engineer/126401"),
        new("Software Engineer - Cloud Platform", "IBM", "Remote", "https://careers.ibm.com/en_US/careers/JobDetail/Software-Engineer-Cloud-Platform/127308")
    ]);
}
