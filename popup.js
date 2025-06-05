var categoryList = document.getElementById('category-list');
var addCategoryButton = document.getElementById('add-category');

function saveCategories() {
  const inputs = document.querySelectorAll('.category-input input');
  const categories = Array.from(inputs).map(input => input.value);
  chrome.storage.local.set({ savedCategories: categories });
}

window.addEventListener('unload', saveCategories); //save categories on close

function loadCategories() {
  chrome.storage.local.get('savedCategories', (data) => {
    const categories = data.savedCategories || [];

    // Clear any default inputs first
    document.getElementById('category-list').innerHTML = '';

    categories.forEach(cat => addCategoryInput(cat));
  });
}

document.addEventListener('DOMContentLoaded', loadCategories); //load categories on DOM ready


function addCategoryInput(value = '') {

    const div = document.createElement('div');
    div.className = 'category-input';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Category name';
    input.value = value;

    if (categories.length === 0) {
      addCategoryInput();
      addCategoryInput();
      addCategoryInput();
    } else {
      categories.forEach(cat => addCategoryInput(cat));
    }

    const removeButton = document.createElement('button');
    removeButton.textContent = 'X';
    removeButton.addEventListener('click', () => div.remove());

    div.appendChild(input);
    div.appendChild(removeButton);
    categoryList.appendChild(div);
}

addCategoryButton.addEventListener('click', () => addCategoryInput());

document.getElementById('run').addEventListener('click', () => {
  const inputs = document.querySelectorAll('#category-list input');
  const categories = [...inputs]
    .map(input => input.value.trim())
    .filter(c => c.length > 0);

  if (categories.length === 0) {
    document.getElementById('status').textContent = '⚠️ Add at least one category.';
    return;
  }

  chrome.runtime.sendMessage(
    { action: 'start-run', categories },
    (response) => {
      document.getElementById('status').textContent =
        response?.status === 'success'
          ? '✅ Emails sorted!'
          : '❌ Failed to sort emails.';
    }
  );
});
