using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using budget_app_backend.Data;
using budget_app_backend.Models;
using Xunit;

namespace budget_app_backend.OllamaTests;

public sealed class OllamaAnalysisSmokeTests
{
    [Fact]
    public async Task Authenticated_analysis_endpoint_returns_model_json_for_users_transactions()
    {
        var ollamaBaseUrl = Environment.GetEnvironmentVariable("OLLAMA_BASE_URL") ?? "http://localhost:11434";
        var ollamaModel = Environment.GetEnvironmentVariable("OLLAMA_MODEL") ?? "mistral:7b";
        using var ollamaClient = new HttpClient();
        using var tagsResponse = await ollamaClient.GetAsync($"{ollamaBaseUrl.TrimEnd('/')}/api/tags");
        tagsResponse.EnsureSuccessStatusCode();
        using var tags = await JsonDocument.ParseAsync(await tagsResponse.Content.ReadAsStreamAsync());
        Assert.Contains(tags.RootElement.GetProperty("models").EnumerateArray(), model =>
            string.Equals(model.GetProperty("name").GetString(), ollamaModel, StringComparison.OrdinalIgnoreCase));

        var databaseDirectory = Path.Combine(Path.GetTempPath(), $"saavy-ollama-e2e-{Guid.NewGuid():N}");
        Directory.CreateDirectory(databaseDirectory);
        var databasePath = Path.Combine(databaseDirectory, "ollama-e2e.db");
        var originalJwtSecret = Environment.GetEnvironmentVariable("Jwt__SecretKey");
        var originalJwtIssuer = Environment.GetEnvironmentVariable("Jwt__Issuer");
        var originalJwtAudience = Environment.GetEnvironmentVariable("Jwt__Audience");
        Environment.SetEnvironmentVariable("Jwt__SecretKey", "ollama-test-only-signing-secret-long-enough-for-hmac");
        Environment.SetEnvironmentVariable("Jwt__Issuer", "SaavyOllamaTests");
        Environment.SetEnvironmentVariable("Jwt__Audience", "SaavyOllamaTestUsers");

        using var application = new OllamaTestApplicationFactory(databasePath, ollamaBaseUrl, ollamaModel);
        using var appClient = application.CreateClient();
        appClient.Timeout = TimeSpan.FromMinutes(4);
        try
        {
            var email = $"ollama-{Guid.NewGuid():N}@example.test";
            var registration = await appClient.PostAsJsonAsync("/api/auth/register", new
            {
                firstName = "Ollama",
                lastName = "Verifier",
                email,
                password = "Ollama-test-password-123!",
                confirmPassword = "Ollama-test-password-123!"
            });
            registration.EnsureSuccessStatusCode();
            using var registrationBody = await JsonDocument.ParseAsync(await registration.Content.ReadAsStreamAsync());
            appClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
                "Bearer", registrationBody.RootElement.GetProperty("token").GetString());

            using (var scope = application.Services.CreateScope())
            {
                var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                var user = await context.Users.SingleAsync(candidate => candidate.Email == email);
                context.Transactions.AddRange(
                    new Transaction
                    {
                        UserId = user.Id,
                        Description = "Market produce",
                        Amount = 64.20m,
                        Category = "Food",
                        Type = "expense",
                        Date = DateTime.UtcNow.Date.AddDays(-1)
                    },
                    new Transaction
                    {
                        UserId = user.Id,
                        Description = "Monthly salary",
                        Amount = 3200m,
                        Category = "Income",
                        Type = "income",
                        Date = DateTime.UtcNow.Date.AddDays(-2)
                    });
                await context.SaveChangesAsync();
            }

            var response = await appClient.PostAsJsonAsync("/api/ai-insights", new
            {
                budgetGoal = 1000,
                categoryGoals = new Dictionary<string, decimal> { ["Food"] = 300 }
            });
            response.EnsureSuccessStatusCode();

            using var body = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync());
            var analysis = JsonDocument.Parse(body.RootElement.GetProperty("response").GetString()!);
            Assert.True(analysis.RootElement.GetProperty("overallScore").GetInt32() is >= 0 and <= 100);
            Assert.False(string.IsNullOrWhiteSpace(analysis.RootElement.GetProperty("summary").GetString()));
            Assert.Equal(JsonValueKind.Array, analysis.RootElement.GetProperty("insights").ValueKind);
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

    private sealed class OllamaTestApplicationFactory : WebApplicationFactory<Program>
    {
        private readonly string _databasePath;
        private readonly string _ollamaBaseUrl;
        private readonly string _ollamaModel;

        public OllamaTestApplicationFactory(string databasePath, string ollamaBaseUrl, string ollamaModel)
        {
            _databasePath = databasePath;
            _ollamaBaseUrl = ollamaBaseUrl;
            _ollamaModel = ollamaModel;
        }

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Development");
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:DefaultConnection"] = $"Data Source={_databasePath}",
                ["Jwt:SecretKey"] = "ollama-test-only-signing-secret-long-enough-for-hmac",
                ["Jwt:Issuer"] = "SaavyOllamaTests",
                ["Jwt:Audience"] = "SaavyOllamaTestUsers",
                ["Ollama:BaseUrl"] = _ollamaBaseUrl,
                ["Ollama:Model"] = _ollamaModel
            }));
        }
    }
}