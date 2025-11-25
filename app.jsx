import React, { useReducer, useCallback, useRef, useEffect, useState } from 'react';
import { 
  Search, Star, GitFork, AlertCircle, BookOpen, 
  Calendar, ExternalLink, Bookmark, FileText, 
  TrendingUp, BarChart2, X, Loader, Filter,
  Github, Database, BarChart3, Check, RefreshCw
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  deleteDoc, 
  collection, 
  onSnapshot,
  query
} from 'firebase/firestore';

// --- Firebase Configuration & Init ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- State Management ---
const initialState = {
  user: null,
  repos: [],
  bookmarks: new Map(), // Map<String, Repo>
  notes: new Map(),     // Map<String, { content, updatedAt }>
  filters: {
    query: "react",
    sort: "stars",
    language: "",
    view: "discover"
  },
  ui: {
    loading: false,
    error: null,
    selectedRepo: null,
    modalOpen: false,
    noteText: "",
    syncing: false
  }
};

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload };
    
    case 'SET_REPOS':
      return { ...state, repos: action.payload };
    
    case 'SET_BOOKMARKS':
      return { ...state, bookmarks: action.payload };
    
    case 'SET_NOTES':
      return { ...state, notes: action.payload };
    
    case 'UPDATE_FILTERS':
      return { 
        ...state, 
        filters: { ...state.filters, ...action.payload }
      };
    
    case 'SET_LOADING':
      return { 
        ...state, 
        ui: { ...state.ui, loading: action.payload }
      };
    
    case 'SET_SYNCING':
      return {
        ...state,
        ui: { ...state.ui, syncing: action.payload }
      };

    case 'SET_ERROR':
      return { 
        ...state, 
        ui: { ...state.ui, error: action.payload }
      };
    
    case 'OPEN_MODAL':
      return {
        ...state,
        ui: {
          ...state.ui,
          modalOpen: true,
          selectedRepo: action.repo,
          noteText: state.notes.get(String(action.repo.id))?.content || ""
        }
      };
    
    case 'CLOSE_MODAL':
      return {
        ...state,
        ui: {
          ...state.ui,
          modalOpen: false,
          selectedRepo: null,
          noteText: ""
        }
      };
    
    case 'UPDATE_NOTE':
      return {
        ...state,
        ui: { ...state.ui, noteText: action.payload }
      };
    
    default:
      return state;
  }
}

// --- Custom Hooks ---

const useGitHubAPI = () => {
  const fetchRepositories = useCallback(async (filters) => {
    const { query, sort, language } = filters;
    if (!query) return [];
    
    let searchQuery = query;
    if (language) searchQuery += ` language:${language}`;
    
    // Add a little delay to prevent rate limiting during rapid typing
    const response = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(searchQuery)}&sort=${sort}&order=desc&per_page=12`
    );
    
    if (!response.ok) {
      if (response.status === 403) {
        throw new Error("GitHub API rate limit exceeded. Please wait a minute.");
      }
      throw new Error("Failed to fetch repositories.");
    }
    
    const data = await response.json();
    return data.items || [];
  }, []);

  return { fetchRepositories };
};

// --- Components ---

const MetricBadge = ({ icon: Icon, value, colorClass, label }) => (
  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
    <Icon className={`w-4 h-4 ${colorClass}`} />
    <span className="font-semibold text-slate-700">{typeof value === 'number' ? value.toLocaleString() : value}</span>
    {label && <span className="text-xs text-slate-500 uppercase tracking-wide">{label}</span>}
  </div>
);

const RepositoryMetrics = ({ metrics }) => {
  const { stars, forks, issues, watchers, license, updatedAt } = metrics;
  
  return (
    <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
      <div className="flex items-center gap-2 mb-4 text-slate-800 font-semibold">
        <BarChart3 className="w-5 h-5 text-slate-500" />
        <span>Repository Analytics</span>
      </div>
      
      <div className="grid grid-cols-2 gap-3 mb-4">
        <MetricBadge 
          icon={Star} 
          value={stars} 
          colorClass="text-amber-500" 
          label="Stars" 
        />
        <MetricBadge 
          icon={GitFork} 
          value={forks} 
          colorClass="text-blue-500" 
          label="Forks" 
        />
        <MetricBadge 
          icon={AlertCircle} 
          value={issues} 
          colorClass="text-red-500" 
          label="Issues" 
        />
        <MetricBadge 
          icon={Database} 
          value={watchers} 
          colorClass="text-purple-500" 
          label="Watchers" 
        />
      </div>
      
      <div className="flex justify-between text-sm text-slate-500 pt-4 border-t border-slate-200">
        <span>License: <span className="font-medium text-slate-700">{license || "None"}</span></span>
        <span>Updated: <span className="font-medium text-slate-700">{updatedAt}</span></span>
      </div>
    </div>
  );
};

const RepositoryCard = ({ 
  repository, 
  isBookmarked, 
  onBookmarkToggle, 
  onDetailsOpen 
}) => {
  const {
    name,
    owner,
    description,
    stargazers_count,
    forks_count,
    open_issues_count,
    language,
    updated_at
  } = repository;

  const handleBookmarkClick = (e) => {
    e.stopPropagation();
    onBookmarkToggle(repository);
  };

  return (
    <article 
      className="group bg-white border border-slate-200 rounded-xl p-6 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-xl hover:border-blue-200 flex flex-col h-full"
      onClick={() => onDetailsOpen(repository)}
    >
      <header className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <img 
            src={owner.avatar_url} 
            alt={owner.login}
            className="w-10 h-10 rounded-full border border-slate-100"
          />
          <h3 className="font-bold text-lg text-slate-800 group-hover:text-blue-600 transition-colors line-clamp-1">
            {name}
          </h3>
        </div>
        <button 
          className={`p-2 rounded-full transition-colors ${
            isBookmarked 
              ? 'text-amber-500 bg-amber-50' 
              : 'text-slate-300 hover:text-slate-500 hover:bg-slate-50'
          }`}
          onClick={handleBookmarkClick}
        >
          <Bookmark className={isBookmarked ? "fill-current" : ""} size={20} />
        </button>
      </header>

      <p className="text-slate-600 text-sm leading-relaxed mb-6 line-clamp-3 flex-grow">
        {description || "No description available for this repository."}
      </p>

      <div className="flex gap-4 mb-6">
        <div className="flex items-center gap-1 text-slate-600 text-sm">
          <Star size={14} className="text-amber-500" />
          <span className="font-medium">{stargazers_count.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-1 text-slate-600 text-sm">
          <GitFork size={14} className="text-blue-500" />
          <span className="font-medium">{forks_count.toLocaleString()}</span>
        </div>
      </div>

      <footer className="flex justify-between items-center pt-4 border-t border-slate-100 mt-auto">
        {language ? (
          <span className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            {language}
          </span>
        ) : <span></span>}
        
        <button className="text-blue-600 text-sm font-medium flex items-center gap-1 hover:underline">
          Analyze <TrendingUp size={14} />
        </button>
      </footer>
    </article>
  );
};

const SearchFilters = ({ filters, onFiltersChange }) => {
  const { query, sort, language } = filters;

  return (
    <div className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 py-4 md:px-8 shadow-sm">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-4">
        <div className="relative flex-grow max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            value={query}
            onChange={(e) => onFiltersChange({ query: e.target.value })}
            placeholder="Search repositories..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0">
          <select 
            value={sort}
            onChange={(e) => onFiltersChange({ sort: e.target.value })}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="stars">Most Stars</option>
            <option value="forks">Most Forks</option>
            <option value="updated">Recently Updated</option>
          </select>

          <select 
            value={language}
            onChange={(e) => onFiltersChange({ language: e.target.value })}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="">All Languages</option>
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="python">Python</option>
            <option value="rust">Rust</option>
            <option value="go">Go</option>
            <option value="java">Java</option>
          </select>
        </div>
      </div>
    </div>
  );
};

const Navigation = ({ view, bookmarksCount, user, onViewChange }) => (
  <nav className="bg-slate-900 text-white px-4 py-3 md:px-8">
    <div className="max-w-7xl mx-auto flex justify-between items-center">
      <div className="flex items-center gap-3">
        <div className="bg-blue-600 p-1.5 rounded-lg">
          <Github size={24} className="text-white" />
        </div>
        <div>
          <h1 className="font-bold text-lg leading-none">GitHub Explorer</h1>
          <p className="text-xs text-slate-400 font-medium">Pro Edition</p>
        </div>
      </div>
      
      <div className="flex items-center gap-1 bg-slate-800/50 p-1 rounded-lg">
        <button 
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
            view === 'discover' 
              ? 'bg-blue-600 text-white shadow-lg' 
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          onClick={() => onViewChange('discover')}
        >
          Discover
        </button>
        <button 
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
            view === 'bookmarks' 
              ? 'bg-blue-600 text-white shadow-lg' 
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
          onClick={() => onViewChange('bookmarks')}
        >
          Bookmarks
          {bookmarksCount > 0 && (
            <span className="bg-slate-900 text-white text-[10px] px-1.5 py-0.5 rounded-full border border-slate-700">
              {bookmarksCount}
            </span>
          )}
        </button>
      </div>
    </div>
  </nav>
);

const RepositoryModal = ({ 
  isOpen, 
  repository, 
  noteText, 
  onClose, 
  onNoteChange,
  onNoteSave,
  isSyncing
}) => {
  if (!isOpen || !repository) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200" 
        onClick={e => e.stopPropagation()}
      >
        <header className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex justify-between items-center z-10">
          <div className="flex items-center gap-3">
            <img src={repository.owner.avatar_url} className="w-8 h-8 rounded-full" alt="" />
            <h2 className="font-bold text-xl text-slate-800 truncate max-w-[300px]">{repository.full_name}</h2>
          </div>
          <button 
            className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>

        <div className="p-6 space-y-8">
          <section>
            <p className="text-slate-600 text-lg leading-relaxed">
              {repository.description}
            </p>
            <a 
              href={repository.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-4 text-blue-600 font-semibold hover:text-blue-700 hover:underline"
            >
              View on GitHub <ExternalLink size={16} />
            </a>
          </section>

          <section className="bg-amber-50 rounded-xl p-6 border border-amber-100">
            <div className="flex justify-between items-center mb-3">
              <h3 className="flex items-center gap-2 font-semibold text-amber-900">
                <FileText size={18} />
                Personal Notes
              </h3>
              {isSyncing && (
                <span className="text-xs text-amber-600 flex items-center gap-1">
                  <RefreshCw size={10} className="animate-spin" /> Saving...
                </span>
              )}
            </div>
            <textarea
              value={noteText}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="Jot down thoughts about this project..."
              className="w-full h-32 p-3 bg-white border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-slate-700 placeholder:text-slate-400 resize-none"
            />
            <div className="flex justify-end mt-3">
              <button 
                onClick={onNoteSave} 
                className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Check size={16} /> Save Note
              </button>
            </div>
          </section>

          <RepositoryMetrics 
            metrics={{
              stars: repository.stargazers_count,
              forks: repository.forks_count,
              issues: repository.open_issues_count,
              watchers: repository.watchers_count,
              license: repository.license?.name,
              updatedAt: new Date(repository.updated_at).toLocaleDateString()
            }}
          />
        </div>
      </div>
    </div>
  );
};

// --- Main App Component ---
export default function GitHubExplorer() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { fetchRepositories } = useGitHubAPI();
  const searchTimeoutRef = useRef();

  const {
    user,
    repos,
    bookmarks,
    notes,
    filters,
    ui
  } = state;

  // 1. Authentication Setup
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth failed:", err);
        dispatch({ type: 'SET_ERROR', payload: "Authentication failed. Some features may be unavailable." });
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      dispatch({ type: 'SET_USER', payload: u });
    });
    return () => unsubscribe();
  }, []);

  // 2. Real-time Data Sync (Bookmarks & Notes)
  useEffect(() => {
    if (!user) return;

    // Listen to Bookmarks
    const bookmarksRef = collection(db, 'artifacts', appId, 'users', user.uid, 'bookmarks');
    const unsubBookmarks = onSnapshot(bookmarksRef, 
      (snapshot) => {
        const newBookmarks = new Map();
        snapshot.forEach(doc => {
          newBookmarks.set(doc.id, doc.data());
        });
        dispatch({ type: 'SET_BOOKMARKS', payload: newBookmarks });
      },
      (error) => console.error("Bookmark sync error:", error)
    );

    // Listen to Notes
    const notesRef = collection(db, 'artifacts', appId, 'users', user.uid, 'notes');
    const unsubNotes = onSnapshot(notesRef, 
      (snapshot) => {
        const newNotes = new Map();
        snapshot.forEach(doc => {
          newNotes.set(doc.id, doc.data());
        });
        dispatch({ type: 'SET_NOTES', payload: newNotes });
      },
      (error) => console.error("Note sync error:", error)
    );

    return () => {
      unsubBookmarks();
      unsubNotes();
    };
  }, [user]);

  // 3. Derived State
  const displayedRepos = filters.view === 'bookmarks' 
    ? Array.from(bookmarks.values())
    : repos;

  // 4. Actions & Handlers
  const handleSearch = useCallback(async () => {
    if (filters.view !== 'discover') return;

    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const repositories = await fetchRepositories(filters);
      dispatch({ type: 'SET_REPOS', payload: repositories });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error.message });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [filters, fetchRepositories]);

  const handleBookmarkToggle = useCallback(async (repo) => {
    if (!user) {
      dispatch({ type: 'SET_ERROR', payload: "Please wait for login to complete." });
      return;
    }

    const repoId = String(repo.id);
    const isBookmarked = bookmarks.has(repoId);
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'bookmarks', repoId);

    try {
      if (isBookmarked) {
        await deleteDoc(docRef);
      } else {
        await setDoc(docRef, repo);
      }
      // No need to dispatch here, onSnapshot handles the update
    } catch (err) {
      console.error("Bookmark error", err);
      dispatch({ type: 'SET_ERROR', payload: "Failed to update bookmark." });
    }
  }, [user, bookmarks]);

  const handleNoteSave = useCallback(async () => {
    if (!user || !ui.selectedRepo) return;

    const repoId = String(ui.selectedRepo.id);
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'notes', repoId);
    
    dispatch({ type: 'SET_SYNCING', payload: true });
    try {
      await setDoc(docRef, {
        content: ui.noteText,
        updatedAt: new Date().toISOString()
      });
      // Visual feedback delay
      setTimeout(() => dispatch({ type: 'SET_SYNCING', payload: false }), 500);
    } catch (err) {
      console.error("Note save error", err);
      dispatch({ type: 'SET_SYNCING', payload: false });
      dispatch({ type: 'SET_ERROR', payload: "Failed to save note." });
    }
  }, [user, ui.selectedRepo, ui.noteText]);

  // 5. Search Debounce Effect
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (filters.view === 'discover') {
      searchTimeoutRef.current = setTimeout(handleSearch, 600);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [filters, handleSearch]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <Navigation 
        view={filters.view}
        bookmarksCount={bookmarks.size}
        user={user}
        onViewChange={(view) => dispatch({ type: 'UPDATE_FILTERS', payload: { view } })}
      />

      {filters.view === 'discover' && (
        <SearchFilters 
          filters={filters}
          onFiltersChange={(updates) => dispatch({ type: 'UPDATE_FILTERS', payload: updates })}
        />
      )}

      <main className="max-w-7xl mx-auto p-4 md:p-8">
        {ui.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2 mb-6 animate-in fade-in slide-in-from-top-2">
            <AlertCircle size={20} className="shrink-0" />
            {ui.error}
          </div>
        )}

        {ui.loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader className="w-10 h-10 animate-spin mb-4 text-blue-500" />
            <p className="font-medium">Scanning the octoverse...</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayedRepos.map(repo => (
                <RepositoryCard
                  key={repo.id}
                  repository={repo}
                  isBookmarked={bookmarks.has(String(repo.id))}
                  onBookmarkToggle={handleBookmarkToggle}
                  onDetailsOpen={(r) => dispatch({ type: 'OPEN_MODAL', repo: r })}
                />
              ))}
            </div>

            {displayedRepos.length === 0 && !ui.loading && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-center">
                <BookOpen size={64} className="mb-4 opacity-50" />
                <h3 className="text-xl font-semibold text-slate-600 mb-2">
                  {filters.view === 'bookmarks' ? 'No bookmarks yet' : 'No repositories found'}
                </h3>
                <p className="max-w-sm mx-auto">
                  {filters.view === 'bookmarks' 
                    ? 'Star repositories in the Discover tab to save them here.' 
                    : 'Try adjusting your search keywords or filters.'}
                </p>
              </div>
            )}
          </>
        )}
      </main>

      <RepositoryModal
        isOpen={ui.modalOpen}
        repository={ui.selectedRepo}
        noteText={ui.noteText}
        isSyncing={ui.syncing}
        onClose={() => dispatch({ type: 'CLOSE_MODAL' })}
        onNoteChange={(text) => dispatch({ type: 'UPDATE_NOTE', payload: text })}
        onNoteSave={handleNoteSave}
      />
    </div>
  );
}
