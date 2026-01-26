using Backend.Models;
using Xunit;

namespace Backend.Tests;

public class DocumentTests
{
    [Fact]
    public void UpdateTitle_UsesFirstH1Heading()
    {
        var doc = new Document
        {
            Content = "# First Title\n\nSome text\n\n# Second Title"
        };

        doc.UpdateTitle();

        Assert.Equal("First Title", doc.Title);
    }

    [Fact]
    public void UpdateTitle_SetsNullWhenNoH1Heading()
    {
        var doc = new Document
        {
            Content = "## Subtitle\nPlain text"
        };

        doc.UpdateTitle();

        Assert.Null(doc.Title);
    }

    [Fact]
    public void UpdateTitle_IgnoresNonLeadingHash()
    {
        var doc = new Document
        {
            Content = "Text before\n# Not a title\n\n# Actual Title"
        };

        doc.UpdateTitle();

        Assert.Equal("Not a title", doc.Title);
    }
}
