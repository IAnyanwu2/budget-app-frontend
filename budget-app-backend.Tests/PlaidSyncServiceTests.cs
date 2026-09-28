using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using budget_app_backend.Data;
using budget_app_backend.Models;
using budget_app_backend.Services;
using Xunit;

namespace budget_app_backend.Tests;

public sealed class PlaidSyncServiceTests
{
    [Fact]
    public async Task SyncUserAsync_imports_transactions_and_persists_cursor()
    {
        await using var database = await TestDatabase.CreateAsync((1, "item-1", "token-1"));
        var service = database.CreateService(SyncPage("txn-1", 45.75m, "cursor-1"));

        var results = await service.SyncUserAsync(1);
        var stored = await database.Context.PlaidTransactions.SingleAsync();
        var item = await database.Context.PlaidItems.SingleAsync();

        Assert.Single(results);
        Assert.Equal(1, results[0].Added);
        Assert.Equal(-45.75m, stored.Amount);
        Assert.Equal("expense", stored.Type);
        Assert.Equal("Restaurants", stored.Category);
        Assert.Equal("cursor-1", item.Cursor);
    }

    [Fact]
    public async Task SyncUserAsync_upserts_duplicate_transaction_instead_of_duplicating_it()
    {
        await using var database = await TestDatabase.CreateAsync((1, "item-1", "token-1"));
        var service = database.CreateService(
            SyncPage("txn-1", 45.75m, "cursor-1"),
            SyncPage("txn-1", 49.25m, "cursor-2", name: "Updated merchant"));

        await service.SyncUserAsync(1);
        await service.SyncUserAsync(1);

        var transactions = await database.Context.PlaidTransactions.ToListAsync();
        Assert.Single(transactions);
        Assert.Equal(-49.25m, transactions[0].Amount);
        Assert.Equal("Updated merchant", transactions[0].Description);
    }

    [Fact]
    public async Task SyncUserAsync_replaces_pending_transaction_when_posted_version_arrives()
    {
        await using var database = await TestDatabase.CreateAsync((1, "item-1", "token-1"));
        var service = database.CreateService(
            SyncPage("pending-1", 12m, "cursor-1", pending: true),
            """
            {"added":[{"transaction_id":"posted-1","pending_transaction_id":"pending-1","name":"Cafe","amount":13.25,"date":"2026-09-02","pending":false,"category":["Food"]}],"modified":[],"removed":[{"transaction_id":"pending-1"}],"next_cursor":"cursor-2","has_more":false}
            """);

        await service.SyncUserAsync(1);
        await service.SyncUserAsync(1);

        var transactions = await database.Context.PlaidTransactions.ToListAsync();
        var posted = Assert.Single(transactions);
        Assert.Equal("posted-1", posted.PlaidTransactionId);
        Assert.Equal("pending-1", posted.PendingTransactionId);
        Assert.Equal(-13.25m, posted.Amount);
        Assert.False(posted.Pending);
    }

    [Fact]
    public async Task SyncUserAsync_only_processes_items_owned_by_requested_user()
    {
        await using var database = await TestDatabase.CreateAsync(
            (1, "item-1", "token-1"),
            (2, "item-2", "token-2"));
        var service = database.CreateService(
            SyncPage("user-1-txn", 10m, "user-1-cursor"),
            SyncPage("user-2-txn", 20m, "user-2-cursor"));

        await service.SyncUserAsync(1);
        var firstUserTransactions = await database.Context.PlaidTransactions
            .Where(transaction => transaction.PlaidItem.UserId == 1)
            .ToListAsync();
        var secondItem = await database.Context.PlaidItems.SingleAsync(item => item.UserId == 2);

        Assert.Single(firstUserTransactions);
        Assert.Equal("user-1-txn", firstUserTransactions[0].PlaidTransactionId);
        Assert.Null(secondItem.Cursor);

        await service.SyncUserAsync(2);
        Assert.Equal(2, await database.Context.PlaidTransactions.CountAsync());
    }

    [Fact]
    public async Task SchemaInitializer_adds_plaid_tables_to_existing_sqlite_schema()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlite(connection).Options;
        await using var context = new ApplicationDbContext(options);
        await context.Database.ExecuteSqlRawAsync(
            "CREATE TABLE Users (Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, FirstName TEXT NOT NULL, LastName TEXT NOT NULL, Email TEXT NOT NULL, PasswordHash TEXT NOT NULL, CreatedAt TEXT NOT NULL, UpdatedAt TEXT NULL);");
        await context.Database.ExecuteSqlRawAsync(
            "CREATE TABLE Transactions (Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, UserId INTEGER NOT NULL, Description TEXT NOT NULL, Amount TEXT NOT NULL, Category TEXT NOT NULL, Type TEXT NOT NULL, Date TEXT NOT NULL, CreatedAt TEXT NOT NULL, FOREIGN KEY (UserId) REFERENCES Users (Id) ON DELETE CASCADE);");

        await new PlaidSchemaInitializer(context).InitializeAsync();
        context.Users.Add(new User
        {
            FirstName = "Existing",
            LastName = "Schema",
            Email = "existing-schema@example.test",
            PasswordHash = "not-used"
        });
        await context.SaveChangesAsync();
        context.PlaidItems.Add(new PlaidItem
        {
            UserId = 1,
            PlaidItemId = "new-plaid-item",
            ProtectedAccessToken = "protected"
        });
        await context.SaveChangesAsync();

        Assert.Single(await context.PlaidItems.ToListAsync());
    }

    private static string SyncPage(string transactionId, decimal amount, string cursor, string name = "Cafe", bool pending = false) =>
        JsonSerializer.Serialize(new
        {
            added = new[]
            {
                new
                {
                    transaction_id = transactionId,
                    name,
                    amount,
                    date = "2026-09-01",
                    pending,
                    category = new[] { "Restaurants" }
                }
            },
            modified = Array.Empty<object>(),
            removed = Array.Empty<object>(),
            next_cursor = cursor,
            has_more = false
        });

    private sealed class TestDatabase : IAsyncDisposable
    {
        private readonly SqliteConnection _connection;
        private readonly IDataProtectionProvider _protectionProvider;

        private TestDatabase(SqliteConnection connection, ApplicationDbContext context, IDataProtectionProvider protectionProvider)
        {
            _connection = connection;
            Context = context;
            _protectionProvider = protectionProvider;
        }

        public ApplicationDbContext Context { get; }

        public static async Task<TestDatabase> CreateAsync(params (int UserId, string ItemId, string Token)[] items)
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlite(connection).Options;
            var context = new ApplicationDbContext(options);
            await context.Database.EnsureCreatedAsync();

            foreach (var userId in items.Select(item => item.UserId).Distinct())
            {
                context.Users.Add(new User
                {
                    Id = userId,
                    FirstName = "Test",
                    LastName = $"User{userId}",
                    Email = $"user{userId}@example.test",
                    PasswordHash = "not-used"
                });
            }

            var protectionProvider = new EphemeralDataProtectionProvider();
            var protector = protectionProvider.CreateProtector("Saavy.Plaid.AccessToken.v1");
            context.PlaidItems.AddRange(items.Select(item => new PlaidItem
            {
                UserId = item.UserId,
                PlaidItemId = item.ItemId,
                ProtectedAccessToken = protector.Protect(item.Token)
            }));
            await context.SaveChangesAsync();
            return new TestDatabase(connection, context, protectionProvider);
        }

        public PlaidSyncService CreateService(params string[] responses)
        {
            var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Plaid:ClientId"] = "fake-client-id",
                ["Plaid:Secret"] = "fake-secret",
                ["Plaid:Environment"] = "sandbox"
            }).Build();
            var handler = new FakePlaidHandler(responses);
            var apiClient = new PlaidApiClient(new HttpClient(handler), configuration);
            return new PlaidSyncService(Context, apiClient, _protectionProvider);
        }

        public async ValueTask DisposeAsync()
        {
            await Context.DisposeAsync();
            await _connection.DisposeAsync();
        }
    }

    private sealed class FakePlaidHandler : HttpMessageHandler
    {
        private readonly Queue<string> _responses;

        public FakePlaidHandler(IEnumerable<string> responses)
        {
            _responses = new Queue<string>(responses);
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Assert.Equal("https://sandbox.plaid.com/transactions/sync", request.RequestUri?.ToString());
            Assert.NotEmpty(_responses);
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(_responses.Dequeue(), Encoding.UTF8, "application/json")
            });
        }
    }
}