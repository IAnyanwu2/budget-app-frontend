using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace budget_app_backend.Services;

public sealed class PlaidApiClient
{
    private readonly HttpClient _httpClient;
    private readonly IConfiguration _configuration;

    public PlaidApiClient(HttpClient httpClient, IConfiguration configuration)
    {
        _httpClient = httpClient;
        _configuration = configuration;
        _httpClient.BaseAddress = new Uri(GetBaseUrl());
    }

    public async Task<string> CreateLinkTokenAsync(int userId, CancellationToken cancellationToken = default)
    {
        var response = await PostAsync("/link/token/create", new Dictionary<string, object?>
        {
            ["client_name"] = _configuration["Plaid:ClientName"] ?? "Saavy",
            ["country_codes"] = new[] { "US" },
            ["language"] = "en",
            ["products"] = new[] { "transactions" },
            ["user"] = new Dictionary<string, string> { ["client_user_id"] = userId.ToString() }
        }, cancellationToken);

        return RequiredString(response.RootElement, "link_token");
    }

    public async Task<PlaidExchangeResult> ExchangePublicTokenAsync(string publicToken, CancellationToken cancellationToken = default)
    {
        var response = await PostAsync("/item/public_token/exchange", new Dictionary<string, object?>
        {
            ["public_token"] = publicToken
        }, cancellationToken);

        return new PlaidExchangeResult(
            RequiredString(response.RootElement, "access_token"),
            RequiredString(response.RootElement, "item_id"));
    }

    public async Task<PlaidSyncPage> SyncTransactionsAsync(string accessToken, string? cursor, CancellationToken cancellationToken = default)
    {
        var request = new Dictionary<string, object?>
        {
            ["access_token"] = accessToken,
            ["count"] = 500
        };
        if (!string.IsNullOrWhiteSpace(cursor))
        {
            request["cursor"] = cursor;
        }

        var response = await PostAsync("/transactions/sync", request, cancellationToken);
        var root = response.RootElement;
        return new PlaidSyncPage(
            ReadTransactions(root, "added"),
            ReadTransactions(root, "modified"),
            ReadRemoved(root),
            RequiredString(root, "next_cursor"),
            root.TryGetProperty("has_more", out var hasMore) && hasMore.GetBoolean());
    }

    private async Task<JsonDocument> PostAsync(string path, Dictionary<string, object?> request, CancellationToken cancellationToken)
    {
        var clientId = _configuration["Plaid:ClientId"];
        var secret = _configuration["Plaid:Secret"];
        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(secret))
        {
            throw new InvalidOperationException("Plaid credentials are not configured. Set Plaid__ClientId and Plaid__Secret.");
        }

        request["client_id"] = clientId;
        request["secret"] = secret;
        using var response = await _httpClient.PostAsJsonAsync(path, request, cancellationToken);
        var content = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var errorCode = "unknown";
            try
            {
                using var error = JsonDocument.Parse(content);
                if (error.RootElement.TryGetProperty("error_code", out var code))
                {
                    errorCode = code.GetString() ?? errorCode;
                }
            }
            catch (JsonException)
            {
                // Keep the response body out of logs and client errors.
            }

            throw new PlaidApiException(response.StatusCode, errorCode);
        }

        return JsonDocument.Parse(content);
    }

    private string GetBaseUrl()
    {
        var environment = (_configuration["Plaid:Environment"] ?? "sandbox").ToLowerInvariant();
        return environment switch
        {
            "sandbox" => "https://sandbox.plaid.com",
            "development" => "https://development.plaid.com",
            "production" => "https://production.plaid.com",
            _ => throw new InvalidOperationException("Plaid:Environment must be sandbox, development, or production.")
        };
    }

    private static IReadOnlyList<PlaidTransactionChange> ReadTransactions(JsonElement root, string property)
    {
        if (!root.TryGetProperty(property, out var transactions) || transactions.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<PlaidTransactionChange>();
        }

        return transactions.EnumerateArray().Select(transaction => new PlaidTransactionChange(
            RequiredString(transaction, "transaction_id"),
            ReadString(transaction, "name"),
            ReadString(transaction, "merchant_name"),
            transaction.TryGetProperty("amount", out var amount) ? amount.GetDecimal() : 0,
            ReadString(transaction, "date"),
            ReadString(transaction, "authorized_date"),
            ReadString(transaction, "pending_transaction_id"),
            transaction.TryGetProperty("pending", out var pending) && pending.GetBoolean(),
            ReadCategory(transaction))).ToArray();
    }

    private static IReadOnlyList<string> ReadRemoved(JsonElement root)
    {
        if (!root.TryGetProperty("removed", out var removed) || removed.ValueKind != JsonValueKind.Array)
        {
            return Array.Empty<string>();
        }

        return removed.EnumerateArray()
            .Select(transaction => ReadString(transaction, "transaction_id"))
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Cast<string>()
            .ToArray();
    }

    private static string ReadCategory(JsonElement transaction)
    {
        if (transaction.TryGetProperty("personal_finance_category", out var personalFinanceCategory) &&
            personalFinanceCategory.TryGetProperty("detailed", out var detailed) &&
            !string.IsNullOrWhiteSpace(detailed.GetString()))
        {
            return detailed.GetString()!;
        }

        if (transaction.TryGetProperty("category", out var category) && category.ValueKind == JsonValueKind.Array && category.GetArrayLength() > 0)
        {
            return category[0].GetString() ?? "Other";
        }

        return "Other";
    }

    private static string RequiredString(JsonElement element, string property) =>
        ReadString(element, property) ?? throw new InvalidOperationException($"Plaid response did not contain '{property}'.");

    private static string? ReadString(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
}

public sealed record PlaidExchangeResult(string AccessToken, string ItemId);

public sealed record PlaidTransactionChange(
    string TransactionId,
    string? Name,
    string? MerchantName,
    decimal Amount,
    string? Date,
    string? AuthorizedDate,
    string? PendingTransactionId,
    bool Pending,
    string Category);

public sealed record PlaidSyncPage(
    IReadOnlyList<PlaidTransactionChange> Added,
    IReadOnlyList<PlaidTransactionChange> Modified,
    IReadOnlyList<string> Removed,
    string NextCursor,
    bool HasMore);

public sealed class PlaidApiException : Exception
{
    public PlaidApiException(HttpStatusCode statusCode, string errorCode)
        : base($"Plaid returned {(int)statusCode} ({errorCode}).")
    {
        StatusCode = statusCode;
        ErrorCode = errorCode;
    }

    public HttpStatusCode StatusCode { get; }
    public string ErrorCode { get; }
}