# Markdown Editor

A lightweight Markdown editor with a document list, live preview, autosave, sharing links, and image paste upload.

## Features
- Create, edit, and delete Markdown documents.
- Write/Preview tabs with GitHub-flavored Markdown rendering.
- Autosave on edit (2s debounce) and manual save.
- Shareable, read-only pages via `/share/{shareId}`.
- Paste images to upload and insert Markdown image links.
- Infinite-scroll document list with title/preview/date metadata.

## Tech stack
- Backend: ASP.NET Core (.NET 8) minimal APIs
- Data: Entity Framework Core + SQLite
- Frontend: Vanilla JS, CodeMirror 5, Marked.js

## Project layout
- `Program.cs` minimal API endpoints and app setup.
- `Data/AppDbContext.cs` EF Core context and indexes.
- `Models/Document.cs` document model and title extraction.
- `Services/ImageService.cs` image validation and storage.
- `wwwroot/` static frontend assets (HTML/CSS/JS) and uploads.

## Running locally
1. Ensure .NET 8 SDK is installed.
2. From the project root:
   ```powershell
   dotnet run
   ```
3. Open the app at `http://localhost:5000` or `https://localhost:5001` (depending on your ASP.NET Core settings).

SQLite data is stored in `markdown.db`. Uploaded images are saved to `wwwroot/uploads/`.

## API overview
- `GET /api/documents?page={page}&pageSize={pageSize}` list documents (paged).
- `GET /api/documents/{id}` fetch a document.
- `POST /api/documents` create a new document.
- `PUT /api/documents/{id}` update document content.
- `DELETE /api/documents/{id}` delete a document.
- `GET /api/share/{shareId}` fetch a shared document payload.
- `POST /api/upload` upload an image (multipart/form-data `file`).

## Notes
- Image uploads accept: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp` (max 5 MB).
- Document titles are derived from the first Markdown heading that starts with `# `.
