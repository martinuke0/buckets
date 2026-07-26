export const userDoc = (uid: string) => `users/${uid}`;
export const bucketsCol = (uid: string) => `users/${uid}/buckets`;
export const txCol = (uid: string) => `users/${uid}/transactions`;
export const allocationsCol = (uid: string) => `users/${uid}/allocations`;
export const pendingIncomeCol = (uid: string) => `users/${uid}/pendingIncome`;
export const consentsCol = (uid: string) => `users/${uid}/consents`;
// Coach chat is grouped into conversations. A conversation is a summary doc
// (title/createdAt/lastMessageAt) with its messages nested underneath, so one
// conversation's messages sort by createdAt alone — no composite index needed.
export const coachConversationsCol = (uid: string) => `users/${uid}/conversations`;
export const coachMessagesCol = (uid: string, cid: string) => `users/${uid}/conversations/${cid}/messages`;
export const coachMemoriesCol = (uid: string) => `users/${uid}/coachMemories`;
