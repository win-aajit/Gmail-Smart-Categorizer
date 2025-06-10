console.log("✅ content.js loaded in Gmail");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'inject-labels') {
        console.log("Recieved categorized email data");

        injectCategoryButtons(request.results);
        labelEmails(request.results);
        waitAndInjectButtons(request.results);
    }
})

function injectCategoryButtons(results) {
    var categories = [...new Set(Object.values(results))]; //... is spread operator. Unpacks set into an array
    if(document.getElementById('smart-category-bar')) return;

    var toolbar = document.querySelector('div.nH.aqK');
    if (!toolbar) {
        console.warn("❌ Toolbar not found");
        return;
    }

    // Create a button container
    const container = document.createElement('div');
    container.id = 'smart-category-bar';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.marginLeft = '16px';
    container.style.gap = '6px';

    // "All" button
    const allBtn = document.createElement('button');
    allBtn.textContent = 'All';
    styleButton(allBtn);
    allBtn.addEventListener('click', () => {
        document.querySelectorAll('tr.zA').forEach(row => row.style.display = '');
    });
    container.appendChild(allBtn);

    // Category buttons
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.textContent = cat;
        styleButton(btn);
        btn.addEventListener('click', () => filterEmailsByCategory(results, cat));
        container.appendChild(btn);
    });

    // Insert container at proper position (after “More” menu)
    const moreBtn = toolbar.querySelector('[aria-label="More email options"]');
    if (moreBtn && moreBtn.parentElement) {
        moreBtn.parentElement.insertAdjacentElement('afterend', container);
        console.log("success!!!");
    } else {
        // fallback
        toolbar.appendChild(container);
        console.log("success?");
    }
}

function waitAndInjectButtons(results) {
    const tryInject = setInterval(() => {
        const toolbar = document.querySelector('div[aria-label="Search refinement"]');
        if (toolbar) {
            clearInterval(tryInject);
            injectCategoryButtons(results);
        }
    }, 500);
}

function styleButton(btn) {
  btn.style.background = '#f1f3f4';
  btn.style.border = '1px solid #dadce0';
  btn.style.borderRadius = '4px';
  btn.style.fontSize = '12px';
  btn.style.padding = '4px 8px';
  btn.style.cursor = 'pointer';
  btn.style.fontFamily = 'Roboto, sans-serif';
}

function labelEmails(results) {
    document.querySelectorAll('tr.zA').forEach(row => {
        const idMatch = row.dataset.threadId || row.getAttribute('data-legacy-thread-id');
        if (!idMatch) return;

        const category = results[idMatch];
        if (category) {
            row.setAttribute('data-category', category); // Tag the row with its category
        }
    });
}
