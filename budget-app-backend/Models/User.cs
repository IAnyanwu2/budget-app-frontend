using System.ComponentModel.DataAnnotations;

namespace budget_app_backend.Models;

public class User
{
    public int Id { get; set; }
    
    [Required]
    [MaxLength(50)]
    public string FirstName { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(50)]
    public string LastName { get; set; } = string.Empty;
    
    [Required]
    [EmailAddress]
    [MaxLength(100)]
    public string Email { get; set; } = string.Empty;
    
    [Required]
    public string PasswordHash { get; set; } = string.Empty;
    
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
    
    [MaxLength(50)]
    public string? AiProvider { get; set; } // e.g. "ollama", "openai", "anthropic"
    
    [MaxLength(50)]
    public string? AiModel { get; set; } // e.g. "mistral:7b", "gpt-4o-mini", "claude-3-5-haiku-20241022"
    
    [MaxLength(500)]
    public string? AiApiKey { get; set; } // Encrypted API key
    
    // Navigation properties
    public ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();
}

public class Transaction
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public User User { get; set; } = null!;
    
    [Required]
    [MaxLength(200)]
    public string Description { get; set; } = string.Empty;
    
    [Required]
    public decimal Amount { get; set; }
    
    [Required]
    [MaxLength(50)]
    public string Category { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(10)]
    public string Type { get; set; } = string.Empty; // "income" or "expense"
    
    public DateTime Date { get; set; } = DateTime.UtcNow;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}