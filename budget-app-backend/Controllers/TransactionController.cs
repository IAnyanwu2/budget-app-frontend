using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using budget_app_backend.Data;

[ApiController]
[Authorize]
[Route("api/transactions")]
public class TransactionController : ControllerBase
{
    private readonly ApplicationDbContext _context;

    public TransactionController(ApplicationDbContext context)
    {
        _context = context;
    }

    [HttpGet("summary")]
    public async Task<IActionResult> GetBudgetSummary(CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        var month = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1);
        var transactions = await GetUserTransactions(userId, month, month.AddMonths(1), cancellationToken);
        var income = transactions.Where(transaction => transaction.Amount > 0).Sum(transaction => transaction.Amount);
        var expenses = -transactions.Where(transaction => transaction.Amount < 0).Sum(transaction => transaction.Amount);

        return Ok(new { income, expenses, savings = income - expenses, lastUpdated = DateTime.UtcNow });
    }

    [HttpGet("recent")]
    public async Task<IActionResult> GetRecentTransactions(CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        var transactions = await GetUserTransactions(userId, null, null, cancellationToken);
        return Ok(transactions
            .OrderByDescending(transaction => transaction.Date)
            .Take(10)
            .Select(transaction => new
            {
                id = transaction.Id,
                name = transaction.Description,
                description = transaction.Description,
                amount = transaction.Amount,
                category = transaction.Category,
                date = transaction.Date,
                type = transaction.Amount >= 0 ? "income" : "expense"
            }));
    }

    [HttpGet("category-breakdown")]
    public async Task<IActionResult> GetCategoryBreakdown(CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        var month = new DateTime(DateTime.UtcNow.Year, DateTime.UtcNow.Month, 1);
        var transactions = await GetUserTransactions(userId, month, month.AddMonths(1), cancellationToken);
        var expenses = transactions.Where(transaction => transaction.Amount < 0).ToArray();
        var total = -expenses.Sum(transaction => transaction.Amount);
        var breakdown = expenses
            .GroupBy(transaction => transaction.Category)
            .Select(group =>
            {
                var amount = -group.Sum(transaction => transaction.Amount);
                return new { category = group.Key, amount, percentage = total == 0 ? 0 : Math.Round(amount / total * 100, 2) };
            })
            .OrderByDescending(category => category.amount);

        return Ok(breakdown);
    }

    [HttpGet("spending-trend")]
    public async Task<IActionResult> GetSpendingTrend([FromQuery] int? year, CancellationToken cancellationToken)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        var selectedYear = year ?? DateTime.UtcNow.Year;
        if (selectedYear < 1900 || selectedYear > 9998) return BadRequest("Year is out of range.");

        var transactions = await GetUserTransactions(
            userId,
            new DateTime(selectedYear, 1, 1),
            new DateTime(selectedYear + 1, 1, 1),
            cancellationToken);

        var trend = Enumerable.Range(1, 12).Select(monthNumber =>
        {
            var monthTransactions = transactions.Where(transaction => transaction.Date.Month == monthNumber).ToArray();
            var monthIncome = monthTransactions.Where(transaction => transaction.Amount > 0).Sum(transaction => transaction.Amount);
            var monthExpenses = -monthTransactions.Where(transaction => transaction.Amount < 0).Sum(transaction => transaction.Amount);
            return new
            {
                month = new DateTime(selectedYear, monthNumber, 1).ToString("MMM", CultureInfo.InvariantCulture),
                income = monthIncome,
                expenses = monthExpenses,
                savings = monthIncome - monthExpenses
            };
        });

        return Ok(trend);
    }

    [HttpGet("monthly-breakdown/{month?}")]
    public async Task<IActionResult> GetMonthlyBreakdown(
        string? month = null,
        [FromQuery] int? year = null,
        CancellationToken cancellationToken = default)
    {
        if (!TryGetUserId(out var userId)) return Unauthorized();

        var selectedYear = year ?? DateTime.UtcNow.Year;
        if (selectedYear < 1900 || selectedYear > 9998) return BadRequest("Year is out of range.");
        var monthName = month ?? DateTime.UtcNow.ToString("MMM", CultureInfo.InvariantCulture);
        if (!DateTime.TryParseExact(monthName, "MMM", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedMonth))
        {
            return BadRequest("Month must be a three-letter month name.");
        }

        var start = new DateTime(selectedYear, parsedMonth.Month, 1);
        var transactions = await GetUserTransactions(userId, start, start.AddMonths(1), cancellationToken);
        var breakdown = transactions
            .Where(transaction => transaction.Amount < 0)
            .GroupBy(transaction => transaction.Category)
            .ToDictionary(group => group.Key, group => -group.Sum(transaction => transaction.Amount));

        return Ok(breakdown);
    }

    private async Task<List<TransactionRow>> GetUserTransactions(
        int userId,
        DateTime? start,
        DateTime? end,
        CancellationToken cancellationToken)
    {
        var legacyQuery = _context.Transactions.Where(transaction => transaction.UserId == userId);
        var plaidQuery = _context.PlaidTransactions.Where(transaction => transaction.PlaidItem.UserId == userId);
        if (start.HasValue && end.HasValue)
        {
            var startDate = start.Value;
            var endDate = end.Value;
            legacyQuery = legacyQuery.Where(transaction => transaction.Date >= startDate && transaction.Date < endDate);
            plaidQuery = plaidQuery.Where(transaction => transaction.Date >= startDate && transaction.Date < endDate);
        }

        var legacy = await legacyQuery.Select(transaction => new
        {
            transaction.Id,
            transaction.Description,
            transaction.Amount,
            transaction.Category,
            transaction.Type,
            transaction.Date
        }).ToListAsync(cancellationToken);

        var plaid = await plaidQuery.Select(transaction => new
        {
            transaction.Id,
            transaction.Description,
            transaction.Amount,
            transaction.Category,
            transaction.Date
        }).ToListAsync(cancellationToken);

        return legacy.Select(transaction => new TransactionRow(
                $"legacy-{transaction.Id}",
                transaction.Description,
                string.Equals(transaction.Type, "income", StringComparison.OrdinalIgnoreCase)
                    ? Math.Abs(transaction.Amount)
                    : -Math.Abs(transaction.Amount),
                transaction.Category,
                transaction.Date))
            .Concat(plaid.Select(transaction => new TransactionRow(
                $"plaid-{transaction.Id}",
                transaction.Description,
                transaction.Amount,
                transaction.Category,
                transaction.Date)))
            .ToList();
    }

    private bool TryGetUserId(out int userId)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return int.TryParse(userIdClaim, out userId);
    }

    private sealed record TransactionRow(string Id, string Description, decimal Amount, string Category, DateTime Date);
}