import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';

// Theme types
const VALID_THEMES = ['light', 'dark'] as const;
type Theme = typeof VALID_THEMES[number];

const THEME_STORAGE_KEY = 'claude-cli-theme';

// Validate theme input
const isValidTheme = (theme: unknown): theme is Theme => {
  return typeof theme === 'string' && VALID_THEMES.includes(theme as Theme);
};

// Theme context
interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Theme Provider
export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>('dark');

  // Get initial theme
  useEffect(() => {
    // Check localStorage
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (isValidTheme(stored)) {
        setTheme(stored);
        return;
      }
    } catch {
      // localStorage unavailable
    }

    // Check system preference
    if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
      setTheme('light');
    }
  }, []);

  // Apply theme to DOM
  useEffect(() => {
    const root = document.documentElement;
    
    // Remove old theme class
    root.classList.remove('light', 'dark');
    
    // Add new theme class
    root.classList.add(theme);
    
    // Store preference
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Fail silently
    }
  }, [theme]);

  // Memoized toggle function
  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  // Memoized context value
  const value = useMemo(() => ({
    theme,
    toggleTheme
  }), [theme, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

// Hook to use theme
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};