document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const welcomeScreen = document.getElementById('welcomeScreen');
    const chatBox = document.getElementById('chatBox');
    const startChatBtn = document.getElementById('startChatBtn');
    const chatMessages = document.getElementById('chatMessages');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const fileInput = document.getElementById('fileInput');

    // Start chat button click handler
    startChatBtn.addEventListener('click', function() {
        welcomeScreen.classList.add('hidden');
        chatBox.classList.remove('hidden');
        addBotMessage("Hello there! I'm Dr. CareBot. How can I assist you with your health today? Please describe your symptoms or health concern, and I'll do my best to help. Remember, I'm here to provide general information - for serious conditions, always consult a doctor in person.");
    });

    // Send message handler
    function sendMessage() {
        const message = userInput.value.trim();
        if (message) {
            addUserMessage(message);
            userInput.value = '';
            showTypingIndicator();
            
            fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: message })
            })
            .then(response => {
                if (!response.ok) {
                    if (response.status === 429) {
                        throw new Error('rate_limit');
                    }
                    throw new Error('server_error');
                }
                return response.json();
            })
            .then(data => {
                removeTypingIndicator();
                if (data.error) {
                    addBotMessage(`Error: ${data.error}`);
                } else {
                    addBotMessage(data.reply || "I didn't understand that. Could you rephrase your question?");
                }
            })
            .catch(error => {
                removeTypingIndicator();
                if (error.message === 'rate_limit') {
                    addBotMessage("I'm currently receiving too many requests. Please wait a minute and try again.");
                } else {
                    addBotMessage("I'm having technical difficulties. Please try again later.");
                }
                console.error('Error:', error);
            });
        }
    }

    // Send button click and Enter key press
    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // File upload handler
    fileInput.addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            if (file.type.match('image.*')) {
                uploadImage(file);
            } else {
                addBotMessage("Please upload an image file (JPEG, PNG, etc.)");
            }
        }
    });

    // Upload image function
    function uploadImage(file) {
        const formData = new FormData();
        formData.append('image', file);
        
        showTypingIndicator();
        addUserMessage("Image uploaded: " + file.name);
        
        fetch('/api/analyze-image', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('server_error');
            }
            return response.json();
        })
        .then(data => {
            removeTypingIndicator();
            if (data.error) {
                addBotMessage(`Error: ${data.error}`);
            } else {
                addBotMessage(data.reply);
            }
        })
        .catch(error => {
            removeTypingIndicator();
            addBotMessage("Sorry, I couldn't process the image. Please try again or describe your concern in words.");
            console.error('Error:', error);
        });
    }

    // Helper functions for chat UI
    function addUserMessage(text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message user-message';
        messageDiv.innerHTML = `
            ${text}
            <span class="message-time">${getCurrentTime()}</span>
        `;
        chatMessages.appendChild(messageDiv);
        scrollToBottom();
    }

    function addBotMessage(text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message bot-message';
        messageDiv.innerHTML = `
            ${text}
            <span class="message-time">${getCurrentTime()}</span>
        `;
        chatMessages.appendChild(messageDiv);
        scrollToBottom();
    }

    function showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.id = 'typingIndicator';
        typingDiv.className = 'typing-indicator';
        typingDiv.innerHTML = `
            <span></span>
            <span></span>
            <span></span>
        `;
        chatMessages.appendChild(typingDiv);
        scrollToBottom();
    }

    function removeTypingIndicator() {
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    function getCurrentTime() {
        const now = new Date();
        return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
});