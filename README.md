# GitHub Explorer: Pro Edition 🚀

## Project Overview

**GitHub Explorer: Pro Edition** is a modern, full-stack web application built with **React** and **Firebase** Firestore. Its primary purpose is to provide an enhanced interface for searching, discovering, and analyzing GitHub repositories. Users can search for repositories using various filters, **bookmark** their favorites, and attach persistent, real-time-synced **personal notes** to each saved repository.

### Key Technologies

* **Frontend:** React (using `useReducer`, `useCallback`, `useEffect`).
* **Styling:** Tailwind CSS (utility-first classes).
* **State Management:** Built-in **React `useReducer`** for complex, centralized state logic.
* **Backend & Database:** **Firebase Firestore** (for real-time data sync) and **Firebase Authentication** (Anonymous/Custom Token).
* **Data Source:** GitHub Search API.
* **Icons:** Lucide-React.

---

## ✨ Features

* **GitHub Repository Search:** Search by keywords, language, and sort by stars, forks, or recent updates.
* **Persistent Bookmarks:** Save favorite repositories to a real-time-synced **Bookmarks** tab using Firestore.
* **Personal Notes:** Attach private, editable notes to bookmarked repositories, with a real-time saving status indicator.
* **Repository Analytics Modal:** A detailed view of a selected repository showing key metrics (Stars, Forks, Issues, Watchers), license, and update date.
* **Debounced Search:** Uses a 600ms debounce on search input to prevent rapid API calls and avoid GitHub rate limiting.
* **Seamless Data Consistency:** Utilizes Firebase's `onSnapshot` listeners to automatically update the UI whenever bookmarks or notes are modified or saved, even across different sessions or devices.

---

## 🛠️ Setup and Configuration

This application requires a Firebase project to manage user data (bookmarks and notes).

### 1. Prerequisites

* Node.js and npm/yarn.
* A Firebase Project with:
    * **Firestore Database** (configured).
    * **Authentication** (Anonymous Sign-in enabled).

### 2. Required Injected Variables

The application relies on these three variables, which must be injected into the environment or build process where the code is run:

| Variable Name | Description | Data Type |
| :--- | :--- | :--- |
| `__firebase_config` | The JSON string of your Firebase project configuration. | `string` |
| `__app_id` | A unique string used as a namespace for this application's data within Firestore. | `string` |
| `__initial_auth_token` | **Optional.** A custom Firebase token for a pre-authenticated user. If not provided, the app defaults to **Anonymous Sign-In**. | `string` or `undefined` |

### 3. Firestore Data Structure

The real-time data is stored under the following path to ensure separation and security based on the authenticated user:
* **`/bookmarks`:** Stores the full repository object for each bookmarked item.
* **`/notes`:** Stores the user's personal notes: `{ content: string, updatedAt: string }`.

---

## 📂 Architecture Highlights

### State Flow (React Reducer)

The core logic uses a single `useReducer` to manage the entire application state.

1.  **Actions:** All UI interactions dispatch actions (e.g., `UPDATE_FILTERS`, `OPEN_MODAL`).
2.  **Reducer:** The `appReducer` processes the action and returns the new state object.
3.  **UI:** Components re-render based on the new state.

### Data Synchronization

The application follows a **"Read from Firebase, Write to Firebase"** pattern:

* **Reads (Real-time):** The main component uses two `useEffect` hooks with `onSnapshot` listeners to establish real-time connections to the `/bookmarks` and `/notes` collections.
* **Writes (Actions):** Handlers like `handleBookmarkToggle` and `handleNoteSave` directly call Firebase SDK functions (`setDoc`, `deleteDoc`). They **do not** update the local state, relying on the real-time listeners to push the database change back to the app, ensuring high data integrity.
