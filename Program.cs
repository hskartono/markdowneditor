using Microsoft.EntityFrameworkCore;
using Backend.Data;
using Backend.Models;
using Backend.Services;

var builder = WebApplication.CreateBuilder(args);

// Configure SQLite
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite("Data Source=markdown.db"));

// Register ImageService
builder.Services.AddSingleton<ImageService>();

// Configure CORS for development
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
});

// Configure file upload limit
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = 5 * 1024 * 1024; // 5 MB
});

var app = builder.Build();

// Ensure database is created
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
}

app.UseCors();
app.UseStaticFiles();

// API Endpoints

// GET /api/documents?page={page}&pageSize={pageSize}
app.MapGet("/api/documents", async (AppDbContext db, int page = 0, int pageSize = 20) =>
{
    var totalCount = await db.Documents.CountAsync();
    var documents = await db.Documents
        .OrderByDescending(d => d.CreatedAt)
        .Skip(page * pageSize)
        .Take(pageSize)
        .Select(d => new
        {
            d.Id,
            d.Title,
            Preview = d.Content.Length > 100 ? d.Content.Substring(0, 100) + "..." : d.Content,
            d.CreatedAt,
            d.UpdatedAt
        })
        .ToListAsync();

    var hasMore = (page + 1) * pageSize < totalCount;

    return Results.Ok(new { documents, hasMore });
});

// GET /api/documents/{id}
app.MapGet("/api/documents/{id:int}", async (AppDbContext db, int id) =>
{
    var document = await db.Documents.FindAsync(id);
    if (document == null)
        return Results.NotFound();

    return Results.Ok(new
    {
        document.Id,
        document.Title,
        document.Content,
        document.CreatedAt,
        document.UpdatedAt,
        document.ShareId
    });
});

// POST /api/documents
app.MapPost("/api/documents", async (AppDbContext db, DocumentRequest request) =>
{
    var document = new Document
    {
        Content = request.Content ?? string.Empty,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow,
        ShareId = Guid.NewGuid().ToString()
    };

    document.UpdateTitle();

    db.Documents.Add(document);
    await db.SaveChangesAsync();

    return Results.Ok(new
    {
        document.Id,
        document.Title,
        document.Content,
        document.CreatedAt,
        document.UpdatedAt,
        document.ShareId
    });
});

// PUT /api/documents/{id}
app.MapPut("/api/documents/{id:int}", async (AppDbContext db, int id, DocumentRequest request) =>
{
    var document = await db.Documents.FindAsync(id);
    if (document == null)
        return Results.NotFound();

    document.Content = request.Content ?? string.Empty;
    document.UpdatedAt = DateTime.UtcNow;
    document.UpdateTitle();

    await db.SaveChangesAsync();

    return Results.Ok(new
    {
        document.Id,
        document.Title,
        document.Content,
        document.CreatedAt,
        document.UpdatedAt,
        document.ShareId
    });
});

// DELETE /api/documents/{id}
app.MapDelete("/api/documents/{id:int}", async (AppDbContext db, int id) =>
{
    var document = await db.Documents.FindAsync(id);
    if (document == null)
        return Results.NotFound();

    db.Documents.Remove(document);
    await db.SaveChangesAsync();

    return Results.NoContent();
});

// GET /api/share/{shareId}
app.MapGet("/api/share/{shareId}", async (AppDbContext db, string shareId) =>
{
    var document = await db.Documents.FirstOrDefaultAsync(d => d.ShareId == shareId);
    if (document == null)
        return Results.NotFound();

    return Results.Ok(new
    {
        document.Content,
        document.Title,
        document.CreatedAt
    });
});

// POST /api/upload
app.MapPost("/api/upload", async (IFormFile file, ImageService imageService) =>
{
    if (!imageService.ValidateImage(file, out var error))
    {
        return Results.BadRequest(new { error });
    }

    var url = await imageService.SaveImageAsync(file);
    return Results.Ok(new { url });
})
.DisableAntiforgery();

// Serve index.html for root
app.MapGet("/", () => Results.Redirect("/index.html"));

// Serve share page
app.MapGet("/share/{shareId}", (string shareId) =>
{
    return Results.Content(File.ReadAllText(Path.Combine(builder.Environment.WebRootPath, "share.html")), "text/html");
});

app.Run();

// Request DTOs
record DocumentRequest(string? Content);
