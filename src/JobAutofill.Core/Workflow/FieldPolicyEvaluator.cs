using JobAutofill.Domain.Models;

namespace JobAutofill.Core.Workflow;

public sealed class FieldPolicyEvaluator
{
    public ApplicationFieldState Evaluate(ApplicationFieldDescriptor field, FieldProposal? proposal)
    {
        if (field.Sensitivity == FieldSensitivity.ConsentOrCertification)
        {
            return State(field, null, FieldResolutionState.NeedsInput,
                "Review and complete this consent or certification yourself.");
        }

        if (field.FillCapability == FieldFillCapability.Unsupported)
        {
            return State(field, proposal, proposal is null ? FieldResolutionState.NeedsInput : FieldResolutionState.NeedsReview,
                "This control is not safely supported yet.");
        }

        if (proposal is null)
        {
            return State(field, null, FieldResolutionState.NeedsInput,
                field.Requirement == FieldRequirement.Required
                    ? "A required answer is missing."
                    : "No saved answer matches this field.");
        }

        if (field.Sensitivity is FieldSensitivity.Sensitive or FieldSensitivity.Personal)
        {
            return State(field, proposal, FieldResolutionState.NeedsReview,
                "Review this personal or sensitive answer before filling.");
        }

        if (proposal.Score < 0.90)
        {
            return State(field, proposal, FieldResolutionState.NeedsReview,
                "Review this suggested answer.");
        }

        return State(field, proposal, FieldResolutionState.Resolved,
            field.FillCapability == FieldFillCapability.Manual
                ? "Answer identified; complete this field manually."
                : "Ready to fill.");
    }

    private static ApplicationFieldState State(
        ApplicationFieldDescriptor field,
        FieldProposal? proposal,
        FieldResolutionState resolution,
        string message) => new()
        {
            Field = field,
            Proposal = proposal,
            Resolution = resolution,
            Message = message
        };
}
