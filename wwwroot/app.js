// State Management
const state = {
    currentDocId: null,
    documents: [],
    folders: [],
    currentPage: 0,
    hasMore: true,
    isLoading: false,
    activeTab: 'write',
    autoSaveTimeout: null,
    currentFolderFilter: null, // null = show all, 0 = root only, >0 = specific folder
    expandedFolders: new Set(),
    contextMenuTarget: null
};

const API_BASE_URL = 'https://localhost:53933';
const APP_APP_URL = `${window.location.origin}`;

// DOM Elements (will be initialized after DOMContentLoaded)
let editorTextarea, editorWrapper, preview, documentList, writeTab, previewTab;
let newBtn, saveBtn, deleteBtn, shareBtn, saveStatus, loadingSentinel, toast;
let toggleSidebarBtn, sidebar, fileInput;
let newFolderBtn, folderContextMenu, docContextMenu;

// CodeMirror Instance
let codeMirror = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Initialize DOM elements
    editorTextarea = document.getElementById('editor');
    editorWrapper = document.getElementById('editorWrapper');
    preview = document.getElementById('preview');
    documentList = document.getElementById('documentList');
    writeTab = document.getElementById('writeTab');
    previewTab = document.getElementById('previewTab');
    newBtn = document.getElementById('newBtn');
    saveBtn = document.getElementById('saveBtn');
    deleteBtn = document.getElementById('deleteBtn');
    shareBtn = document.getElementById('shareBtn');
    saveStatus = document.getElementById('saveStatus');
    loadingSentinel = document.getElementById('loadingSentinel');
    toast = document.getElementById('toast');
    toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    sidebar = document.getElementById('sidebar');
    fileInput = document.getElementById('fileInput');
    newFolderBtn = document.getElementById('newFolderBtn');
    folderContextMenu = document.getElementById('folderContextMenu');
    docContextMenu = document.getElementById('docContextMenu');

    // Check if CodeMirror is loaded
    if (typeof CodeMirror === 'undefined') {
        console.error('CodeMirror library not loaded!');
        showToast('Failed to load editor. Please refresh the page.', 'error');
        return;
    }

    initializeCodeMirror();
    setupEventListeners();
    setupInfiniteScroll();
    loadFolders().then(() => loadDocuments());

    // Disable buttons initially (no document selected)
    updateButtonStates();
});

// Initialize CodeMirror
function initializeCodeMirror() {
    codeMirror = CodeMirror.fromTextArea(editorTextarea, {
        mode: 'gfm', // GitHub Flavored Markdown
        theme: 'github',
        lineNumbers: true,
        lineWrapping: true,
        autofocus: false,
        placeholder: 'Click "+" to create a new document or select a document from the list',
        undoDepth: 200,
        extraKeys: {
            'Ctrl-S': function(cm) {
                saveDocument();
                return false;
            },
            'Ctrl-B': function(cm) {
                wrapSelection(cm, '**', '**');
            },
            'Ctrl-I': function(cm) {
                wrapSelection(cm, '_', '_');
            },
            'Ctrl-U': function(cm) {
                wrapSelection(cm, '<u>', '</u>');
            },
            'Ctrl-Z': 'undo',
            'Ctrl-Y': 'redo',
            'Ctrl-Shift-Z': 'redo'
        }
    });

    // Start as read-only until a document is selected
    codeMirror.setOption('readOnly', true);
    codeMirror.getWrapperElement().classList.add('CodeMirror-readonly');

    // Change event for auto-save
    codeMirror.on('change', handleEditorInput);

    // Paste event for image upload
    codeMirror.on('paste', handleImagePaste);
}

// Event Listeners
function setupEventListeners() {
    // Tab switching
    writeTab.addEventListener('click', () => switchTab('write'));
    previewTab.addEventListener('click', () => switchTab('preview'));

    // Action buttons
    newBtn.addEventListener('click', createNewDocument);
    saveBtn.addEventListener('click', saveDocument);
    deleteBtn.addEventListener('click', deleteDocument);
    shareBtn.addEventListener('click', shareDocument);

    // Sidebar toggle
    toggleSidebarBtn.addEventListener('click', toggleSidebar);

    // Folder management
    newFolderBtn.addEventListener('click', createFolder);

    // Context menu actions
    folderContextMenu.addEventListener('click', handleFolderContextAction);
    docContextMenu.addEventListener('click', handleDocContextAction);

    // Close context menus on click outside
    document.addEventListener('click', () => {
        folderContextMenu.style.display = 'none';
        docContextMenu.style.display = 'none';
    });

    // Toolbar buttons
    document.getElementById('tbUndo').addEventListener('click', () => codeMirror.undo());
    document.getElementById('tbRedo').addEventListener('click', () => codeMirror.redo());
    document.getElementById('tbBold').addEventListener('click', () => wrapSelection(codeMirror, '**', '**'));
    document.getElementById('tbItalic').addEventListener('click', () => wrapSelection(codeMirror, '_', '_'));
    document.getElementById('tbUnderline').addEventListener('click', () => wrapSelection(codeMirror, '<u>', '</u>'));
    document.getElementById('tbHeading').addEventListener('click', () => insertAtLineStart(codeMirror, '## '));
    document.getElementById('tbStrikethrough').addEventListener('click', () => wrapSelection(codeMirror, '~~', '~~'));
    document.getElementById('tbCode').addEventListener('click', () => wrapSelection(codeMirror, '`', '`'));
    document.getElementById('tbCodeBlock').addEventListener('click', () => wrapSelection(codeMirror, '```\n', '\n```'));
    document.getElementById('tbUl').addEventListener('click', () => insertAtLineStart(codeMirror, '- '));
    document.getElementById('tbOl').addEventListener('click', () => insertAtLineStart(codeMirror, '1. '));
    document.getElementById('tbQuote').addEventListener('click', () => insertAtLineStart(codeMirror, '> '));
    document.getElementById('tbLink').addEventListener('click', () => insertLink(codeMirror));
    document.getElementById('tbImage').addEventListener('click', () => insertImage(codeMirror));
    document.getElementById('tbHr').addEventListener('click', () => insertBlock(codeMirror, '\n---\n'));
    document.getElementById('tbOpen').addEventListener('click', () => fileInput.click());
    document.getElementById('tbSaveAs').addEventListener('click', downloadMarkdown);

    // File input change
    fileInput.addEventListener('change', openMarkdownFile);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            saveDocument();
        }
    });
}

// Tab Switching
function switchTab(tabName) {
    state.activeTab = tabName;

    if (tabName === 'write') {
        writeTab.classList.add('active');
        previewTab.classList.remove('active');
        editorWrapper.style.display = 'block';
        preview.style.display = 'none';
        codeMirror.refresh(); // Refresh CodeMirror when showing
        codeMirror.focus();
    } else {
        writeTab.classList.remove('active');
        previewTab.classList.add('active');
        editorWrapper.style.display = 'none';
        preview.style.display = 'block';
        renderPreview();
    }
}

// Render Markdown Preview
function renderPreview() {
    const markdown = codeMirror.getValue();
    preview.innerHTML = marked.parse(markdown);
}

// Load Folders
async function loadFolders() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/folders`);
        const folders = await response.json();
        state.folders = folders;
    } catch (error) {
        console.error('Failed to load folders', error);
    }
}

// Load Documents
async function loadDocuments() {
    if (state.isLoading || !state.hasMore) return;

    state.isLoading = true;
    loadingSentinel.textContent = 'Loading...';

    try {
        const response = await fetch(`${API_BASE_URL}/api/documents?page=${state.currentPage}&pageSize=200`);
        const data = await response.json();

        state.documents.push(...data.documents);
        state.hasMore = data.hasMore;
        state.currentPage++;

        renderSidebar();
    } catch (error) {
        showToast('Failed to load documents', 'error');
        console.error(error);
    } finally {
        state.isLoading = false;
        loadingSentinel.textContent = state.hasMore ? '' : '';
    }
}

// Render full sidebar with folders + documents
function renderSidebar() {
    documentList.innerHTML = '';

    // Render folders
    state.folders.forEach(folder => {
        const group = createFolderGroup(folder);
        documentList.appendChild(group);
    });

    // Render uncategorized documents (no folder)
    const rootDocs = state.documents.filter(d => !d.folderId);
    if (rootDocs.length > 0 && state.folders.length > 0) {
        const label = document.createElement('div');
        label.className = 'uncategorized-label';
        label.textContent = 'Uncategorized';
        documentList.appendChild(label);
    }
    rootDocs.forEach(doc => {
        documentList.appendChild(createDocumentListItem(doc));
    });
}

function createFolderGroup(folder) {
    const group = document.createElement('div');
    group.className = 'folder-group';
    group.dataset.folderId = folder.id;

    const isExpanded = state.expandedFolders.has(folder.id);
    const folderDocs = state.documents.filter(d => d.folderId === folder.id);

    // Header
    const header = document.createElement('div');
    header.className = 'folder-header';
    header.innerHTML = `
        <span class="folder-icon ${isExpanded ? 'expanded' : ''}">&#9654;</span>
        <span class="folder-emoji">&#128193;</span>
        <span class="folder-name">${escapeHtml(folder.name)}</span>
        <span class="folder-count">${folderDocs.length}</span>
    `;

    header.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFolder(folder.id);
    });

    header.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.contextMenuTarget = folder.id;
        showContextMenu(folderContextMenu, e.clientX, e.clientY);
    });

    group.appendChild(header);

    // Contents
    const contents = document.createElement('div');
    contents.className = 'folder-contents' + (isExpanded ? '' : ' collapsed');
    if (isExpanded) {
        contents.style.maxHeight = (folderDocs.length * 80 + 20) + 'px';
    }

    folderDocs.forEach(doc => {
        contents.appendChild(createDocumentListItem(doc));
    });

    group.appendChild(contents);
    return group;
}

function toggleFolder(folderId) {
    if (state.expandedFolders.has(folderId)) {
        state.expandedFolders.delete(folderId);
    } else {
        state.expandedFolders.add(folderId);
    }
    renderSidebar();
}

function createDocumentListItem(doc) {
    const item = document.createElement('div');
    item.className = 'document-item';
    if (state.currentDocId === doc.id) {
        item.classList.add('active');
    }

    const title = doc.title || 'Untitled';
    const previewText = doc.preview || 'No content';
    const date = formatDate(doc.createdAt);

    item.innerHTML = `
        <div class="document-title">${escapeHtml(title)}</div>
        <div class="document-preview">${escapeHtml(previewText)}</div>
        <div class="document-date">${date}</div>
    `;

    item.addEventListener('click', () => loadDocument(doc.id));

    item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        state.contextMenuTarget = doc.id;
        showDocContextMenu(e.clientX, e.clientY);
    });

    return item;
}

// Load Document
async function loadDocument(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/documents/${id}`);
        if (!response.ok) throw new Error('Failed to load document');

        const doc = await response.json();
        state.currentDocId = doc.id;

        // Enable editor
        codeMirror.setOption('readOnly', false);
        codeMirror.getWrapperElement().classList.remove('CodeMirror-readonly');
        codeMirror.setValue(doc.content);

        // Update active state in list
        document.querySelectorAll('.document-item').forEach(item => {
            item.classList.remove('active');
        });

        // Re-render to show active state correctly
        renderSidebar();

        // Switch to write tab
        switchTab('write');

        // Update button states
        updateButtonStates();

    } catch (error) {
        showToast('Failed to load document', 'error');
        console.error(error);
    }
}

// Create New Document
async function createNewDocument() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: '' })
        });

        if (!response.ok) throw new Error('Failed to create document');

        const doc = await response.json();
        state.currentDocId = doc.id;

        // Enable editor
        codeMirror.setOption('readOnly', false);
        codeMirror.getWrapperElement().classList.remove('CodeMirror-readonly');
        codeMirror.setValue('');
        codeMirror.focus();

        // Add to list at the beginning
        state.documents.unshift({
            id: doc.id,
            title: null,
            preview: '',
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
            folderId: null
        });

        // Re-render list
        renderSidebar();

        // Switch to write tab
        switchTab('write');

        // Update button states
        updateButtonStates();

        showToast('New document created', 'success');

    } catch (error) {
        showToast('Failed to create document', 'error');
        console.error(error);
    }
}

// Save Document
async function saveDocument() {
    if (!state.currentDocId) {
        showToast('No document to save', 'error');
        return;
    }

    try {
        saveStatus.textContent = 'Saving...';

        const response = await fetch(`${API_BASE_URL}/api/documents/${state.currentDocId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: codeMirror.getValue() })
        });

        if (!response.ok) throw new Error('Failed to save document');

        const doc = await response.json();

        // Update in state
        const docIndex = state.documents.findIndex(d => d.id === state.currentDocId);
        if (docIndex !== -1) {
            state.documents[docIndex] = {
                ...state.documents[docIndex],
                title: doc.title,
                preview: doc.content.substring(0, 100),
                updatedAt: doc.updatedAt
            };

            renderSidebar();
        }

        saveStatus.textContent = 'Saved';
        setTimeout(() => saveStatus.textContent = '', 2000);

    } catch (error) {
        saveStatus.textContent = '';
        showToast('Failed to save document', 'error');
        console.error(error);
    }
}

// Auto-save
function handleEditorInput() {
    if (state.autoSaveTimeout) {
        clearTimeout(state.autoSaveTimeout);
    }

    state.autoSaveTimeout = setTimeout(() => {
        if (state.currentDocId) {
            saveDocument();
        }
    }, 2000);
}

// Delete Document
async function deleteDocument() {
    if (!state.currentDocId) {
        showToast('No document to delete', 'error');
        return;
    }

    if (!confirm('Are you sure you want to delete this document?')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/documents/${state.currentDocId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete document');

        // Remove from state
        const docIndex = state.documents.findIndex(d => d.id === state.currentDocId);
        if (docIndex !== -1) {
            state.documents.splice(docIndex, 1);
        }

        // Re-render list
        renderSidebar();

        // Clear editor and set back to read-only
        state.currentDocId = null;
        codeMirror.setValue('');
        codeMirror.setOption('readOnly', true);
        codeMirror.getWrapperElement().classList.add('CodeMirror-readonly');

        // Update button states
        updateButtonStates();

        showToast('Document deleted', 'success');

    } catch (error) {
        showToast('Failed to delete document', 'error');
        console.error(error);
    }
}

// Share Document
async function shareDocument() {
    if (!state.currentDocId) {
        showToast('No document to share', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/documents/${state.currentDocId}`);
        if (!response.ok) throw new Error('Failed to get document');

        const doc = await response.json();
        const shareUrl = `${APP_APP_URL}/share/${doc.shareId}`;

        await navigator.clipboard.writeText(shareUrl);
        showToast('Share link copied to clipboard!', 'success');

    } catch (error) {
        showToast('Failed to copy share link', 'error');
        console.error(error);
    }
}

// Handle Image Paste
async function handleImagePaste(cm, event) {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
        if (item.type.startsWith('image/')) {
            event.preventDefault();

            const file = item.getAsFile();
            if (!file) continue;

            try {
                showToast('Uploading image...', 'success');
                const url = await uploadImage(file);

                // Insert markdown image syntax at cursor position
                const cursor = cm.getCursor();
                const imageMarkdown = `![](${url})`;
                cm.replaceRange(imageMarkdown, cursor);

                // Move cursor after the inserted text
                cm.setCursor({
                    line: cursor.line,
                    ch: cursor.ch + imageMarkdown.length
                });

                // Trigger auto-save
                handleEditorInput();

                showToast('Image uploaded successfully!', 'success');
            } catch (error) {
                showToast(error.message || 'Failed to upload image', 'error');
                console.error(error);
            }

            break;
        }
    }
}

// Upload Image
async function uploadImage(file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
    }

    const data = await response.json();
    return data.url;
}

// Infinite Scroll
function setupInfiniteScroll() {
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && state.hasMore && !state.isLoading) {
            loadDocuments();
        }
    }, { threshold: 0.1 });

    observer.observe(loadingSentinel);
}

// Update Button States
function updateButtonStates() {
    const hasDoc = state.currentDocId !== null;
    saveBtn.disabled = !hasDoc;
    deleteBtn.disabled = !hasDoc;
    shareBtn.disabled = !hasDoc;
}

// Show Toast Notification
function showToast(message, type = 'info') {
    if (!toast) {
        console.log(`[${type}] ${message}`);
        return;
    }
    toast.textContent = message;
    toast.className = `toast show ${type}`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// === Folder Management ===

async function createFolder() {
    const name = prompt('Enter folder name:');
    if (!name || !name.trim()) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/folders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim() })
        });

        if (!response.ok) throw new Error('Failed to create folder');

        const folder = await response.json();
        state.folders.push(folder);
        state.expandedFolders.add(folder.id);
        renderSidebar();

        showToast('Folder created', 'success');
    } catch (error) {
        showToast('Failed to create folder', 'error');
        console.error(error);
    }
}

async function renameFolder(folderId) {
    const folder = state.folders.find(f => f.id === folderId);
    if (!folder) return;

    const newName = prompt('Rename folder:', folder.name);
    if (!newName || !newName.trim() || newName.trim() === folder.name) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/folders/${folderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName.trim() })
        });

        if (!response.ok) throw new Error('Failed to rename folder');

        const updated = await response.json();
        folder.name = updated.name;
        folder.updatedAt = updated.updatedAt;
        renderSidebar();

        showToast('Folder renamed', 'success');
    } catch (error) {
        showToast('Failed to rename folder', 'error');
        console.error(error);
    }
}

async function deleteFolder(folderId) {
    const folder = state.folders.find(f => f.id === folderId);
    if (!folder) return;

    if (!confirm(`Delete folder "${folder.name}"? Documents inside will be moved to root.`)) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/folders/${folderId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete folder');

        // Move docs to root in local state
        state.documents.forEach(d => {
            if (d.folderId === folderId) d.folderId = null;
        });

        state.folders = state.folders.filter(f => f.id !== folderId);
        state.expandedFolders.delete(folderId);
        renderSidebar();

        showToast('Folder deleted', 'success');
    } catch (error) {
        showToast('Failed to delete folder', 'error');
        console.error(error);
    }
}

async function moveDocumentToFolder(docId, folderId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/documents/${docId}/move`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderId: folderId })
        });

        if (!response.ok) throw new Error('Failed to move document');

        // Update local state
        const doc = state.documents.find(d => d.id === docId);
        if (doc) {
            doc.folderId = folderId;
        }

        // Expand target folder so user sees the moved doc
        if (folderId) {
            state.expandedFolders.add(folderId);
        }

        renderSidebar();
        showToast(folderId ? 'Document moved to folder' : 'Document moved to root', 'success');
    } catch (error) {
        showToast('Failed to move document', 'error');
        console.error(error);
    }
}

// Context Menu Helpers
function showContextMenu(menu, x, y) {
    folderContextMenu.style.display = 'none';
    docContextMenu.style.display = 'none';

    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.style.display = 'block';

    // Keep menu within viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
    }
}

function showDocContextMenu(x, y) {
    // Build folder list for "move to" options
    const moveFoldersContainer = document.getElementById('docContextMoveFolders');
    moveFoldersContainer.innerHTML = '';

    if (state.folders.length > 0) {
        const divider = document.createElement('div');
        divider.className = 'context-menu-divider';
        moveFoldersContainer.appendChild(divider);

        state.folders.forEach(folder => {
            const btn = document.createElement('button');
            btn.className = 'context-menu-item';
            btn.dataset.action = 'move';
            btn.dataset.folderId = folder.id;
            btn.textContent = `?? Move to ${folder.name}`;
            moveFoldersContainer.appendChild(btn);
        });
    }

    showContextMenu(docContextMenu, x, y);
}

function handleFolderContextAction(e) {
    const btn = e.target.closest('.context-menu-item');
    if (!btn) return;

    const action = btn.dataset.action;
    const folderId = state.contextMenuTarget;

    folderContextMenu.style.display = 'none';

    if (action === 'rename') {
        renameFolder(folderId);
    } else if (action === 'delete') {
        deleteFolder(folderId);
    }
}

function handleDocContextAction(e) {
    const btn = e.target.closest('.context-menu-item');
    if (!btn) return;

    const action = btn.dataset.action;
    const docId = state.contextMenuTarget;

    docContextMenu.style.display = 'none';

    if (action === 'move-root') {
        moveDocumentToFolder(docId, null);
    } else if (action === 'move') {
        const folderId = parseInt(btn.dataset.folderId);
        moveDocumentToFolder(docId, folderId);
    }
}

// Toggle Sidebar
function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
    setTimeout(() => {
        if (codeMirror) codeMirror.refresh();
    }, 310);
}

// Toolbar Helpers
function wrapSelection(cm, before, after) {
    const selection = cm.getSelection();
    if (selection) {
        cm.replaceSelection(before + selection + after);
    } else {
        const cursor = cm.getCursor();
        cm.replaceRange(before + after, cursor);
        cm.setCursor({ line: cursor.line, ch: cursor.ch + before.length });
    }
    cm.focus();
}

function insertAtLineStart(cm, prefix) {
    const cursor = cm.getCursor();
    const line = cm.getLine(cursor.line);
    cm.replaceRange(prefix + line, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length });
    cm.setCursor({ line: cursor.line, ch: prefix.length + cursor.ch });
    cm.focus();
}

function insertBlock(cm, text) {
    const cursor = cm.getCursor();
    cm.replaceRange(text, cursor);
    cm.focus();
}

function insertLink(cm) {
    const selection = cm.getSelection();
    const text = selection || 'link text';
    cm.replaceSelection('[' + text + '](url)');
    cm.focus();
}

function insertImage(cm) {
    const selection = cm.getSelection();
    const alt = selection || 'alt text';
    cm.replaceSelection('![' + alt + '](url)');
    cm.focus();
}

// Open Markdown File from disk
function openMarkdownFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        codeMirror.setOption('readOnly', false);
        codeMirror.getWrapperElement().classList.remove('CodeMirror-readonly');
        codeMirror.setValue(e.target.result);
        codeMirror.focus();
        showToast('File loaded: ' + file.name, 'success');
    };
    reader.readAsText(file);
    fileInput.value = '';
}

// Download current content as .md file
function downloadMarkdown() {
    const content = codeMirror.getValue();
    if (!content) {
        showToast('No content to download', 'error');
        return;
    }

    const firstLine = content.split('\n')[0].replace(/^#+\s*/, '').trim();
    const filename = (firstLine || 'document') + '.md';

    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('File downloaded: ' + filename, 'success');
}

// Utility Functions
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
