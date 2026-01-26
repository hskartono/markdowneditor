// State Management
const state = {
    currentDocId: null,
    documents: [],
    currentPage: 0,
    hasMore: true,
    isLoading: false,
    activeTab: 'write',
    autoSaveTimeout: null
};

// DOM Elements (will be initialized after DOMContentLoaded)
let editorTextarea, editorWrapper, preview, documentList, writeTab, previewTab;
let newBtn, saveBtn, deleteBtn, shareBtn, saveStatus, loadingSentinel, toast;

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

    // Check if CodeMirror is loaded
    if (typeof CodeMirror === 'undefined') {
        console.error('CodeMirror library not loaded!');
        showToast('Failed to load editor. Please refresh the page.', 'error');
        return;
    }

    initializeCodeMirror();
    setupEventListeners();
    setupInfiniteScroll();
    loadDocuments();

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
        extraKeys: {
            'Ctrl-S': function(cm) {
                saveDocument();
                return false;
            }
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

// Load Documents
async function loadDocuments() {
    if (state.isLoading || !state.hasMore) return;

    state.isLoading = true;
    loadingSentinel.textContent = 'Loading...';

    try {
        const response = await fetch(`/api/documents?page=${state.currentPage}&pageSize=20`);
        const data = await response.json();

        state.documents.push(...data.documents);
        state.hasMore = data.hasMore;
        state.currentPage++;

        renderDocumentList();
    } catch (error) {
        showToast('Failed to load documents', 'error');
        console.error(error);
    } finally {
        state.isLoading = false;
        loadingSentinel.textContent = state.hasMore ? '' : 'No more documents';
    }
}

// Render Document List
function renderDocumentList() {
    const existingItems = documentList.querySelectorAll('.document-item');
    const startIndex = existingItems.length;

    for (let i = startIndex; i < state.documents.length; i++) {
        const doc = state.documents[i];
        const item = createDocumentListItem(doc);
        documentList.appendChild(item);
    }
}

function createDocumentListItem(doc) {
    const item = document.createElement('div');
    item.className = 'document-item';
    if (state.currentDocId === doc.id) {
        item.classList.add('active');
    }

    const title = doc.title || 'Untitled';
    const preview = doc.preview || 'No content';
    const date = formatDate(doc.createdAt);

    item.innerHTML = `
        <div class="document-title">${escapeHtml(title)}</div>
        <div class="document-preview">${escapeHtml(preview)}</div>
        <div class="document-date">${date}</div>
    `;

    item.addEventListener('click', () => loadDocument(doc.id));

    return item;
}

// Load Document
async function loadDocument(id) {
    try {
        const response = await fetch(`/api/documents/${id}`);
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
        const items = document.querySelectorAll('.document-item');
        const docIndex = state.documents.findIndex(d => d.id === id);
        if (docIndex !== -1 && items[docIndex]) {
            items[docIndex].classList.add('active');
        }

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
        const response = await fetch('/api/documents', {
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
            updatedAt: doc.updatedAt
        });

        // Re-render list
        documentList.innerHTML = '';
        renderDocumentList();

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

        const response = await fetch(`/api/documents/${state.currentDocId}`, {
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

            // Update list item
            const items = document.querySelectorAll('.document-item');
            if (items[docIndex]) {
                const title = doc.title || 'Untitled';
                const preview = doc.content.length > 100 ? doc.content.substring(0, 100) + '...' : doc.content;
                items[docIndex].querySelector('.document-title').textContent = title;
                items[docIndex].querySelector('.document-preview').textContent = preview;
            }
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
        const response = await fetch(`/api/documents/${state.currentDocId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete document');

        // Remove from state
        const docIndex = state.documents.findIndex(d => d.id === state.currentDocId);
        if (docIndex !== -1) {
            state.documents.splice(docIndex, 1);
        }

        // Re-render list
        documentList.innerHTML = '';
        renderDocumentList();

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
        const response = await fetch(`/api/documents/${state.currentDocId}`);
        if (!response.ok) throw new Error('Failed to get document');

        const doc = await response.json();
        const shareUrl = `${window.location.origin}/share/${doc.shareId}`;

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

    const response = await fetch('/api/upload', {
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
