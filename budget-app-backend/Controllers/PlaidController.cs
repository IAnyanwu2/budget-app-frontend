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
        catch (Exception exception)
        {
            return Problem(statusCode: StatusCodes.Status500InternalServerError, title: "An unexpected error occurred.", detail: exception.ToString());
        }
    }

    [HttpPost("test-webhook")]
    public async Task<IActionResult> TestWebhook(CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            await _syncService.FireSandboxWebhookAsync(userId, cancellationToken);
            return Ok(new { message = "Sandbox webhook fired successfully." });
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: exception.Message);
        }
        catch (PlaidApiException exception)
        {
            return Problem(statusCode: StatusCodes.Status502BadGateway, title: "Plaid could not fire sandbox webhook.", detail: exception.ErrorCode);
        }
        catch (Exception exception)
        {
            return Problem(statusCode: StatusCodes.Status500InternalServerError, title: "An unexpected error occurred.", detail: exception.ToString());
        }
    }

    [HttpPost("sandbox-create-tx")]
    public async Task<IActionResult> CreateSandboxTransaction([FromQuery] int count = 5, CancellationToken cancellationToken = default)
    {
        if (!TryGetUserId(out var userId))
        {
            return Unauthorized();
        }

        try
        {
            await _syncService.CreateSandboxTransactionsAsync(userId, count, cancellationToken);
            return Ok(new { message = $"Successfully created {count} new simulated transactions. They will sync automatically." });
        }
        catch (InvalidOperationException exception)
        {
            return Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: exception.Message);
        }
        catch (PlaidApiException exception)
        {
            return Problem(statusCode: StatusCodes.Status502BadGateway, title: "Failed to simulate transaction. Make sure the linked account was created with the user_transactions_dynamic test credentials.", detail: exception.ErrorCode);
        }
        catch (Exception exception)
        {
            return Problem(statusCode: StatusCodes.Status500InternalServerError, title: "An unexpected error occurred.", detail: exception.ToString());
        }
    }

    private bool TryGetUserId(out int userId)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return int.TryParse(userIdClaim, out userId);
    }

    [HttpPost("webhook")]
    [AllowAnonymous]
    public async Task<IActionResult> Webhook([FromBody] System.Text.Json.JsonElement payload, CancellationToken cancellationToken)
    {
        var type = payload.TryGetProperty("webhook_type", out var t) ? t.GetString() : null;
        var code = payload.TryGetProperty("webhook_code", out var c) ? c.GetString() : null;
        var itemId = payload.TryGetProperty("item_id", out var i) ? i.GetString() : null;

        if (type == "TRANSACTIONS" && !string.IsNullOrEmpty(itemId))
        {
            if (code == "SYNC_UPDATES_AVAILABLE" || code == "INITIAL_UPDATE" || code == "DEFAULT_UPDATE" || code == "HISTORICAL_UPDATE")
            {
                // In production, you would typically enqueue this to be processed asynchronously.
                // For now, we await it synchronously to ensure the sync completes.
                try
                {
                    await _syncService.SyncByPlaidItemIdAsync(itemId, cancellationToken);
                }
                catch (Exception ex)
                {
                    // Log the error but still return Ok() to Plaid so they don't continually retry
                    Console.WriteLine($"Webhook sync failed for item {itemId}: {ex.Message}");
                }
            }
        }

        // Always return 200 OK to Plaid to acknowledge receipt
        return Ok();
    }
}

public sealed class ExchangePublicTokenRequest
{
    [System.ComponentModel.DataAnnotations.Required]
    public string PublicToken { get; set; } = string.Empty;
}