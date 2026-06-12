import { 
    auth, db, googleProvider,
    doc, setDoc, getDoc, getDocs, collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, serverTimestamp, or, and,
    signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged
} from "./firebase-config.js";

// --- Global App Memory States ---
let currentUser = null;
let activeChatUserId = null;
let unsubscribeMessages = null;
let activeTab = "chats"; // options: chats, friends, requests

// --- UI Elements Selectors ---
const authScreen = document.getElementById("auth-screen");
const appScreen = document.getElementById("app-screen");
const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const tabLogin = document.getElementById("tab-login");
const tabRegister = document.getElementById("tab-register");
const googleSigninBtn = document.getElementById("google-signin-btn");
const authError = document.getElementById("auth-error");

const logoutBtn = document.getElementById("logout-btn");
const currentUserAvatar = document.getElementById("current-user-avatar");
const userSearchInput = document.getElementById("user-search-input");
const searchResultsSection = document.getElementById("search-results-section");
const searchResultsList = document.getElementById("search-results-list");

const chatsSection = document.getElementById("chats-section");
const friendsSection = document.getElementById("friends-section");
const requestsSection = document.getElementById("requests-section");
const activeChatsList = document.getElementById("active-chats-list");
const friendsList = document.getElementById("friends-list");
const friendRequestsList = document.getElementById("friend-requests-list");

const chatsTabBtn = document.getElementById("chats-tab-btn");
const friendsTabBtn = document.getElementById("friends-tab-btn");
const requestsTabBtn = document.getElementById("requests-tab-btn");

const welcomeView = document.getElementById("welcome-view");
const activeChatView = document.getElementById("active-chat-view");
const chatUserName = document.getElementById("chat-user-name");
const chatUserStatus = document.getElementById("chat-user-status");
const chatUserAvatar = document.getElementById("chat-user-avatar");
const messagesDisplay = document.getElementById("messages-display");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");

const profileModal = document.getElementById("profile-modal");
const modalUsername = document.getElementById("modal-username");
const modalAvatar = document.getElementById("modal-avatar");
const saveProfileBtn = document.getElementById("save-profile-btn");
const closeModal = document.querySelector(".close-modal");
const backToSidebar = document.getElementById("back-to-sidebar");

// ================= AUTHENTICATION LOGIC =================

// Tab Swapping UI
tabLogin.addEventListener("click", () => {
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");
});

tabRegister.addEventListener("click", () => {
    tabRegister.classList.add("active");
    tabLogin.classList.remove("active");
    registerForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
});

// Create/Sync User Profile DB document
async function createUserProfile(uid, email, username, photoURL) {
    const userDocRef = doc(db, "users", uid);
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) {
        await setDoc(userDocRef, {
            uid: uid,
            email: email,
            username: username || email.split("@")[0],
            photoURL: photoURL || `https://ui-avatars.com/api/?name=${username || 'User'}&background=random`,
            status: "online",
            lastSeen: serverTimestamp()
        });
    } else {
        await updateDoc(userDocRef, { status: "online" });
    }
}

// System Status Presence Updates
async function updateUserStatus(statusValue) {
    if (auth.currentUser) {
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
            status: statusValue,
            lastSeen: serverTimestamp()
        });
    }
}

// Native Email Sign Up Execution
registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("reg-username").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const password = document.getElementById("reg-password").value;
    authError.innerText = "";

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await createUserProfile(cred.user.uid, email, username, null);
    } catch (err) {
        authError.innerText = err.message;
    }
});

// Native Email Login Execution
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    authError.innerText = "";

    try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        await updateUserStatus("online");
    } catch (err) {
        authError.innerText = err.message;
    }
});

// Google Pop-Up Authentication
googleSigninBtn.addEventListener("click", async () => {
    authError.innerText = "";
    try {
        const result = await auth.signInWithPopup(auth, googleProvider);
        await createUserProfile(result.user.uid, result.user.email, result.user.displayName, result.user.photoURL);
    } catch (err) {
        // Fallback standard invocation logic compatibility checks
        try {
            const { signInWithPopup } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
            const result = await signInWithPopup(auth, googleProvider);
            await createUserProfile(result.user.uid, result.user.email, result.user.displayName, result.user.photoURL);
        } catch(innerErr) {
            authError.innerText = innerErr.message;
        }
    }
});

// Log Out Handler
logoutBtn.addEventListener("click", async () => {
    await updateUserStatus("offline");
    signOut(auth).then(() => {
        appScreen.classList.add("hidden");
        authScreen.classList.remove("auth-container");
        authScreen.style.display = "flex";
    });
});

// Guard Visibility State Check Hook
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        authScreen.style.display = "none";
        appScreen.classList.remove("hidden");
        
        // Setup initial user data components
        const profileSnap = await getDoc(doc(db, "users", user.uid));
        if (profileSnap.exists()) {
            currentUserAvatar.src = profileSnap.data().photoURL;
        }
        
        await updateDoc(doc(db, "users", user.uid), { status: "online" });
        initializeRealtimeSync();
    } else {
        authScreen.style.display = "flex";
        appScreen.classList.add("hidden");
    }
});

// Window Closing state hook
window.addEventListener("beforeunload", () => {
    updateUserStatus("offline");
});


// ================= NAVIGATION MANAGEMENT =================
function switchTab(targetTab) {
    activeTab = targetTab;
    chatsTabBtn.classList.remove("active");
    friendsTabBtn.classList.remove("active");
    requestsTabBtn.classList.remove("active");
    
    chatsSection.classList.add("hidden");
    friendsSection.classList.add("hidden");
    requestsSection.classList.add("hidden");

    if (targetTab === "chats") {
        chatsTabBtn.classList.add("active");
        chatsSection.classList.remove("hidden");
    } else if (targetTab === "friends") {
        friendsTabBtn.classList.add("active");
        friendsSection.classList.remove("hidden");
    } else if (targetTab === "requests") {
        requestsTabBtn.classList.add("active");
        requestsSection.classList.remove("hidden");
    }
}

chatsTabBtn.addEventListener("click", () => switchTab("chats"));
friendsTabBtn.addEventListener("click", () => switchTab("friends"));
requestsTabBtn.addEventListener("click", () => switchTab("requests"));


// ================= PROFILE EDIT MODAL =================
currentUserAvatar.addEventListener("click", async () => {
    const snap = await getDoc(doc(db, "users", currentUser.uid));
    if (snap.exists()) {
        modalUsername.value = snap.data().username;
        modalAvatar.value = snap.data().photoURL;
        profileModal.classList.remove("hidden");
    }
});

closeModal.addEventListener("click", () => profileModal.classList.add("hidden"));

saveProfileBtn.addEventListener("click", async () => {
    const newName = modalUsername.value.trim();
    const newURL = modalAvatar.value.trim();
    if (newName) {
        await updateDoc(doc(db, "users", currentUser.uid), {
            username: newName,
            photoURL: newURL || `https://ui-avatars.com/api/?name=${newName}&background=random`
        });
        currentUserAvatar.src = newURL || `https://ui-avatars.com/api/?name=${newName}&background=random`;
        profileModal.classList.add("hidden");
        showToast("Profile updated successfully!");
    }
});


// ================= GLOBAL DISCOVERY & SEARCH =================
userSearchInput.addEventListener("input", async (e) => {
    const term = e.target.value.trim().toLowerCase();
    if (!term) {
        searchResultsSection.classList.add("hidden");
        return;
    }

    const q = query(collection(db, "users"));
    const querySnapshot = await getDocs(q);
    searchResultsList.innerHTML = "";
    let matchFound = false;

    querySnapshot.forEach((documentSnapshot) => {
        const uData = documentSnapshot.data();
        if (uData.uid !== currentUser.uid && uData.username.toLowerCase().includes(term)) {
            matchFound = true;
            const li = document.createElement("li");
            li.innerHTML = `
                <div class="user-item-info">
                    <img src="${uData.photoURL}" class="avatar">
                    <div class="user-meta-details">
                        <span class="name">${uData.username}</span>
                    </div>
                </div>
                <div class="action-buttons">
                    <button class="action-btn add" data-uid="${uData.uid}"><i class="fas fa-user-plus"></i> Add</button>
                </div>
            `;
            searchResultsList.appendChild(li);
        }
    });

    if (matchFound) {
        searchResultsSection.classList.remove("hidden");
    } else {
        searchResultsSection.classList.add("hidden");
    }
});

// Event Delegation interface handler for discovery panel action components
searchResultsList.addEventListener("click", async (e) => {
    const btn = e.target.closest(".action-btn.add");
    if (!btn) return;
    const targetUid = btn.getAttribute("data-uid");
    
    // Create Friend Request document entry
    const reqId = `${currentUser.uid}_${targetUid}`;
    await setDoc(doc(db, "friendRequests", reqId), {
        from: currentUser.uid,
        to: targetUid,
        status: "pending",
        timestamp: serverTimestamp()
    });
    showToast("Friend request sent!");
    userSearchInput.value = "";
    searchResultsSection.classList.add("hidden");
});


// ================= REALTIME STREAMS AND CORRESPONDING PIPELINES =================
function initializeRealtimeSync() {
    
    // 1. Listen for Pending Friend Requests Received
    const qRequests = query(collection(db, "friendRequests"), and(where("to", "==", currentUser.uid), where("status", "==", "pending")));
    onSnapshot(qRequests, async (snapshot) => {
        friendRequestsList.innerHTML = "";
        document.getElementById("req-count").innerText = snapshot.size;
        
        for (const requestDoc of snapshot.docs) {
            const reqData = requestDoc.data();
            const senderSnap = await getDoc(doc(db, "users", reqData.from));
            if (senderSnap.exists()) {
                const sData = senderSnap.data();
                const li = document.createElement("li");
                li.innerHTML = `
                    <div class="user-item-info">
                        <img src="${sData.photoURL}" class="avatar">
                        <div class="user-meta-details">
                            <span class="name">${sData.username}</span>
                        </div>
                    </div>
                    <div class="action-buttons">
                        <button class="action-btn accept" data-reqid="${requestDoc.id}" data-from="${sData.uid}"><i class="fas fa-check"></i></button>
                        <button class="action-btn reject" data-reqid="${requestDoc.id}"><i class="fas fa-times"></i></button>
                    </div>
                `;
                friendRequestsList.appendChild(li);
            }
        }
    });

    // 2. Listen for Friends Relationships
    const qFriends = query(collection(db, "friendships"), or(where("user1", "==", currentUser.uid), where("user2", "==", currentUser.uid)));
    onSnapshot(qFriends, async (snapshot) => {
        friendsList.innerHTML = "";
        activeChatsList.innerHTML = "";
        document.getElementById("friend-count").innerText = snapshot.size;

        for (const fDoc of snapshot.docs) {
            const fData = fDoc.data();
            const friendUid = fData.user1 === currentUser.uid ? fData.user2 : fData.user1;
            
            // Listen to friend profile status in real-time
            onSnapshot(doc(db, "users", friendUid), (userDoc) => {
                if (userDoc.exists()) {
                    const uData = userDoc.data();
                    updateFriendsUIElement(uData);
                    updateActiveChatsUIElement(uData, fData.lastMessage || "No messages yet");
                }
            });
        }
    });
}

// Handle accepting/rejecting actions on pending lists via action panels
friendRequestsList.addEventListener("click", async (e) => {
    const acceptBtn = e.target.closest(".action-btn.accept");
    const rejectBtn = e.target.closest(".action-btn.reject");

    if (acceptBtn) {
        const reqId = acceptBtn.getAttribute("data-reqid");
        const fromUid = acceptBtn.getAttribute("data-from");
        
        await updateDoc(doc(db, "friendRequests", reqId), { status: "accepted" });
        await addDoc(collection(db, "friendships"), {
            user1: currentUser.uid,
            user2: fromUid,
            lastMessage: "Connected! Say Hi.",
            timestamp: serverTimestamp()
        });
        showToast("Friend Request Accepted!");
    }

    if (rejectBtn) {
        const reqId = rejectBtn.getAttribute("data-reqid");
        await updateDoc(doc(db, "friendRequests", reqId), { status: "rejected" });
    }
});


// ================= INTERFACE RENDERING LOGIC COMPONENTS =================
function updateFriendsUIElement(userData) {
    let existingLi = document.getElementById(`friend-list-item-${userData.uid}`);
    if (existingLi) existingLi.remove();

    const li = document.createElement("li");
    li.id = `friend-list-item-${userData.uid}`;
    li.innerHTML = `
        <div class="user-item-info">
            <div class="avatar-wrapper">
                <img src="${userData.photoURL}" class="avatar">
                <span class="status-dot ${userData.status === 'online' ? 'online' : 'offline'}"></span>
            </div>
            <div class="user-meta-details">
                <span class="name">${userData.username}</span>
                <span class="subtext">${userData.status === 'online' ? 'Online' : 'Offline'}</span>
            </div>
        </div>
    `;
    li.addEventListener("click", () => openChatWindowWithTargetUser(userData.uid));
    friendsList.appendChild(li);
}

function updateActiveChatsUIElement(userData, lastMsgText) {
    let existingLi = document.getElementById(`chat-list-item-${userData.uid}`);
    if (existingLi) existingLi.remove();

    const li = document.createElement("li");
    li.id = `chat-list-item-${userData.uid}`;
    li.innerHTML = `
        <div class="user-item-info">
            <div class="avatar-wrapper">
                <img src="${userData.photoURL}" class="avatar">
                <span class="status-dot ${userData.status === 'online' ? 'online' : 'offline'}"></span>
            </div>
            <div class="user-meta-details">
                <span class="name">${userData.username}</span>
                <span class="subtext" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">${lastMsgText}</span>
            </div>
        </div>
    `;
    li.addEventListener("click", () => openChatWindowWithTargetUser(userData.uid));
    activeChatsList.appendChild(li);
}


// ================= CORE CHAT FUNCTIONALITY =================
async function openChatWindowWithTargetUser(targetUid) {
    activeChatUserId = targetUid;
    
    // Mobile View Toggle Responsive Adjustments
    document.querySelector(".sidebar").classList.add("mobile-hidden");

    welcomeView.classList.add("hidden");
    activeChatView.classList.remove("hidden");

    // Dynamic Tracking for Header Presence Info
    onSnapshot(doc(db, "users", targetUid), (docSnap) => {
        if(docSnap.exists() && activeChatUserId === targetUid) {
            const data = docSnap.data();
            chatUserName.innerText = data.username;
            chatUserAvatar.src = data.photoURL;
            chatUserStatus.innerText = data.status === "online" ? "Online" : "Offline";
        }
    });

    // Unsubscribe from previous updates before processing a new stream connection
    if (unsubscribeMessages) unsubscribeMessages();

    const qMessages = query(
        collection(db, "messages"),
        or(
            and(where("senderId", "==", currentUser.uid), where("receiverId", "==", targetUid)),
            and(where("senderId", "==", targetUid), where("receiverId", "==", currentUser.uid))
        ),
        orderBy("timestamp", "asc")
    );

    unsubscribeMessages = onSnapshot(qMessages, (snapshot) => {
        messagesDisplay.innerHTML = "";
        snapshot.forEach((messageDoc) => {
            const msgData = messageDoc.data();
            renderSingleMessageBubble(msgData);
            
            // Performance inside-app real-time notification alert toast system hook triggers
            if(msgData.receiverId === currentUser.uid && !msgData.seen) {
                updateDoc(doc(db, "messages", messageDoc.id), { seen: true });
                triggerAppNotificationAlert(`New Message from ${chatUserName.innerText}`);
            }
        });
        messagesDisplay.scrollTop = messagesDisplay.scrollHeight;
    });
}

function renderSingleMessageBubble(msgData) {
    const isSent = msgData.senderId === currentUser.uid;
    const row = document.createElement("div");
    row.classList.add("msg-row", isSent ? "sent" : "received");

    const timeString = msgData.timestamp ? new Date(msgData.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just Now";
    const statusCheckMark = isSent ? (msgData.seen ? '<i class="fas fa-check-double" style="color: #4fc3f7;"></i>' : '<i class="fas fa-check"></i>') : '';

    row.innerHTML = `
        <div class="msg-bubble">
            <p class="msg-text">${escapeHTML(msgData.text)}</p>
            <div class="msg-meta">
                <span>${timeString}</span>
                ${statusCheckMark}
            </div>
        </div>
    `;
    messagesDisplay.appendChild(row);
}

// Message Dispatch Submit Action Routine
messageForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const txt = messageInput.value.trim();
    if (!txt || !activeChatUserId) return;

    messageInput.value = "";

    const msgPayload = {
        senderId: currentUser.uid,
        receiverId: activeChatUserId,
        text: txt,
        seen: false,
        timestamp: serverTimestamp()
    };

    await addDoc(collection(db, "messages"), msgPayload);

    // Sync latest status directly into top root indexing table for sorting lists optimization tracking
    const qFriendship = query(collection(db, "friendships"), or(
        and(where("user1", "==", currentUser.uid), where("user2", "==", activeChatUserId)),
        and(where("user1", "==", activeChatUserId), where("user2", "==", currentUser.uid))
    ));
    
    const fSnap = await getDocs(qFriendship);
    if (!fSnap.empty) {
        await updateDoc(doc(db, "friendships", fSnap.docs[0].id), {
            lastMessage: txt,
            timestamp: serverTimestamp()
        });
    }
});

// Mobile Action Back Button Implementation
backToSidebar.addEventListener("click", () => {
    document.querySelector(".sidebar").classList.remove("mobile-hidden");
});


// ================= UTILITY OPERATIONS COMPONENTS =================
function showToast(msg) {
    const toast = document.getElementById("app-notification");
    toast.innerText = msg;
    toast.classList.remove("hidden");
    setTimeout(() => toast.classList.add("hidden"), 3500);
}

function triggerAppNotificationAlert(message) {
    // Basic inner notification interface routine handler logic
    console.log(`Notification banner: ${message}`);
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}
