var categoryList = document.getElementById('category-list');
var addCategoryButton = document.getElementById('add-category');

function saveCategories() {
    const inputs = document.querySelectorAll('.category-input input');
    const categories = Array.from(inputs)
    .map(input => input.value)
    .filter(val => val.length > 0);
    chrome.storage.local.set({ savedCategories: categories });
}

window.addEventListener('unload', saveCategories); //save categories on close

function loadCategories() {
  chrome.storage.local.get('savedCategories', (data) => {
    const categories = data.savedCategories || [];

    // Clear any default inputs first
    document.getElementById('category-list').innerHTML = '';

    if (categories.length === 0) {
      addCategoryInput();
      addCategoryInput();
      addCategoryInput();
    }
    else {
      categories.forEach(cat => addCategoryInput(cat));
    }
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

    document.getElementById('status').textContent = 'Loading . . .'

  if (categories.length === 0) {
    document.getElementById('status').textContent = 'Add at least one category!';
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0].id;

    chrome.tabs.sendMessage(
      tabId,
      { action: 'start-run', categories },
      (response) => {
        if (response?.status === 'success'){
          document.getElementById('status').textContent = 'Sorting';
          document.getElementById('spinner').style.display = 'inline-block';
        }
        else {
          document.getElementById('status').textContent = 'Failed to sort emails.';
          document.getElementById('spinner').style.display = 'none';

        }
        document.getElementById('status').textContent =
          response?.status === 'success'
            ? 'Sorting . . .'
            : 'Failed to sort emails.';
      }
    );
  });
});
