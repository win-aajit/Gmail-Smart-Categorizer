//Required to authorize acces to gmail API
//const OPENROUTER_API_KEY = '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'; //free-tier key
const OPENROUTER_API_KEY = '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'; //free-tier key

//const MODEL = 'openrouter/auto';
const MODEL = 'mistralai/mistral-7b-instruct:free'
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
}


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

async function batchCategorizeEmails(emailBodies, num_cat, categories) {
    //prompt building
    var prompt = `You are an email classifier. Categorize each email strictly into one of the following categories:`; //temp
    for (category of categories) {
        prompt += ` ${category},`;
    }
    prompt += `Return ONLY a JSON array of categories corresponding to each email, in order. Remember to only to use the previously given categories. \nExample output: ["category 1", "category 2", "category 1", "category 3"]`;


    var index = 0;
    for(emailbody of emailBodies){
        emailbody = emailbody.slice(0, 256) + '… [truncated]';
        prompt += `. \nEmail ${index}: ${emailbody}`;
        index++;
    }

    //const truncateText = text.length > 512 ? text.slice(0, 512) + '… [truncated]' : text; //reduce amount of tokens needed

    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + OPENROUTER_API_KEY,
                'Content-Type': 'application/json',
                'HTTP-Referer': `https://${chrome.runtime.id}.chromiumapp.org/`,
                'X-Title': 'Gmail Sorter Extension'
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 5000
            })
        });

        const data = await response.json();
        console.log('🤖 OpenRouter response:', data);

        const rawContent = data.choices?.[0]?.message?.content?.trim();

        //let parsedCategories = [];
        try {
            console.log(categories);
            categories = JSON.parse(rawContent)
            .map(c => (typeof c === 'string' ? c.trim() : null))
            .filter(c => c); //removes unparse-able values

            console.log("✅ Parsed categories:", categories);
        } catch (e) {
            console.error("❌ Failed to parse JSON response:", rawContent, e);
            return null;
        }

        return categories;  // This will be an array like ["Work", "Personal", "Spam"]
                

    } catch (err) {
        console.error("❌ Failed to categorize email via OpenRouter:", err);
        return null;
    }
}


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'start-run') {
    const categories = request.categories;

    authenticate(async (token) => {
      console.log('✅ Got Gmail token:', token);

      try {
        fetchLatestEmails(token, async (emailBodies, msgIDs) => {
          const results = await batchCategorizeEmails(emailBodies, categories.length, categories);

          if (!results) {
            console.error("❌ Categorization failed");
            sendResponse({ status: 'error', message: 'Categorization failed' });
            return;
          }

          results.forEach((result, i) => {
            var msgID = msgIDs[i];
            console.log(`📩 Email ${msgID} categorized as: ${result}`);
            chrome.storage.local.set({ [msgID]: result });
          });

          chrome.tabs.query({ url: "*://mail.google.com/*" }, (tabs) => {
            tabs.forEach(tab => {
              chrome.tabs.sendMessage(tab.id, {
                action: 'inject-labels',
                results: Object.fromEntries(msgIDs.map((msgID, i) => [msgID, results[i]]))
              }, (response) => {
                if (chrome.runtime.lastError) {
                  console.warn("⚠️ Could not send message to tab:", chrome.runtime.lastError.message);
                } else {
                  console.log("✅ Sent inject-labels message to tab", tab.id);
                }
              });
            });
          });

          sendResponse({ status: 'success', result: results });
        });

      } catch (err) {
        console.error("❌ Error in fetch or categorization:", err);
        sendResponse({ status: 'error', message: err.message });
      }

    });

    return true; // Keep message channel open for async sendResponse
  }
});

