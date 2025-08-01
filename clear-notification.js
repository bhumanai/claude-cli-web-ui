// Simple JavaScript to clear the persistent notification
// Run this in browser console or create a button

// Clear localStorage that might be storing the notification
localStorage.removeItem('notifications');
localStorage.removeItem('connectionLost');
localStorage.removeItem('errorNotifications');

// Clear sessionStorage too
sessionStorage.removeItem('notifications');
sessionStorage.removeItem('connectionLost');
sessionStorage.removeItem('errorNotifications');

// Refresh the page to clear any in-memory notifications
window.location.reload();

console.log('✅ Cleared notifications and refreshed page');