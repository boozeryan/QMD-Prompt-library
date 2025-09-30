// --- 正確且完整的 app.js 檔案內容 ---

class PromptLibraryApp {
  constructor() {
    this.elements = {
      tableBody: document.getElementById('prompt-list'),
      initialDataSource: document.getElementById('initial-data'),
      searchInput: document.getElementById('search'),
      clearSearchBtn: document.getElementById('clearSearchBtn'),
      categoryFilter: document.getElementById('categoryFilter'),
      categoryChipsContainer: document.getElementById('categoryChipsContainer'),
      addNewBtn: document.getElementById('addNew'),
      manageCategoriesBtn: document.getElementById('manageCategoriesBtn'),
      exportBtn: document.getElementById('exportBtn'),
      importBtn: document.getElementById('importBtn'),
      fileImporter: document.getElementById('fileImporter'),
      importErrorContainer: document.getElementById('importErrorContainer'),
      manualImportLink: document.getElementById('manualImportLink'),
      promptModal: {
        self: document.getElementById('promptModal'),
        title: document.getElementById('modalTitle'),
        form: document.getElementById('promptForm'),
        idInput: document.getElementById('promptId'),
        taskInput: document.getElementById('taskInput'),
        categoryInput: document.getElementById('categoryInput'),
        promptInput: document.getElementById('promptInput'),
        authorInput: document.getElementById('authorInput'),
        historySelect: document.getElementById('historySelect'),
        saveBtn: document.getElementById('saveBtn'),
        historyPreviewContainer: document.getElementById('historyPreviewContainer'),
        historyPreviewArea: document.getElementById('historyPreviewArea'),
        restoreBtn: document.getElementById('restoreBtn'),
        closePreviewBtn: document.getElementById('closePreviewBtn'),
      },
      categoryModal: {
        self: document.getElementById('categoryModal'),
        list: document.getElementById('categoryList'),
        form: document.getElementById('newCategoryForm'),
        input: document.getElementById('newCategoryInput'),
        closeBtn: document.getElementById('closeCategoryModalBtn'),
      },
      manualImportModal: {
        self: document.getElementById('manualImportModal'),
        textArea: document.getElementById('manualImportText'),
        importBtn: document.getElementById('importFromTextBtn')
      },
      rowTemplate: document.getElementById('prompt-row-template'),
    };
    this.prompts = [];
    this.categories = [];
    this.isContentDirty = false;
    this.activeCategories = [];
    this.db = null;
  }

  init() {
    this._initFirebase();
    this._setupRealtimeListeners();
    this._bindEventListeners();
  }

  _initFirebase() {
    const firebaseConfig = {
      apiKey: "AIzaSyDQDorsdx2Cetyp46riQC7i_xB2dMCvuYc",
      authDomain: "qmd-prompt-library.firebaseapp.com",
      projectId: "qmd-prompt-library",
      storageBucket: "qmd-prompt-library.appspot.com", // 注意：這裡可能是 .appspot.com
      messagingSenderId: "622746077507",
      appId: "1:622746077507:web:e5a1089f93dbf4dd5807f6",
      measurementId: "G-KHGRGT7W30"
    };
    try {
      firebase.initializeApp(firebaseConfig);
      this.db = firebase.firestore();
    } catch (e) {
      console.error("Firebase 初始化失敗:", e);
      alert("雲端資料庫初始化失敗！請檢查您的 Firebase 設定。");
    }
  }

  _setupRealtimeListeners() {
    if (!this.db) return;
    this.db.collection("categories").orderBy("name").onSnapshot(snapshot => {
      this.categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      this._populateCategoryDropdowns();
      this._renderCategoryChips();
      this._renderTable();
    });
    this.db.collection("prompts").orderBy("createdDate", "desc").onSnapshot(snapshot => {
      if (snapshot.empty && this.categories.length === 0) {
        this._seedDataToFirestore();
      } else {
        this.prompts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        this._renderTable();
      }
    });
  }

  async _seedDataToFirestore() {
    console.log("資料庫是空的，正在從 HTML 植入初始資料到雲端...");
    if (!this.db) return;
    const rows = this.elements.initialDataSource.querySelectorAll('tr');
    const categories = new Set();
    const promptsToSeed = [];
    rows.forEach(row => {
      const categoryText = row.querySelector('.cat').innerText.trim();
      const taskCell = row.querySelector('.task');
      const taskText = taskCell.childNodes[0].nodeValue.trim();
      categories.add(categoryText);
      promptsToSeed.push({
        task: taskText,
        category: categoryText,
        prompt: row.querySelector('.prompt .mono').innerText.trim(),
        author: 'System',
        createdDate: new Date(),
        lastModified: new Date(),
        copyCount: 0,
        history: []
      });
    });
    const batch = this.db.batch();
    [...categories].sort().forEach(catName => {
      const catRef = this.db.collection("categories").doc();
      batch.set(catRef, { name: catName });
    });
    promptsToSeed.forEach(prompt => {
      const promptRef = this.db.collection("prompts").doc();
      batch.set(promptRef, prompt);
    });
    try {
      await batch.commit();
      this._showToast("已成功將預設提示詞庫上傳至雲端！");
    } catch (e) {
      console.error("植入初始資料失敗:", e);
    }
  }

  _renderTable() {
    const { tableBody, searchInput } = this.elements;
    tableBody.innerHTML = '';
    const searchTerm = searchInput.value.trim().toLowerCase();
    const filtered = this.prompts.filter(p => {
      const matchesCategory = this.activeCategories.length === 0 || this.activeCategories.includes(p.category);
      const matchesSearch = !searchTerm || p.task.toLowerCase().includes(searchTerm) || p.prompt.toLowerCase().includes(searchTerm);
      return matchesCategory && matchesSearch;
    });
    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 32px;">找不到符合條件的提示詞。</td></tr>`;
      return;
    }
    filtered.forEach((prompt, index) => {
      const row = this.elements.rowTemplate.content.cloneNode(true);
      const tr = row.querySelector('.prompt-row');
      tr.dataset.id = prompt.id;
      row.querySelector('.id').textContent = index + 1;
      row.querySelector('.task').textContent = prompt.task;
      const categoryLabel = row.querySelector('.category-label');
      categoryLabel.textContent = prompt.category;
      categoryLabel.dataset.category = prompt.category;
      row.querySelector('.prompt .mono').textContent = prompt.prompt; // Use textContent for safety and correctness
      row.querySelector('.copy-count').textContent = `複製 ${prompt.copyCount} 次`;
      row.querySelector('.author').textContent = `作者: ${prompt.author || 'N/A'}`;
      const lastModifiedDate = prompt.lastModified && prompt.lastModified.toDate ? prompt.lastModified.toDate() : new Date();
      row.querySelector('.last-modified').textContent = `更新: ${lastModifiedDate.toLocaleDateString()}`;
      tableBody.appendChild(row);
    });
    this._updateActiveFilters();
  }

  _populateCategoryDropdowns() {
    const { categoryFilter, promptModal } = this.elements;
    const { categoryInput } = promptModal;
    const currentFilterValue = categoryFilter.value;
    categoryFilter.innerHTML = '<option value="all">全部分類</option>';
    this.categories.forEach(cat => {
      categoryFilter.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
    });
    if (this.categories.some(c => c.name === currentFilterValue)) {
      categoryFilter.value = currentFilterValue;
    }
    const currentModalValue = categoryInput.value;
    categoryInput.innerHTML = '';
    this.categories.forEach(cat => {
      categoryInput.innerHTML += `<option value="${cat.name}">${cat.name}</option>`;
    });
    if (this.categories.some(c => c.name === currentModalValue)) {
      categoryInput.value = currentModalValue;
    }
  }

  _renderCategoryChips() {
    const { categoryChipsContainer } = this.elements;
    categoryChipsContainer.innerHTML = '';
    const allChip = document.createElement('span');
    allChip.className = 'chip clickable';
    allChip.textContent = '全部分類';
    allChip.dataset.category = 'all';
    categoryChipsContainer.appendChild(allChip);
    this.categories.forEach(cat => {
      const chip = document.createElement('span');
      chip.className = 'chip clickable';
      chip.textContent = cat.name;
      chip.dataset.category = cat.name;
      categoryChipsContainer.appendChild(chip);
    });
    this._updateActiveFilters();
  }

  _updateActiveFilters() {
    const { categoryFilter, categoryChipsContainer } = this.elements;
    categoryChipsContainer.querySelectorAll('.chip').forEach(chip => {
      const category = chip.dataset.category;
      const isActive = (this.activeCategories.length === 0 && category === 'all') || this.activeCategories.includes(category);
      chip.classList.toggle('active', isActive);
    });
    if (this.activeCategories.length === 1) {
      categoryFilter.value = this.activeCategories[0];
    } else {
      categoryFilter.value = 'all';
    }
  }

  _renderCategoryList() {
    const { list } = this.elements.categoryModal;
    list.innerHTML = '';
    this.categories.forEach(cat => {
      const isUsed = this.prompts.some(p => p.category === cat.name);
      list.innerHTML += `<li><span>${cat.name}</span><button class="btn small btn-danger" data-id="${cat.id}" ${isUsed ? 'disabled title="分類使用中，無法刪除"' : ''}>刪除</button></li>`;
    });
  }

  _openModal(modalElement) {
    modalElement.classList.add('active');
  }

  _closeModal(modalElement) {
    modalElement.classList.remove('active');
  }

  _bindEventListeners() {
    const { searchInput, clearSearchBtn, categoryFilter, addNewBtn, manageCategoriesBtn, exportBtn, importBtn, fileImporter, categoryChipsContainer, manualImportLink } = this.elements;
    const { self: promptModal, saveBtn, historySelect, restoreBtn, closePreviewBtn } = this.elements.promptModal;
    const { self: categoryModal, form: categoryForm, list: categoryList, closeBtn: closeCategoryModalBtn } = this.elements.categoryModal;
    const { self: manualImportModal, importBtn: importFromTextBtn } = this.elements.manualImportModal;
    searchInput.addEventListener('input', () => {
      this._toggleClearSearchBtn();
      this._renderTable();
    });
    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchInput.focus();
      this._toggleClearSearchBtn();
      this._renderTable();
    });
    categoryFilter.addEventListener('change', (e) => {
      this.activeCategories = e.target.value === 'all' ? [] : [e.target.value];
      this._updateActiveFilters();
      this._renderTable();
    });
    categoryChipsContainer.addEventListener('click', e => {
      const target = e.target;
      if (target.classList.contains('chip')) {
        const category = target.dataset.category;
        if (category === 'all') {
          this.activeCategories = [];
        } else {
          const index = this.activeCategories.indexOf(category);
          if (index > -1) {
            this.activeCategories.splice(index, 1);
          } else {
            this.activeCategories.push(category);
          }
        }
        this._updateActiveFilters();
        this._renderTable();
      }
    });
    addNewBtn.addEventListener('click', () => this._openPromptModal('add'));
    manageCategoriesBtn.addEventListener('click', () => {
      this._renderCategoryList();
      this._openModal(categoryModal);
    });
    exportBtn.addEventListener('click', () => this._exportData());
    importBtn.addEventListener('click', () => fileImporter.click());
    fileImporter.addEventListener('change', e => this._handleFileImport(e));
    manualImportLink.addEventListener('click', e => {
      e.preventDefault();
      this._openModal(manualImportModal);
    });
    this.elements.tableBody.addEventListener('click', e => this._handleTableClick(e));
    promptModal.addEventListener('click', e => {
      if (e.target === promptModal || e.target.classList.contains('close-btn')) this._closePromptModal();
    });
    this.elements.promptModal.form.addEventListener('input', () => {
      this.isContentDirty = true;
    });
    saveBtn.addEventListener('click', () => this._savePrompt());
    historySelect.addEventListener('change', (e) => this._previewHistory(e));
    restoreBtn.addEventListener('click', () => this._restoreFromPreview());
    closePreviewBtn.addEventListener('click', () => this._closePreview());
    categoryModal.addEventListener('click', e => {
      if (e.target === categoryModal || e.target.classList.contains('close-btn') || e.target === closeCategoryModalBtn) this._closeModal(categoryModal);
    });
    categoryForm.addEventListener('submit', e => {
      e.preventDefault();
      this._addNewCategory();
    });
    categoryList.addEventListener('click', e => {
      if (e.target.tagName === 'BUTTON') this._deleteCategory(e.target.dataset.id);
    });
    manualImportModal.addEventListener('click', e => {
      if (e.target === manualImportModal || e.target.classList.contains('close-btn')) this._closeModal(manualImportModal);
    });
    importFromTextBtn.addEventListener('click', () => this._handleManualImport());
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && (promptModal.classList.contains('active') || categoryModal.classList.contains('active') || manualImportModal.classList.contains('active'))) {
        this._closeModal(promptModal);
        this._closeModal(categoryModal);
        this._closeModal(manualImportModal);
      }
    });
    window.addEventListener('beforeunload', e => {
      if (this.isContentDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  _handleTableClick(e) {
    const row = e.target.closest('.prompt-row');
    if (!row) return;
    const id = row.dataset.id;
    if (e.target.closest('.copy')) {
      const prompt = this.prompts.find(p => p.id === id);
      if (prompt) {
        navigator.clipboard.writeText(prompt.prompt);
        this.db.collection("prompts").doc(id).update({
          copyCount: firebase.firestore.FieldValue.increment(1)
        });
        this._showToast('已成功複製到剪貼簿！');
      }
    } else if (e.target.closest('.edit')) {
      this._openPromptModal('edit', id);
    } else if (e.target.closest('.delete')) {
      if (confirm('確定要刪除這條提示詞嗎？')) {
        this.db.collection("prompts").doc(id).delete();
        this._showToast('提示詞已刪除', 'error');
      }
    }
  }

  _openPromptModal(mode = 'add', id = null) {
    const { title, idInput, taskInput, categoryInput, promptInput, authorInput, historySelect } = this.elements.promptModal;
    this.isContentDirty = false;
    idInput.value = '';
    taskInput.value = '';
    promptInput.value = '';
    authorInput.value = '';
    categoryInput.value = '';
    this._closePreview();
    if (mode === 'edit') {
      const prompt = this.prompts.find(p => p.id === id);
      if (!prompt) return;
      title.textContent = '編輯提示詞';
      idInput.value = prompt.id;
      taskInput.value = prompt.task;
      const categoryExists = this.categories.some(c => c.name === prompt.category);
      if (!categoryExists) {
        const tempOption = document.createElement('option');
        tempOption.value = prompt.category;
        tempOption.textContent = `${prompt.category} (已刪除)`;
        categoryInput.appendChild(tempOption);
      }
      categoryInput.value = prompt.category;
      promptInput.value = prompt.prompt;
      authorInput.value = prompt.author || '';
      this._populateHistory(prompt);
    } else {
      title.textContent = '新增提示詞';
      if (this.categories.length > 0) {
        categoryInput.value = this.categories[0].name;
      }
      historySelect.innerHTML = '<option value="">無歷史版本</option>';
      historySelect.disabled = true;
      authorInput.value = localStorage.getItem('promptLibraryAuthor') || '';
    }
    this._openModal(this.elements.promptModal.self);
    taskInput.focus();
  }

  _closePromptModal() {
    if (this.isContentDirty && !confirm('您有未儲存的變更，確定要關閉嗎？')) {
      return;
    }
    this._closePreview();
    this._closeModal(this.elements.promptModal.self);
  }

  async _savePrompt() {
    const { form, idInput, taskInput, categoryInput, promptInput, authorInput } = this.elements.promptModal;
    if (!form.checkValidity()) {
      form.reportValidity();
      this._showToast("儲存失敗：請檢查所有必填欄位！", "error");
      return;
    }
    const id = idInput.value;
    const data = {
      task: taskInput.value.trim(),
      category: categoryInput.value,
      prompt: promptInput.value.trim(),
      author: authorInput.value.trim(),
      lastModified: new Date()
    };
    try {
      if (id) {
        const promptToUpdate = this.prompts.find(p => p.id === id);
        const oldHistory = promptToUpdate.history || [];
        oldHistory.unshift({
          prompt: promptToUpdate.prompt,
          modifiedDate: promptToUpdate.lastModified,
          author: promptToUpdate.author
        });
        if (oldHistory.length > 10) oldHistory.pop();
        data.history = oldHistory;
        await this.db.collection("prompts").doc(id).update(data);
        this._showToast('提示詞已更新！');
      } else {
        data.createdDate = new Date();
        data.copyCount = 0;
        data.history = [];
        await this.db.collection("prompts").add(data);
        this._showToast('已成功新增提示詞！');
      }
      localStorage.setItem('promptLibraryAuthor', data.author);
      this.isContentDirty = false;
      this._closeModal(this.elements.promptModal.self);
    } catch (e) {
      console.error("儲存失敗: ", e);
      this._showToast("儲存至雲端時發生錯誤。", "error");
    }
  }

  _addNewCategory() {
    const { input } = this.elements.categoryModal;
    const newCat = input.value.trim();
    if (newCat && !this.categories.some(c => c.name === newCat)) {
      this.db.collection("categories").add({ name: newCat });
      input.value = '';
      this._showToast('已新增分類！');
    } else {
      this._showToast(newCat ? '分類已存在' : '分類名稱不能為空', 'error');
    }
  }

  _deleteCategory(id) {
    if (confirm('確定要刪除這個分類嗎？')) {
      this.db.collection("categories").doc(id).delete();
      this._showToast('分類已刪除', 'error');
    }
  }

  _previewHistory(e) {
    const { idInput, historyPreviewContainer, historyPreviewArea } = this.elements.promptModal;
    const id = idInput.value;
    const index = e.target.value;
    if (id && index !== '') {
      const prompt = this.prompts.find(p => p.id === id);
      const historicVersion = prompt.history[index];
      if (historicVersion) {
        historyPreviewArea.value = historicVersion.prompt;
        historyPreviewContainer.style.display = 'block';
      }
    } else {
      this._closePreview();
    }
  }

  _restoreFromPreview() {
    const { promptInput, historyPreviewArea } = this.elements.promptModal;
    if (confirm('您確定要用預覽的內容覆蓋目前的編輯嗎？')) {
      promptInput.value = historyPreviewArea.value;
      this._closePreview();
      this._showToast('已還原版本內容至編輯器！');
    }
  }

  _closePreview() {
    const { historyPreviewContainer, historySelect } = this.elements.promptModal;
    historyPreviewContainer.style.display = 'none';
    historySelect.value = '';
  }

  _handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    this.elements.importErrorContainer.style.display = 'none';
    const reader = new FileReader();
    reader.onload = (e) => this._processImportData(e.target.result);
    reader.onerror = () => {
      this._showToast("讀取檔案失敗！", "error");
      this.elements.importErrorContainer.style.display = 'block';
    };
    reader.readAsText(file);
    event.target.value = null;
  }

  _handleManualImport() {
    const { textArea, self } = this.elements.manualImportModal;
    const content = textArea.value;
    if (this._processImportData(content)) {
      this._closeModal(self);
    }
  }

  async _processImportData(jsonString) {
    try {
      if (!jsonString) throw new Error("Input is empty.");
      const data = JSON.parse(jsonString);
      if (!data.prompts || !Array.isArray(data.prompts) || !data.categories || !Array.isArray(data.categories)) {
        throw new Error("Invalid file format: missing prompts or categories array.");
      }
      if (confirm(`確定要從檔案中匯入 ${data.prompts.length} 條提示詞與 ${data.categories.length} 個分類嗎？\n此操作只會新增，不會刪除現有資料。`)) {
        await this._importDataToFirestore(data.prompts, data.categories);
      }
      return true;
    } catch (err) {
      this._showToast("檔案格式錯誤或解析失敗！", "error");
      this.elements.importErrorContainer.style.display = 'block';
      console.error("Import processing error:", err);
      return false;
    }
  }

  async _importDataToFirestore(prompts, categories) {
    if (!this.db) return;
    this._showToast("正在匯入資料...");
    const batch = this.db.batch();
    const existingCategoryNames = this.categories.map(c => c.name);
    const newCategories = categories.filter(catName => !existingCategoryNames.includes(catName));
    newCategories.forEach(catName => {
      const catRef = this.db.collection("categories").doc();
      batch.set(catRef, { name: catName });
    });
    prompts.forEach(p => {
      const promptRef = this.db.collection("prompts").doc();
      batch.set(promptRef, {
        task: p.task || "無標題",
        category: p.category || "未分類",
        prompt: p.prompt || "",
        author: p.author || "Imported",
        createdDate: new Date(),
        lastModified: new Date(),
        copyCount: p.copyCount || 0,
        history: []
      });
    });
    try {
      await batch.commit();
      this._showToast(`成功匯入 ${prompts.length} 條提示詞與 ${newCategories.length} 個新分類！`);
    } catch (err) {
      this._showToast("匯入失敗，請稍後再試。", "error");
      console.error("Import failed:", err);
      this.elements.importErrorContainer.style.display = 'block';
    }
  }

  _exportData() {
    try {
      const dataToExport = {
        version: "prompt-library-v1.0",
        exportedDate: new Date().toISOString(),
        prompts: this.prompts.map(({ id, ...rest }) => rest),
        categories: this.categories.map(c => c.name)
      };
      const jsonString = JSON.stringify(dataToExport, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `prompt_library_backup_${date}.json`;
      document.body.appendChild(a);
a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this._showToast("資料已成功匯出！");
    } catch (e) {
      console.error("匯出失敗:", e);
      this._showToast("匯出資料時發生錯誤。", "error");
    }
  }

  _showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 500);
    }, 3000);
  }

  _toggleClearSearchBtn() {
    this.elements.clearSearchBtn.style.display = this.elements.searchInput.value.length > 0 ? 'block' : 'none';
  }

  _populateHistory(prompt) {
    const { historySelect } = this.elements.promptModal;
    historySelect.innerHTML = '<option value="">檢視歷史版本...</option>';
    if (prompt.history && prompt.history.length > 0) {
      prompt.history.forEach((h, index) => {
        const date = h.modifiedDate.toDate ? h.modifiedDate.toDate() : new Date(h.modifiedDate);
        historySelect.innerHTML += `<option value="${index}">版本 #${prompt.history.length - index} (${date.toLocaleString()})</option>`;
      });
      historySelect.disabled = false;
    } else {
      historySelect.disabled = true;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new PromptLibraryApp();
  app.init();
});
