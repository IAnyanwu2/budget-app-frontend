using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using budget_app_backend.Data;

namespace budget_app_backend.Controllers;

[ApiController]
[Authorize]
[Route("api/settings")]
public sealed class UserSettingsController : ControllerBase
{
    private readonly ApplicationDbContext _context;

    public UserSettingsController(ApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet("ai-preferences")]
    public async Task<IActionResult> GetAiPreferences(CancellationToken cancellationToken)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(userIdClaim, out var userId)) return Unauthorized();

        var user = await _context.Users.FindAsync(new object[] { userId }, cancellationToken);
        if (user == null) return NotFound();

        return Ok(new
        {
            provider = user.AiProvider ?? "ollama",
            model = user.AiModel ?? "mistral:7b",
            hasApiKey = !string.IsNullOrEmpty(user.AiApiKey)
        });
    }

    [HttpPost("ai-preferences")]
    public async Task<IActionResult> UpdateAiPreferences([FromBody] UpdateAiPreferencesRequest request, CancellationToken cancellationToken)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (!int.TryParse(userIdClaim, out var userId)) return Unauthorized();

        var user = await _context.Users.FindAsync(new object[] { userId }, cancellationToken);
        if (user == null) return NotFound();

        user.AiProvider = request.Provider;
        user.AiModel = request.Model;
        
        if (request.ApiKey != null)
        {
            // If it's an empty string, the user is clearing it
            user.AiApiKey = string.IsNullOrWhiteSpace(request.ApiKey) ? null : request.ApiKey; 
        }

        await _context.SaveChangesAsync(cancellationToken);

        return Ok(new { success = true });
    }
}

public sealed class UpdateAiPreferencesRequest
{
    public string? Provider { get; set; }
    public string? Model { get; set; }
    public string? ApiKey { get; set; }
}
