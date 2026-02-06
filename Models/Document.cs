namespace Backend.Models;

public class Document
{
    public int Id { get; set; }
    public string? Title { get; set; }
    public string Content { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string ShareId { get; set; } = Guid.NewGuid().ToString();
    public int? FolderId { get; set; }
    public Folder? Folder { get; set; }

    public void UpdateTitle()
    {
        // Extract title from first # heading
        var lines = Content.Split('\n');
        foreach (var line in lines)
        {
            var trimmed = line.Trim();
            if (trimmed.StartsWith("# "))
            {
                Title = trimmed.Substring(2).Trim();
                return;
            }
        }
        Title = null;
    }
}
