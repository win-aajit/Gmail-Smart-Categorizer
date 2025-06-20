console.log("✅ content.js loaded in Gmail");


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if(request.action === 'start-run') {
        try {
            console.log("content.js: extracting email summaries");
            extractEmailSummaries(request.categories);
            sendResponse({status: 'success'});
        }
        catch(err){
            console.error("Error in email summarization:", err);
            sendResponse({ status: 'error', message: err.message });
      }
    }
    
    if (request.action === 'inject-labels') {
        console.log("Recieved categorized email data");

        Object.entries(request.results).forEach(([id, category]) => {
            console.log(`📩 Email ID ${id}, Category: ${category}`);
        });

        injectCategoryButtons(request.results);
        labelEmails(request.results);

        sendResponse({status: 'fully-done'});
    }
})

function extractEmailSummaries(categories) {

    //const observer = new MutationObserver(() => {
        const emails = [];

        document.querySelectorAll('tr.zA').forEach(row => {
            const id = row.id;
            const emailSnippet = row.innerText || '';

            if (id && emailSnippet) {
                emails.push({ id, emailSnippet});
            }
            if (!id) console.warn("Row missing thread ID:", row);
        });

        if (emails.length > 0) {
            console.log("📥 Extracted emails:", emails);

            chrome.runtime.sendMessage(
                { action: 'llm-classify-emails', emails, categories },
                (response) => {
                    response?.status === 'success'
                        ? console.log('✅ Emails sorted!')
                        : console.warn('⚠️ Failed to sort emails.');
                }
            );
        }
        else {
            console.warn("no emails extracted", emails);
        }
    //});

   // observer.observe(inboxContainer, { childList: true, subtree: true });
}

function capitalizeCategory(cat) {
    return cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
}

function injectCategoryButtons(results) {
    var categories = [...new Set(Object.values(results))]; //... is spread operator. Unpacks set into an array
    const existing = document.getElementById('smart-category-bar');
    if(existing) {
        existing.remove(); //get rid of old category bar
    }

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
    container.style.zIndex = '9999';
    container.style.pointerEvents = 'auto';

    // "All" button
    const allBtn = document.createElement('button');
    allBtn.textContent = 'All';
    styleButton(allBtn);
    allBtn.addEventListener('click', () => {
        console.log('Clicked button for all categories:');
        document.querySelectorAll('tr.zA').forEach(row => row.style.display = '');
    });
    container.appendChild(allBtn);

    // Category buttons
    console.log(categories);
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.textContent = capitalizeCategory(cat);
        styleButton(btn);
        btn.addEventListener('click', () => {
            console.log('Clicked button for category:');
            filterEmailsByCategory(results, cat)
        });
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

function styleButton(btn) {
    btn.style.background = '#f1f3f4';
    btn.style.border = '1px solid #dadce0';
    btn.style.borderRadius = '6px';
    btn.style.fontSize = '20px';
    btn.style.padding = '4px 8px';
    btn.style.cursor = 'pointer';
    btn.style.fontFamily = 'Roboto, sans-serif';
    btn.style.pointerEvents = 'auto';
    btn.style.zIndex = '10001';
}

function labelEmails(results) {
    document.querySelectorAll('tr.zA').forEach(row => {
        const idMatch = row.id;
        if (!idMatch) {
            console.log("❌ No ID found for row", row);
            return;
        }

        const category = results[idMatch];
        if (category) {
            console.log(`✅ Labeling thread ${idMatch} as ${category}`);
            row.setAttribute('data-custom-category', category);
        } else {
            console.log(`⚠️ No category for thread ${idMatch}`);
        }
    });
}

function observeAndLabelEmails(results) {
    const inboxContainer = document.querySelector('div[role="main"]');
    if (!inboxContainer) {
        console.warn("❌ Gmail main container not found");
        return;
    }
    const observer = new MutationObserver(() => {
        let rowsLabeled = 0;
        document.querySelectorAll('tr.zA').forEach(row => {
            const idMatch = row.id;
            if (!idMatch) {
                console.warn("id does not found " + idMatch);
                return;
            }
            const category = results[idMatch];
            if (category) {
                row.setAttribute('data-custom-category', category);
                rowsLabeled++;
                console.log(idMatch + ": " + category)
            }
        });

        if (rowsLabeled > 0) {
            console.log(`✅ Labeled ${rowsLabeled} email(s)`);
            observer.disconnect(); // Stop once done
        }
    });

    observer.observe(inboxContainer, { childList: true, subtree: true });
}

function filterEmailsByCategory(results, category) {
    document.querySelectorAll('tr.zA').forEach(row => {
        const rowCat = row.getAttribute('data-custom-category');
        if(rowCat === category) {
            row.style.display = ''; // changing css to default will show row
        }
        else {
            row.style.display = 'none';
        }
    });
}