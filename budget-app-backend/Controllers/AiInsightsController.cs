using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using budget_app_backend.Services;

namespace budget_app_backend.Controllers;

[ApiController]
[Authorize]
[Route("api/ai-insights")]
public sealed class AiInsightsController : ControllerBase
{
    private readonly OllamaAnalysisService _analysisService;

    public AiInsightsController(OllamaAnalysisService analysisService)
    {
        _analysisService = analysisService;
    }

    [HttpPost]
    public async Task<IActionResult> Generate([FromBody] GenerateInsightsRequest request, CancellationToken cancellationToken)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(userIdClaim, out var userId)) return Unauthorized();

        try
        {
            var response = await _analysisService.GenerateInsightsAsync(
                userId, request.BudgetGoal, request.CategoryGoals, cancellationToken);
            return Ok(new { response });
        }
        catch (HttpRequestException)
        {
            return Problem(
                statusCode: StatusCodes.Status503ServiceUnavailable,
                title: "Local Ollama is unavailable.",
                detail: "Start Ollama and ensure the configured model is installed.");
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: exception.Message);
        }
    }
}

public sealed class GenerateInsightsRequest
{
    public decimal? BudgetGoal { get; set; }
    public Dictionary<string, decimal>? CategoryGoals { get; set; }
}