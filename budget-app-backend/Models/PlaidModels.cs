using System.ComponentModel.DataAnnotations;

namespace budget_app_backend.Models;

public class PlaidItem
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User User { get; set; } = null!;

    [Required]
    [MaxLength(100)]
    public string PlaidItemId { get; set; } = string.Empty;

    [Required]
    public string ProtectedAccessToken { get; set; } = string.Empty;

    public string? Cursor { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? LastSyncedAt { get; set; }
    public ICollection<PlaidTransaction> Transactions { get; set; } = new List<PlaidTransaction>();
}

public class PlaidTransaction
{
    public int Id { get; set; }
    public int PlaidItemId { get; set; }
    public PlaidItem PlaidItem { get; set; } = null!;

    [Required]
    [MaxLength(100)]
    public string PlaidTransactionId { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? PendingTransactionId { get; set; }

    [Required]
    [MaxLength(200)]
    public string Description { get; set; } = string.Empty;

    public decimal Amount { get; set; }

    [Required]
    [MaxLength(100)]
    public string Category { get; set; } = "Other";

    [Required]
    [MaxLength(10)]
    public string Type { get; set; } = "expense";

    public DateTime Date { get; set; }
    public bool Pending { get; set; }
}