using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using budget_app_backend.Services;

namespace budget_app_backend.Controllers;

[ApiController]
[Authorize]
[Route("api/plaid")]
public sealed class PlaidController : ControllerBase
{
    private readonly PlaidSyncService _syncService;

    public PlaidController(PlaidSyncService syncService)
    {
        _syncService = syncService;
    }

    [HttpPost("link-token")]
    public async Task<IActionResult> CreateLinkToken(CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            return Ok(new { linkToken = await _syncService.CreateLinkTokenAsync(userId, cancellationToken) });
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: exception.Message);
        }
        catch (PlaidApiException exception)
        {
            return Problem(statusCode: StatusCodes.Status502BadGateway, title: "Plaid could not create a Link token.", detail: exception.ErrorCode);
        }
    }

    [HttpPost("exchange")]
    public async Task<IActionResult> ExchangePublicToken([FromBody] ExchangePublicTokenRequest request, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            var connected = await _syncService.ConnectItemAsync(userId, request.PublicToken, cancellationToken);
            return connected ? Ok(new { connected = true }) : Conflict(new { message = "This Plaid account is already linked to another user." });
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: exception.Message);
        }
        catch (PlaidApiException exception)
        {
            return Problem(statusCode: StatusCodes.Status502BadGateway, title: "Plaid could not exchange the public token.", detail: exception.ErrorCode);
        }
    }

    [HttpPost("sync")]
    public async Task<IActionResult> Sync(CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            return Ok(await _syncService.SyncUserAsync(userId, cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: exception.Message);
        }
        catch (PlaidApiException exception)
        {
            return Problem(statusCode: StatusCodes.Status502BadGateway, title: "Plaid transaction sync failed.", detail: exception.ErrorCode);
        }
    }

    private bool TryGetUserId(out int userId)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return int.TryParse(userIdClaim, out userId);
    }
}

public sealed class ExchangePublicTokenRequest
{
    [System.ComponentModel.DataAnnotations.Required]
    public string PublicToken { get; set; } = string.Empty;
}