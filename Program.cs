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

// Ensure database is created and migrated
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

    // If the database already exists but has no migration history (e.g. created via
    // EnsureCreated), mark all existing migrations as applied so Migrate() won't
    // attempt to re-create tables that are already present.
    if (db.Database.CanConnect())
    {
        var pending = db.Database.GetPendingMigrations().ToList();
        var applied = db.Database.GetAppliedMigrations().ToList();

        if (pending.Any() && !applied.Any())
        {
            var allMigrations = db.Database.GetMigrations().ToList();

            db.Database.ExecuteSqlRaw(
                "CREATE TABLE IF NOT EXISTS \"__EFMigrationsHistory\" (" +
                "\"MigrationId\" TEXT NOT NULL PRIMARY KEY, " +
                "\"ProductVersion\" TEXT NOT NULL)");

            foreach (var migration in allMigrations)
            {
                db.Database.ExecuteSqlRaw(
                    "INSERT OR IGNORE INTO \"__EFMigrationsHistory\" (\"MigrationId\", \"ProductVersion\") VALUES ({0}, {1})",
                    migration,
                    "8.0.0");
            }
        }
    }

    db.Database.Migrate();
}

app.UseCors();
app.UseStaticFiles();

// API Endpoints

// === Folder Endpoints ===

// GET /api/folders
app.MapGet("/api/folders", async (AppDbContext db) =>
{
    var folders = await db.Folders
        .OrderBy(f => f.Name)
        .Select(f => new
        {
            f.Id,
            f.Name,
            DocumentCount = f.Documents.Count,
            f.CreatedAt,
            f.UpdatedAt
        })
        .ToListAsync();

    return Results.Ok(folders);
});

// POST /api/folders
app.MapPost("/api/folders", async (AppDbContext db, FolderRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.Name))
        return Results.BadRequest(new { error = "Folder name is required" });

    var folder = new Folder
    {
        Name = request.Name.Trim(),
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow
    };

    db.Folders.Add(folder);
    await db.SaveChangesAsync();

    return Results.Ok(new { folder.Id, folder.Name, DocumentCount = 0, folder.CreatedAt, folder.UpdatedAt });
});

// PUT /api/folders/{id}
app.MapPut("/api/folders/{id:int}", async (AppDbContext db, int id, FolderRequest request) =>
{
    var folder = await db.Folders.FindAsync(id);
    if (folder == null)
        return Results.NotFound();

    if (string.IsNullOrWhiteSpace(request.Name))
        return Results.BadRequest(new { error = "Folder name is required" });

    folder.Name = request.Name.Trim();
    folder.UpdatedAt = DateTime.UtcNow;

    await db.SaveChangesAsync();

    var documentCount = await db.Documents.CountAsync(d => d.FolderId == id);
    return Results.Ok(new { folder.Id, folder.Name, DocumentCount = documentCount, folder.CreatedAt, folder.UpdatedAt });
});

// DELETE /api/folders/{id}
app.MapDelete("/api/folders/{id:int}", async (AppDbContext db, int id) =>
{
    var folder = await db.Folders.FindAsync(id);
    if (folder == null)
        return Results.NotFound();

    // Move documents out of folder (set FolderId to null)
    var docs = await db.Documents.Where(d => d.FolderId == id).ToListAsync();
    foreach (var doc in docs)
    {
        doc.FolderId = null;
    }

    db.Folders.Remove(folder);
    await db.SaveChangesAsync();

    return Results.NoContent();
});

// PUT /api/documents/{id}/move
app.MapPut("/api/documents/{id:int}/move", async (AppDbContext db, int id, MoveDocumentRequest request) =>
{
    var document = await db.Documents.FindAsync(id);
    if (document == null)
        return Results.NotFound();

    if (request.FolderId.HasValue)
    {
        var folder = await db.Folders.FindAsync(request.FolderId.Value);
        if (folder == null)
            return Results.BadRequest(new { error = "Folder not found" });
    }

    document.FolderId = request.FolderId;
    document.UpdatedAt = DateTime.UtcNow;

    await db.SaveChangesAsync();

    return Results.Ok(new { document.Id, document.FolderId });
});

// === Document Endpoints ===

// GET /api/documents?page={page}&pageSize={pageSize}&folderId={folderId}
app.MapGet("/api/documents", async (AppDbContext db, int page = 0, int pageSize = 20, int? folderId = null) =>
{
    IQueryable<Document> query = db.Documents;

    if (folderId.HasValue)
    {
        if (folderId.Value == 0)
            query = query.Where(d => d.FolderId == null);
        else
            query = query.Where(d => d.FolderId == folderId.Value);
    }

    var totalCount = await query.CountAsync();
    var documents = await query
        .OrderByDescending(d => d.CreatedAt)
        .Skip(page * pageSize)
        .Take(pageSize)
        .Select(d => new
        {
            d.Id,
            d.Title,
            Preview = d.Content.Length > 100 ? d.Content.Substring(0, 100) + "..." : d.Content,
            d.CreatedAt,
            d.UpdatedAt,
            d.FolderId
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
record FolderRequest(string? Name);
record MoveDocumentRequest(int? FolderId);
