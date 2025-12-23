using Microsoft.AspNetCore.Mvc;

namespace budget_app_backend.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TestController : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        return Ok(new { message = "Backend is working!", timestamp = DateTime.UtcNow });
    }
    
    [HttpGet("ping")]
    public IActionResult Ping()
    {
        return Ok("Pong");
    }
}