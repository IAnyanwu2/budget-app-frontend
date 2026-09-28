using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using budget_app_backend.Data;
using budget_app_backend.Models;
using budget_app_backend.Services;
using Xunit;

namespace budget_app_backend.Tests;

public sealed class OllamaAnalysisServiceTests
{
    [Fact]
    public async Task GenerateInsightsAsync_uses_configured_model_and_only_users_transactions()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlite(connection).Options;
        await using var context = new ApplicationDbContext(options);
        await context.Database.EnsureCreatedAsync();

        var userOne = new User { Id = 1, FirstName = "One", LastName = "User", Email = "one@example.test", PasswordHash = "unused" };
        var userTwo = new User { Id = 2, FirstName = "Two", LastName = "User", Email = "two@example.test", PasswordHash = "unused" };
        context.Users.AddRange(userOne, userTwo);
        context.Transactions.AddRange(
            new Transaction
            {
                UserId = 1,
                Description = "User One Market",
                Amount = 22,
                Category = "Food",
                Type = "expense",
                Date = DateTime.UtcNow.Date
            },
            new Transaction
            {
                UserId = 2,
                Description = "Private Other User Purchase",
                Amount = 900,
                Category = "Private",
                Type = "expense",
                Date = DateTime.UtcNow.Date
            });
        await context.SaveChangesAsync();

        var handler = new FakeOllamaHandler();
        using var httpClient = new HttpClient(handler);
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Ollama:BaseUrl"] = "http://ollama.test",
            ["Ollama:Model"] = "sandbox-test-model"
        }).Build();
        var service = new OllamaAnalysisService(context, httpClient, configuration);

        var result = await service.GenerateInsightsAsync(1, 300, new Dictionary<string, decimal> { ["Food"] = 150 });

        Assert.Equal("{\"overallScore\":85,\"summary\":\"Test analysis\",\"insights\":[]}", result);
        Assert.NotNull(handler.RequestBody);
        using var request = JsonDocument.Parse(handler.RequestBody!);
        Assert.Equal("sandbox-test-model", request.RootElement.GetProperty("model").GetString());
        var prompt = request.RootElement.GetProperty("prompt").GetString();
        Assert.Contains("User One Market", prompt);
        Assert.DoesNotContain("Private Other User Purchase", prompt);
        Assert.Contains("\"budget_goal\":300", prompt);
    }

    private sealed class FakeOllamaHandler : HttpMessageHandler
    {
        public string? RequestBody { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Assert.Equal("http://ollama.test/api/generate", request.RequestUri?.ToString());
            RequestBody = await request.Content!.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(
                    "{\"response\":\"{\\\"overallScore\\\":85,\\\"summary\\\":\\\"Test analysis\\\",\\\"insights\\\":[]}\"}",
                    Encoding.UTF8,
                    "application/json")
            };
        }
    }
}