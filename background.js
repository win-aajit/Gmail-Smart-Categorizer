
const k = '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';
const MODEL = 'deepseek/deepseek-chat-v3-0324:free'

/*
const CLIENT_ID = '450119926324-pkkq7ic0ouirmclvpsi643a2s0tlsm30.apps.googleusercontent.com';
const REDIRECT_URI = `https://${chrome.runtime.id}.chromiumapp.org/`;
const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.modify'
];
const ONE_DAY_QUERY = 'newer_than:1d';
const ONE_WEEK_QUERY = 'newer_than:7d';

function authenticate(callback) {//oauth
    const authURL = `https://accounts.google.com/o/oauth2/auth?client_id=${CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=token&scope=${SCOPES.join(' ')}`;
    
    chrome.identity.launchWebAuthFlow({
        url: authURL,
        interactive: true //user has to login
        },
        function (redirectURL){
            if(chrome.runtime.lastError || !redirectURL) { //failure
                console.error('Auth failed', chrome.runtime.lastError);
                return;
            }
            // if not failure then
            const accessToken = new URL(redirectURL).hash.match(/access_token=([^&]+)/)[1]; //extract access token from url with regex
            callback(accessToken);
        });
}
function fetchLatestEmails(token, onAllEmailsFetched) {
    console.log('📨 Starting fetchLatestEmails');
    var emailBodies = [];
    var msgIDs = [];


    fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(ONE_WEEK_QUERY)}&maxResults=25`, {
        headers: {
            Authorization: 'Bearer ' + token
        }
    })
    .then(res => {
        console.log('📨 Gmail fetch response received');
        return res.json();
    })
    .then(data => {
        console.log('📨 Gmail data:', data);

        if (!data.messages) {
            console.log('⚠️ No messages found');
            return;
        }

        let fetchedCount = 0;
        let targetCount = data.messages.length;

        data.messages.forEach(msg => {
            console.log(`📬 Fetching message ID: ${msg.id}`);
            fetchEmailBody(token, msg.id, (emailBody) =>{
                emailBodies.push(emailBody);
                msgIDs.push(msg.id);
                fetchedCount++;

                if(fetchedCount == targetCount){
                    console.log('✅ All email bodies fetched');
                    onAllEmailsFetched(emailBodies, msgIDs);                    
                }
            });

        });
    })
    .catch(err => {
        console.error('❌ Error fetching emails:', err);
    });
}

function fetchEmailBody(token, msgID, callback) {
    console.log(`📬 Fetching full email body for: ${msgID}`);

    fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgID}?format=full`, {
        headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.json())
    .then(data => {
        const body = getPlainText(data.payload);
        console.log(`📨 Extracted email body for ${msgID}:`, body.slice(0, 256)); // preview first 256 chars
        callback(body, msgID, token);
    })
    .catch(err => {
        console.error(`❌ Failed to fetch message ${msgID}:`, err);
    });
}*/


function getPlainText(payload) {
    if (!payload) return '';

    if (payload.parts){//multipart email (nested)
        for (const part of payload.parts){
            if (part.mimeType === 'text/plain') {
                return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));

            }
        }
    }
    //single part email
    return atob((payload.body?.data || '').replace(/-/g, '+').replace(/_/g, '/')); //decodes base 64 into string

}

function splitIntoBatches(array, size){
    const batches = [];
    for (let i = 0; i < array.length; i += size) {
        batches.push(array.slice(i, i + size));
    }
    return batches;    
}

async function batchCategorizeEmails(emails, categories) {
    
    const batches = splitIntoBatches(emails, 5); // Try batch size 3
    const allResults = [];

    for (const batch of batches) {
        const userPrompt = batch.map((email, i) =>
        `${i + 1}. ${email.emailSnippet.replace(/\n/g, ' ')}`
        ).join('\n');

        const systemPrompt = `
    You are an email categorizer. Only use these categories: ${categories.join(', ')}.
    Return a JSON array with one category per snippet in the same order. No explanations.
    Only output JSON. No markdown. No numbering. No invented categories.
    `;

        try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
            "Authorization": `Bearer ${k}`,
            "Content-Type": "application/json"
            },
            body: JSON.stringify({
            model: "deepseek/deepseek-chat-v3-0324:free",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ]
            })
        });

        const raw = await response.json();
        const content = raw.choices?.[0]?.message?.content || "";

        console.log(raw);

        const jsonText = content.replace(/```(json)?/g, '').trim();
        const result = JSON.parse(jsonText);

        if (Array.isArray(result) && result.length === batch.length) {
            allResults.push(...result);
        } else {
            console.warn("⚠️ Mismatch in result length:", result);
            allResults.push(...Array(batch.length).fill("Unknown")); // fallback
        }
        } catch (err) {
        console.error("❌ Batch failed:", err);
        allResults.push(...Array(batch.length).fill("Error")); // fallback
        }
    }

    return allResults;
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if(request.action === 'llm-classify-emails'){
        console.log("llm-classify-emails hit");
        (async () => { //async wrapper
            try {
                const emails = request.emails;
                const categories = request.categories;
                const msgIDs = emails.map(e => e.id);
                const emailSnippets = emails.map(e => e.emailSnippet);

                const results = await batchCategorizeEmails(emails, categories);

                if (!results || results.length !== msgIDs.length) {
                    console.error("❌ Categorization failed or mismatched length");
                    sendResponse({ status: 'error', message: 'Categorization failed' });
                    return;
                }

                // Store each result
                msgIDs.forEach((msgID, i) => {
                    const result = results[i];
                    console.log(`📩 Email ${msgID} categorized as: ${result}`);
                    chrome.storage.local.set({ [msgID]: result });
                });

                // Send results back to Gmail tab(s)
                chrome.tabs.query({ url: "*://mail.google.com/*" }, (tabs) => {
                    const resultMap = Object.fromEntries(msgIDs.map((id, i) => [id, results[i]]));

                    tabs.forEach(tab => {
                        chrome.tabs.sendMessage(tab.id, {
                            action: 'inject-labels',
                            results: resultMap
                        }, (response) => {
                            if (chrome.runtime.lastError) {
                                console.warn("⚠️ Could not send message to tab:", chrome.runtime.lastError.message);
                            } else if(response?.status === 'fully-done') {
                                console.log("✅ Sent inject-labels to tab", tab.id);
                            }
                            else {
                                console.warn('Error when injecting in content.js');
                            }
                        });
                    });
                });

                sendResponse({ status: 'success', result: results });
            } catch (err) {
                console.error("❌ Error in LLM classification:", err);
                sendResponse({ status: 'error', message: err.message });
            }
        })();
        return true; // Keep message channel open for async sendResponse
    }
});

