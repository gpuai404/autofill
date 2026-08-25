using JobAutofill.Domain.Models;

namespace JobAutofill.Core.Workflow;

public sealed class FillCommandPlanner
{
    public IReadOnlyList<FillCommand> BuildFillCommands(IEnumerable<ApprovalItem> items)
    {
        return items
            .Where(item => item.CanBecomeFillCommand)
            .Select(item => new FillCommand
            {
                FieldId = item.FieldId,
                Selector = item.Field.Selector,
                Value = item.ProposedValue,
                SelectedOptions = item.SelectedOptions,
                FillStrategy = item.Field.FillStrategy
            })
            .ToList();
    }
}
