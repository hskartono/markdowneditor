namespace Backend.Services;

public class ImageService
{
    private readonly string _uploadPath;
    private readonly long _maxFileSize = 5 * 1024 * 1024; // 5 MB
    private readonly string[] _allowedExtensions = { ".jpg", ".jpeg", ".png", ".gif", ".webp" };

    public ImageService(IWebHostEnvironment environment)
    {
        _uploadPath = Path.Combine(environment.WebRootPath, "uploads");
        Directory.CreateDirectory(_uploadPath);
    }

    public bool ValidateImage(IFormFile file, out string? error)
    {
        error = null;

        if (file == null || file.Length == 0)
        {
            error = "No file uploaded";
            return false;
        }

        if (file.Length > _maxFileSize)
        {
            error = "File size exceeds 5 MB limit";
            return false;
        }

        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!_allowedExtensions.Contains(extension))
        {
            error = "Invalid file type. Allowed: jpg, jpeg, png, gif, webp";
            return false;
        }

        return true;
    }

    public async Task<string> SaveImageAsync(IFormFile file)
    {
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        var fileName = $"{Guid.NewGuid()}{extension}";
        var filePath = Path.Combine(_uploadPath, fileName);

        using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        return $"/uploads/{fileName}";
    }

    public bool DeleteImage(string url)
    {
        try
        {
            if (url.StartsWith("/uploads/"))
            {
                var fileName = url.Substring("/uploads/".Length);
                var filePath = Path.Combine(_uploadPath, fileName);
                if (File.Exists(filePath))
                {
                    File.Delete(filePath);
                    return true;
                }
            }
            return false;
        }
        catch
        {
            return false;
        }
    }
}
