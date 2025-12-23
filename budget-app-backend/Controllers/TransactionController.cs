using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;

[ApiController]
[Route("api/transactions")]
public class TransactionController : ControllerBase
{
    [HttpGet("summary")]
    public IActionResult GetBudgetSummary()
    {
        // Get the current user ID from the JWT token
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userIdClaim == null || !int.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized();
        }

        var summary = new {
            userId = userId,
            income = 5000,
            expenses = 3200,
            savings = 1800,
            lastUpdated = DateTime.UtcNow
        };
        return Ok(summary);
    }

    [HttpGet("recent")]
    public IActionResult GetRecentTransactions()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userIdClaim == null || !int.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized();
        }

        var transactions = new[]
        {
            new { id = 1, description = "Grocery Shopping", amount = -120.50, category = "Food", date = DateTime.UtcNow.AddDays(-1) },
            new { id = 2, description = "Salary", amount = 3000.00, category = "Income", date = DateTime.UtcNow.AddDays(-5) },
            new { id = 3, description = "Gas Station", amount = -45.00, category = "Transportation", date = DateTime.UtcNow.AddDays(-2) }
        };
        return Ok(transactions);
    }

    [HttpGet("category-breakdown")]
    public IActionResult GetCategoryBreakdown()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userIdClaim == null || !int.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized();
        }

        var breakdown = new[]
        {
            new { category = "Food", amount = 450, percentage = 35 },
            new { category = "Transportation", amount = 300, percentage = 23 },
            new { category = "Entertainment", amount = 200, percentage = 15 },
            new { category = "Utilities", amount = 350, percentage = 27 }
        };
        return Ok(breakdown);
    }

    [HttpGet("spending-trend")]
    public IActionResult GetSpendingTrend()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userIdClaim == null || !int.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized();
        }

        // Full year of realistic financial data with variation
        var trend = new[]
        {
            new { month = "Jan", income = 4500, expenses = 3800, savings = 700 },
            new { month = "Feb", income = 4800, expenses = 3200, savings = 1600 },
            new { month = "Mar", income = 5000, expenses = 4100, savings = 900 },
            new { month = "Apr", income = 5200, expenses = 3300, savings = 1900 },
            new { month = "May", income = 5000, expenses = 3200, savings = 1800 },
            new { month = "Jun", income = 5300, expenses = 4200, savings = 1100 },
            new { month = "Jul", income = 5100, expenses = 3900, savings = 1200 },
            new { month = "Aug", income = 5400, expenses = 3600, savings = 1800 },
            new { month = "Sep", income = 5200, expenses = 3500, savings = 1700 },
            new { month = "Oct", income = 5600, expenses = 3800, savings = 1800 },
            new { month = "Nov", income = 5300, expenses = 4000, savings = 1300 },
            new { month = "Dec", income = 5800, expenses = 4500, savings = 1300 }
        };
        return Ok(trend);
    }

    [HttpGet("monthly-breakdown/{month?}")]
    public IActionResult GetMonthlyBreakdown(string month = null)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userIdClaim == null || !int.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized();
        }

        // If no month specified, use current month
        month = month ?? DateTime.UtcNow.ToString("MMM");

        // Generate different data based on month for variety
        var baseData = new Dictionary<string, object>
        {
            ["Jan"] = new { housing = 1200, food = 650, transport = 400, entertainment = 300, utilities = 250, healthcare = 150, shopping = 350, other = 500 },
            ["Feb"] = new { housing = 1200, food = 580, transport = 380, entertainment = 250, utilities = 280, healthcare = 200, shopping = 290, other = 400 },
            ["Mar"] = new { housing = 1200, food = 720, transport = 420, entertainment = 380, utilities = 240, healthcare = 180, shopping = 450, other = 510 },
            ["Apr"] = new { housing = 1200, food = 600, transport = 390, entertainment = 320, utilities = 220, healthcare = 160, shopping = 310, other = 400 },
            ["May"] = new { housing = 1200, food = 590, transport = 350, entertainment = 290, utilities = 200, healthcare = 170, shopping = 280, other = 420 },
            ["Jun"] = new { housing = 1200, food = 780, transport = 450, entertainment = 520, utilities = 190, healthcare = 190, shopping = 480, other = 590 },
            ["Jul"] = new { housing = 1200, food = 720, transport = 410, entertainment = 480, utilities = 180, healthcare = 160, shopping = 420, other = 540 },
            ["Aug"] = new { housing = 1200, food = 650, transport = 380, entertainment = 350, utilities = 170, healthcare = 140, shopping = 380, other = 480 },
            ["Sep"] = new { housing = 1200, food = 600, transport = 360, entertainment = 290, utilities = 210, healthcare = 180, shopping = 350, other = 460 },
            ["Oct"] = new { housing = 1200, food = 680, transport = 400, entertainment = 330, utilities = 240, healthcare = 200, shopping = 420, other = 510 },
            ["Nov"] = new { housing = 1200, food = 720, transport = 430, entertainment = 380, utilities = 280, healthcare = 220, shopping = 470, other = 550 },
            ["Dec"] = new { housing = 1200, food = 850, transport = 460, entertainment = 650, utilities = 300, healthcare = 180, shopping = 750, other = 710 }
        };

        return Ok(baseData.ContainsKey(month) ? baseData[month] : baseData["Dec"]);
    }
}