using System.Net.Http.Headers;
using System.Net.Http.Json;
using budget_app_backend.Data;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace budget_app_backend.SandboxTests;

public sealed class PlaidSandboxSmokeTests
{
    [Fact]
    public async Task Authenticated_app_can_link_sandbox_item_and_read_synced_transactions()
    {
        var clientId = Environment.GetEnvironmentVariable("PLAID_CLIENT_ID");
        var secret = Environment.GetEnvironmentVariable("PLAID_SECRET");
        Assert.False(string.IsNullOrWhiteSpace(clientId), "Set PLAID_CLIENT_ID or Plaid__ClientID in the repository .env.");
        Assert.False(string.IsNullOrWhiteSpace(secret), "Set PLAID_SECRET or Plaid__Secret in the repository .env.");

        var databaseDirectory = Path.Combine(Path.GetTempPath(), $"saavy-plaid-e2e-{Guid.NewGuid():N}");
        Directory.CreateDirectory(databaseDirectory);
        var databasePath = Path.Combine(databaseDirectory, "sandbox-e2e.db");
        var originalJwtSecret = Environment.GetEnvironmentVariable("Jwt__SecretKey");
        var originalJwtIssuer = Environment.GetEnvironmentVariable("Jwt__Issuer");
        var originalJwtAudience = Environment.GetEnvironmentVariable("Jwt__Audience");
        Environment.SetEnvironmentVariable("Jwt__SecretKey", "sandbox-test-only-signing-secret-long-enough-for-hmac");
        Environment.SetEnvironmentVariable("Jwt__Issuer", "SaavySandboxTests");
        Environment.SetEnvironmentVariable("Jwt__Audience", "SaavySandboxTestUsers");
        using var application = new PlaidTestApplicationFactory(databasePath, clientId!, secret!);
        using var appClient = application.CreateClient();

        try
        {
            var email = $"sandbox-{Guid.NewGuid():N}@example.test";
            var registration = await appClient.PostAsJsonAsync("/api/auth/register", new
            {
                firstName = "Sandbox",
                lastName = "Verifier",
                email,
                password = "Sandbox-test-password-123!",
                confirmPassword = "Sandbox-test-password-123!"
            });
            registration.EnsureSuccessStatusCode();
            using var registrationBody = await JsonDocument.ParseAsync(await registration.Content.ReadAsStreamAsync());
            var authToken = registrationBody.RootElement.GetProperty("token").GetString();
            Assert.False(string.IsNullOrWhiteSpace(authToken));
            using var serviceScope = application.Services.CreateScope();
            var tokenPrincipal = serviceScope.ServiceProvider
                .GetRequiredService<budget_app_backend.Services.IJwtService>()
                .ValidateToken(authToken!);
            Assert.NotNull(tokenPrincipal);
            Assert.NotNull(tokenPrincipal!.FindFirst(ClaimTypes.NameIdentifier));
            appClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", authToken);

            var currentUser = await appClient.GetAsync("/api/auth/me");
            var challenge = string.Join(", ", currentUser.Headers.WwwAuthenticate.Select(value => value.ToString()));
            Assert.True(currentUser.IsSuccessStatusCode, $"Newly issued app JWT was rejected by /api/auth/me: {(int)currentUser.StatusCode}; challenge: {challenge}");

            var linkTokenResponse = await appClient.PostAsJsonAsync("/api/plaid/link-token", new { });
            linkTokenResponse.EnsureSuccessStatusCode();
            using var linkTokenBody = await JsonDocument.ParseAsync(await linkTokenResponse.Content.ReadAsStreamAsync());
            Assert.StartsWith("link-", linkTokenBody.RootElement.GetProperty("linkToken").GetString(), StringComparison.Ordinal);

            using var plaidClient = new HttpClient();
            using var sandboxPublicToken = await plaidClient.PostAsJsonAsync(
                "https://sandbox.plaid.com/sandbox/public_token/create",
                new
                {
                    client_id = clientId,
                    secret,
                    institution_id = "ins_109508",
                    initial_products = new[] { "transactions" },
                    options = new
                    {
                        override_username = "user_transactions_dynamic",
                        override_password = "sandbox-test-password"
                    }
                });
            sandboxPublicToken.EnsureSuccessStatusCode();
            using var sandboxTokenBody = await JsonDocument.ParseAsync(await sandboxPublicToken.Content.ReadAsStreamAsync());
            var publicToken = sandboxTokenBody.RootElement.GetProperty("public_token").GetString();

            var exchange = await appClient.PostAsJsonAsync("/api/plaid/exchange", new { publicToken });

            string protectedAccessToken;
            using (var scope = application.Services.CreateScope())
            {
                var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var item = await context.PlaidItems.SingleAsync();
                protectedAccessToken = scope.ServiceProvider
                    .GetRequiredService<IDataProtectionProvider>()
                    .CreateProtector("Saavy.Plaid.AccessToken.v1")
                    .Unprotect(item.ProtectedAccessToken);
            }

            var transactionDate = DateTime.UtcNow.Date.AddDays(-1).ToString("yyyy-MM-dd");
            using var seededTransactions = await plaidClient.PostAsJsonAsync(
                "https://sandbox.plaid.com/sandbox/transactions/create",
                new
                {
                    client_id = clientId,
                    secret,
                    access_token = protectedAccessToken,
                    transactions = new[]
                    {
                        new
                        {
                            amount = 42.50,
                            date_posted = transactionDate,
                            date_transacted = transactionDate,
                            description = "Sandbox Cafe Purchase"
                        }
                    }
                });
            seededTransactions.EnsureSuccessStatusCode();
            exchange.EnsureSuccessStatusCode();

            var sync = await appClient.PostAsJsonAsync("/api/plaid/sync", new { });
            sync.EnsureSuccessStatusCode();
            using var syncBody = await JsonDocument.ParseAsync(await sync.Content.ReadAsStreamAsync());
            Assert.True(
                syncBody.RootElement.EnumerateArray().Sum(item => item.GetProperty("added").GetInt32()) > 0,
                $"Plaid Sandbox sync returned no new transactions: {syncBody.RootElement}");

            var transactions = await appClient.GetAsync("/api/transactions/recent");
            transactions.EnsureSuccessStatusCode();
            using var transactionsBody = await JsonDocument.ParseAsync(await transactions.Content.ReadAsStreamAsync());
            Assert.True(transactionsBody.RootElement.GetArrayLength() > 0, "Sandbox sync completed but the authenticated transaction endpoint returned no rows.");
        }
        finally
        {
            application.Dispose();
            Directory.Delete(databaseDirectory, recursive: true);
            Environment.SetEnvironmentVariable("Jwt__SecretKey", originalJwtSecret);
            Environment.SetEnvironmentVariable("Jwt__Issuer", originalJwtIssuer);
            Environment.SetEnvironmentVariable("Jwt__Audience", originalJwtAudience);
        }
    }

    private sealed class PlaidTestApplicationFactory : WebApplicationFactory<Program>
    {
        private readonly string _databasePath;
        private readonly string _clientId;
        private readonly string _secret;

        public PlaidTestApplicationFactory(string databasePath, string clientId, string secret)
        {
            _databasePath = databasePath;
            _clientId = clientId;
            _secret = secret;
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = $"Data Source={_databasePath}",
                ["Jwt:SecretKey"] = "sandbox-test-only-signing-secret-long-enough-for-hmac",
                ["Jwt:Issuer"] = "SaavySandboxTests",
                ["Jwt:Audience"] = "SaavySandboxTestUsers",
                ["Plaid:ClientId"] = _clientId,
                ["Plaid:Secret"] = _secret,
                ["Plaid:Environment"] = "sandbox"
            }));
        }
    }
}