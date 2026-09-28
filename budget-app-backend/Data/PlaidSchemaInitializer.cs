using Microsoft.EntityFrameworkCore;

namespace budget_app_backend.Data;

public sealed class PlaidSchemaInitializer
{
    private readonly ApplicationDbContext _context;

    public PlaidSchemaInitializer(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await _context.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS "PlaidItems" (
                "Id" INTEGER NOT NULL CONSTRAINT "PK_PlaidItems" PRIMARY KEY AUTOINCREMENT,
                "UserId" INTEGER NOT NULL,
                "PlaidItemId" TEXT NOT NULL,
                "ProtectedAccessToken" TEXT NOT NULL,
                "Cursor" TEXT NULL,
                "CreatedAt" TEXT NOT NULL,
                "LastSyncedAt" TEXT NULL,
                CONSTRAINT "FK_PlaidItems_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PlaidItems_PlaidItemId" ON "PlaidItems" ("PlaidItemId");
            """,
            cancellationToken);

        await _context.Database.ExecuteSqlRawAsync(
            """
            CREATE TABLE IF NOT EXISTS "PlaidTransactions" (
                "Id" INTEGER NOT NULL CONSTRAINT "PK_PlaidTransactions" PRIMARY KEY AUTOINCREMENT,
                "PlaidItemId" INTEGER NOT NULL,
                "PlaidTransactionId" TEXT NOT NULL,
                "PendingTransactionId" TEXT NULL,
                "Description" TEXT NOT NULL,
                "Amount" TEXT NOT NULL,
                "Category" TEXT NOT NULL,
                "Type" TEXT NOT NULL,
                "Date" TEXT NOT NULL,
                "Pending" INTEGER NOT NULL,
                CONSTRAINT "FK_PlaidTransactions_PlaidItems_PlaidItemId" FOREIGN KEY ("PlaidItemId") REFERENCES "PlaidItems" ("Id") ON DELETE CASCADE
            );
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PlaidTransactions_PlaidItemId_PlaidTransactionId" ON "PlaidTransactions" ("PlaidItemId", "PlaidTransactionId");
            """,
            cancellationToken);
    }
}