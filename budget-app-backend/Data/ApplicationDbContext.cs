using Microsoft.EntityFrameworkCore;
using budget_app_backend.Models;

namespace budget_app_backend.Data;

public class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options)
    {
    }

    public DbSet<User> Users { get; set; }
    public DbSet<Transaction> Transactions { get; set; }
    public DbSet<PlaidItem> PlaidItems { get; set; }
    public DbSet<PlaidTransaction> PlaidTransactions { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Configure User entity
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(u => u.Id);
            entity.HasIndex(u => u.Email).IsUnique();
            entity.Property(u => u.Email).IsRequired().HasMaxLength(100);
            entity.Property(u => u.FirstName).IsRequired().HasMaxLength(50);
            entity.Property(u => u.LastName).IsRequired().HasMaxLength(50);
            entity.Property(u => u.PasswordHash).IsRequired();
        });

        // Configure Transaction entity
        modelBuilder.Entity<Transaction>(entity =>
        {
            entity.HasKey(t => t.Id);
            entity.Property(t => t.Amount).HasColumnType("decimal(18,2)");
            entity.Property(t => t.Description).IsRequired().HasMaxLength(200);
            entity.Property(t => t.Category).IsRequired().HasMaxLength(50);
            entity.Property(t => t.Type).IsRequired().HasMaxLength(10);
            
            // Configure relationship
            entity.HasOne(t => t.User)
                  .WithMany(u => u.Transactions)
                  .HasForeignKey(t => t.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PlaidItem>(entity =>
        {
            entity.HasIndex(item => item.PlaidItemId).IsUnique();
            entity.HasOne(item => item.User)
                  .WithMany()
                  .HasForeignKey(item => item.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PlaidTransaction>(entity =>
        {
            entity.HasIndex(transaction => new { transaction.PlaidItemId, transaction.PlaidTransactionId }).IsUnique();
            entity.HasOne(transaction => transaction.PlaidItem)
                  .WithMany(item => item.Transactions)
                  .HasForeignKey(transaction => transaction.PlaidItemId)
                  .OnDelete(DeleteBehavior.Cascade);
        });
    }
}