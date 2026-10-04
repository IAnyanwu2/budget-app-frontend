using System.Globalization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using budget_app_backend.Data;
using budget_app_backend.Models;

namespace budget_app_backend.Services;

public sealed class PlaidSyncService
{
    private readonly ApplicationDbContext _context;
    private readonly PlaidApiClient _plaidApi;
    private readonly IDataProtector _tokenProtector;

    public PlaidSyncService(ApplicationDbContext context, PlaidApiClient plaidApi, IDataProtectionProvider protectionProvider)
    {
        _context = context;
        _plaidApi = plaidApi;
        _tokenProtector = protectionProvider.CreateProtector("Saavy.Plaid.AccessToken.v1");
    }

    public async Task<string> CreateLinkTokenAsync(int userId, CancellationToken cancellationToken = default) =>
        await _plaidApi.CreateLinkTokenAsync(userId, cancellationToken);

    public async Task<bool> ConnectItemAsync(int userId, string publicToken, CancellationToken cancellationToken = default)
    {
        var exchange = await _plaidApi.ExchangePublicTokenAsync(publicToken, cancellationToken);
        var existing = await _context.PlaidItems.SingleOrDefaultAsync(item => item.PlaidItemId == exchange.ItemId, cancellationToken);
        if (existing is not null && existing.UserId != userId)
        {
            return false;
        }

        if (existing is null)
        {
            _context.PlaidItems.Add(new PlaidItem
            {
                UserId = userId,
                PlaidItemId = exchange.ItemId,
                ProtectedAccessToken = _tokenProtector.Protect(exchange.AccessToken)
            });
        }
        else
        {
            existing.ProtectedAccessToken = _tokenProtector.Protect(exchange.AccessToken);
        }

        await _context.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<IReadOnlyList<PlaidSyncResult>> SyncUserAsync(int userId, CancellationToken cancellationToken = default)
    {
        var items = await _context.PlaidItems
            .Where(item => item.UserId == userId)
            .ToListAsync(cancellationToken);
        return await SyncItemsAsync(items, cancellationToken);
    }

    public async Task FireSandboxWebhookAsync(int userId, CancellationToken cancellationToken = default)
    {
        var items = await _context.PlaidItems
            .Where(item => item.UserId == userId)
            .ToListAsync(cancellationToken);
            
        foreach (var item in items)
        {
            await _plaidApi.FireSandboxWebhookAsync(_tokenProtector.Unprotect(item.ProtectedAccessToken), cancellationToken);
        }
    }

    public async Task CreateSandboxTransactionsAsync(int userId, int count = 5, CancellationToken cancellationToken = default)
    {
        var items = await _context.PlaidItems
            .Where(item => item.UserId == userId)
            .ToListAsync(cancellationToken);
            
        foreach (var item in items)
        {
            await _plaidApi.CreateSandboxTransactionAsync(_tokenProtector.Unprotect(item.ProtectedAccessToken), count, cancellationToken);
        }
    }

    public async Task<PlaidSyncResult?> SyncByPlaidItemIdAsync(string plaidItemId, CancellationToken cancellationToken = default)
    {
        var item = await _context.PlaidItems
            .SingleOrDefaultAsync(i => i.PlaidItemId == plaidItemId, cancellationToken);
            
        if (item is null)
        {
            return null;
        }

        var results = await SyncItemsAsync(new[] { item }, cancellationToken);
        return results.FirstOrDefault();
    }

    private async Task<IReadOnlyList<PlaidSyncResult>> SyncItemsAsync(IReadOnlyList<PlaidItem> items, CancellationToken cancellationToken)
    {
        var results = new List<PlaidSyncResult>(items.Count);

        foreach (var item in items)
        {
            var cursor = item.Cursor;
            var added = 0;
            var modified = 0;
            var removed = 0;
            var hasMore = true;

            while (hasMore)
            {
                var page = await _plaidApi.SyncTransactionsAsync(
                    _tokenProtector.Unprotect(item.ProtectedAccessToken), cursor, cancellationToken);

                foreach (var transaction in page.Added)
                {
                    await UpsertTransactionAsync(item.Id, transaction, cancellationToken);
                    added++;
                }
                await _context.SaveChangesAsync(cancellationToken);

                foreach (var transaction in page.Modified)
                {
                    await UpsertTransactionAsync(item.Id, transaction, cancellationToken);
                    modified++;
                }
                await _context.SaveChangesAsync(cancellationToken);

                foreach (var transactionId in page.Removed)
                {
                    var transaction = await _context.PlaidTransactions.SingleOrDefaultAsync(
                        stored => stored.PlaidItemId == item.Id && stored.PlaidTransactionId == transactionId,
                        cancellationToken);
                    if (transaction is not null)
                    {
                        _context.PlaidTransactions.Remove(transaction);
                        removed++;
                    }
                }
                await _context.SaveChangesAsync(cancellationToken);

                await _context.SaveChangesAsync(cancellationToken);
                cursor = page.NextCursor;
                hasMore = page.HasMore;
            }

            item.Cursor = cursor;
            item.LastSyncedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync(cancellationToken);
            results.Add(new PlaidSyncResult(item.Id, added, modified, removed, item.LastSyncedAt.Value));
        }

        return results;
    }

    private async Task UpsertTransactionAsync(int plaidItemId, PlaidTransactionChange change, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(change.PendingTransactionId))
        {
            var pending = await _context.PlaidTransactions.SingleOrDefaultAsync(
                transaction => transaction.PlaidItemId == plaidItemId &&
                    transaction.PlaidTransactionId == change.PendingTransactionId,
                cancellationToken);
            if (pending is not null && pending.PlaidTransactionId != change.TransactionId)
            {
                _context.PlaidTransactions.Remove(pending);
            }
        }

        var stored = await _context.PlaidTransactions.SingleOrDefaultAsync(
            transaction => transaction.PlaidItemId == plaidItemId &&
                transaction.PlaidTransactionId == change.TransactionId,
            cancellationToken);

        var signedAmount = -change.Amount;
        if (stored is null)
        {
            stored = new PlaidTransaction
            {
                PlaidItemId = plaidItemId,
                PlaidTransactionId = change.TransactionId
            };
            _context.PlaidTransactions.Add(stored);
        }

        stored.PendingTransactionId = change.PendingTransactionId;
        stored.Description = change.MerchantName ?? change.Name ?? "Transaction";
        stored.Amount = signedAmount;
        stored.Category = change.Category;
        stored.Type = signedAmount >= 0 ? "income" : "expense";
        stored.Date = ParseDate(change.Date) ?? ParseDate(change.AuthorizedDate) ?? DateTime.UtcNow.Date;
        stored.Pending = change.Pending;
    }

    private static DateTime? ParseDate(string? value) =>
        DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date)
            ? date.Date
            : null;
}

public sealed record PlaidSyncResult(int ItemId, int Added, int Modified, int Removed, DateTime LastSyncedAt);