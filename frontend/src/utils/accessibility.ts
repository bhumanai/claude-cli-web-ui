/**
 * Accessibility utilities and enhancements for Claude CLI Web UI
 * Provides WCAG 2.1 AA compliant features and screen reader support
 */

// ARIA live regions for dynamic content
export class AriaLiveRegion {
  private element: HTMLElement
  
  constructor(level: 'polite' | 'assertive' = 'polite') {
    this.element = document.createElement('div')
    this.element.setAttribute('aria-live', level)
    this.element.setAttribute('aria-atomic', 'true')
    this.element.className = 'sr-only'
    this.element.style.cssText = `
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      padding: 0 !important;
      margin: -1px !important;
      overflow: hidden !important;
      clip: rect(0, 0, 0, 0) !important;
      white-space: nowrap !important;
      border: 0 !important;
    `
    
    document.body.appendChild(this.element)
  }
  
  announce(message: string) {
    this.element.textContent = message
  }
  
  clear() {
    this.element.textContent = ''
  }
  
  destroy() {
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element)
    }
  }
}

// Keyboard navigation manager
export class KeyboardNavigationManager {
  private focusableElements: HTMLElement[] = []
  private currentIndex = -1
  private container: HTMLElement
  
  constructor(container: HTMLElement) {
    this.container = container
    this.updateFocusableElements()
  }
  
  updateFocusableElements() {
    const selectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]'
    ].join(', ')
    
    this.focusableElements = Array.from(
      this.container.querySelectorAll(selectors)
    ) as HTMLElement[]
    
    // Sort by tab index
    this.focusableElements.sort((a, b) => {
      const aIndex = parseInt(a.getAttribute('tabindex') || '0')
      const bIndex = parseInt(b.getAttribute('tabindex') || '0')
      return aIndex - bIndex
    })
  }
  
  focusNext() {
    this.updateFocusableElements()
    this.currentIndex = (this.currentIndex + 1) % this.focusableElements.length
    this.focusableElements[this.currentIndex]?.focus()
  }
  
  focusPrevious() {
    this.updateFocusableElements()
    this.currentIndex = this.currentIndex <= 0 
      ? this.focusableElements.length - 1 
      : this.currentIndex - 1
    this.focusableElements[this.currentIndex]?.focus()
  }
  
  focusFirst() {
    this.updateFocusableElements()
    this.currentIndex = 0
    this.focusableElements[0]?.focus()
  }
  
  focusLast() {
    this.updateFocusableElements()
    this.currentIndex = this.focusableElements.length - 1
    this.focusableElements[this.currentIndex]?.focus()
  }
}

// Focus management utilities
export const focusUtils = {
  trap: (container: HTMLElement) => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusableElements = container.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) as NodeListOf<HTMLElement>
        
        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]
        
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault()
            lastElement.focus()
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault()
            firstElement.focus()
          }
        }
      }
    }
    
    container.addEventListener('keydown', handleKeyDown)
    return () => container.removeEventListener('keydown', handleKeyDown)
  },
  
  restore: (() => {
    let previouslyFocused: HTMLElement | null = null
    
    return {
      save: () => {
        previouslyFocused = document.activeElement as HTMLElement
      },
      restore: () => {
        if (previouslyFocused) {
          previouslyFocused.focus()
          previouslyFocused = null
        }
      }
    }
  })(),
  
  isVisible: (element: HTMLElement): boolean => {
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }
}

// Screen reader utilities
export const screenReader = {
  announce: (() => {
    const liveRegion = new AriaLiveRegion('polite')
    const assertiveRegion = new AriaLiveRegion('assertive')
    
    return {
      polite: (message: string) => liveRegion.announce(message),
      assertive: (message: string) => assertiveRegion.announce(message),
      clear: () => {
        liveRegion.clear()
        assertiveRegion.clear()
      }
    }
  })(),
  
  describeElement: (element: HTMLElement, description: string) => {
    element.setAttribute('aria-describedby', 
      element.getAttribute('aria-describedby') + ' ' + description
    )
  },
  
  labelElement: (element: HTMLElement, label: string) => {
    element.setAttribute('aria-label', label)
  }
}

// Color contrast utilities
export const colorContrast = {
  // Calculate relative luminance
  getLuminance: (color: string): number => {
    const rgb = colorContrast.hexToRgb(color)
    if (!rgb) return 0
    
    const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(c => {
      c = c / 255
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    })
    
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  },
  
  // Calculate contrast ratio between two colors
  getContrastRatio: (color1: string, color2: string): number => {
    const lum1 = colorContrast.getLuminance(color1)
    const lum2 = colorContrast.getLuminance(color2)
    const brightest = Math.max(lum1, lum2)
    const darkest = Math.min(lum1, lum2)
    
    return (brightest + 0.05) / (darkest + 0.05)
  },
  
  // Check if contrast meets WCAG AA standards
  meetsWCAG: (color1: string, color2: string, level: 'AA' | 'AAA' = 'AA'): boolean => {
    const ratio = colorContrast.getContrastRatio(color1, color2)
    return level === 'AA' ? ratio >= 4.5 : ratio >= 7
  },
  
  // Convert hex to RGB
  hexToRgb: (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null
  }
}

// Reduced motion preferences
export const motionPreferences = {
  prefersReducedMotion: (): boolean => {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  },
  
  respectMotionPreference: (element: HTMLElement, animationClass: string) => {
    if (!motionPreferences.prefersReducedMotion()) {
      element.classList.add(animationClass)
    }
  }
}

// High contrast mode detection
export const highContrast = {
  isEnabled: (): boolean => {
    return window.matchMedia('(prefers-contrast: high)').matches
  },
  
  applyHighContrastStyles: (element: HTMLElement) => {
    if (highContrast.isEnabled()) {
      element.classList.add('high-contrast')
    }
  }
}

// Font size and zoom preferences
export const textPreferences = {
  getFontScale: (): number => {
    const testElement = document.createElement('div')
    testElement.style.cssText = 'width: 1rem; height: 1rem; position: absolute; visibility: hidden;'
    document.body.appendChild(testElement)
    
    const remSize = testElement.offsetWidth
    document.body.removeChild(testElement)
    
    return remSize / 16 // Default browser font size is 16px
  },
  
  adjustForScale: (baseSize: number): number => {
    const scale = textPreferences.getFontScale()
    return baseSize * scale
  }
}

// Skip links for keyboard navigation
export const skipLinks = {
  create: (links: Array<{ href: string; text: string }>) => {
    const skipContainer = document.createElement('div')
    skipContainer.className = 'skip-links'
    skipContainer.style.cssText = `
      position: absolute;
      top: -40px;
      left: 6px;
      background: #000;
      color: #fff;
      padding: 8px;
      z-index: 1000;
      text-decoration: none;
      border-radius: 4px;
    `
    
    links.forEach(link => {
      const skipLink = document.createElement('a')
      skipLink.href = link.href
      skipLink.textContent = link.text
      skipLink.style.cssText = `
        display: block;
        color: #fff;
        text-decoration: none;
        padding: 4px 0;
      `
      
      skipLink.addEventListener('focus', () => {
        skipContainer.style.top = '6px'
      })
      
      skipLink.addEventListener('blur', () => {
        skipContainer.style.top = '-40px'
      })
      
      skipContainer.appendChild(skipLink)
    })
    
    document.body.insertBefore(skipContainer, document.body.firstChild)
    return skipContainer
  }
}

// ARIA utilities for complex widgets
export const ariaUtils = {
  // Combobox/autocomplete support
  combobox: {
    setup: (input: HTMLInputElement, listbox: HTMLElement) => {
      const listboxId = listbox.id || `listbox-${Date.now()}`
      listbox.id = listboxId
      
      input.setAttribute('role', 'combobox')
      input.setAttribute('aria-expanded', 'false')
      input.setAttribute('aria-controls', listboxId)
      input.setAttribute('aria-autocomplete', 'list')
      
      listbox.setAttribute('role', 'listbox')
    },
    
    updateExpanded: (input: HTMLInputElement, expanded: boolean) => {
      input.setAttribute('aria-expanded', expanded.toString())
    },
    
    setActiveDescendant: (input: HTMLInputElement, activeId: string | null) => {
      if (activeId) {
        input.setAttribute('aria-activedescendant', activeId)
      } else {
        input.removeAttribute('aria-activedescendant')
      }
    }
  },
  
  // Tab panel support
  tabs: {
    setup: (tabList: HTMLElement, tabs: HTMLElement[], panels: HTMLElement[]) => {
      tabList.setAttribute('role', 'tablist')
      
      tabs.forEach((tab, index) => {
        const tabId = tab.id || `tab-${index}`
        const panelId = panels[index]?.id || `panel-${index}`
        
        tab.id = tabId
        tab.setAttribute('role', 'tab')
        tab.setAttribute('aria-controls', panelId)
        tab.setAttribute('tabindex', index === 0 ? '0' : '-1')
        
        if (panels[index]) {
          panels[index].id = panelId
          panels[index].setAttribute('role', 'tabpanel')
          panels[index].setAttribute('aria-labelledby', tabId)
        }
      })
    },
    
    selectTab: (tabs: HTMLElement[], panels: HTMLElement[], selectedIndex: number) => {
      tabs.forEach((tab, index) => {
        const isSelected = index === selectedIndex
        tab.setAttribute('aria-selected', isSelected.toString())
        tab.setAttribute('tabindex', isSelected ? '0' : '-1')
        
        if (panels[index]) {
          panels[index].hidden = !isSelected
        }
      })
    }
  },
  
  // Progress indicator support
  progress: {
    setup: (element: HTMLElement, min = 0, max = 100) => {
      element.setAttribute('role', 'progressbar')
      element.setAttribute('aria-valuemin', min.toString())
      element.setAttribute('aria-valuemax', max.toString())
    },
    
    update: (element: HTMLElement, value: number, label?: string) => {
      element.setAttribute('aria-valuenow', value.toString())
      if (label) {
        element.setAttribute('aria-valuetext', label)
      }
    }
  }
}

// Accessibility testing utilities
export const a11yTesting = {
  // Check for missing alt text
  checkImages: (): HTMLImageElement[] => {
    return Array.from(document.querySelectorAll('img:not([alt])'))
  },
  
  // Check for missing form labels
  checkFormLabels: (): HTMLInputElement[] => {
    return Array.from(document.querySelectorAll('input:not([aria-label]):not([aria-labelledby])'))
      .filter(input => !document.querySelector(`label[for="${input.id}"]`)) as HTMLInputElement[]
  },
  
  // Check heading hierarchy
  checkHeadingHierarchy: (): Array<{ element: HTMLElement; issue: string }> => {
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    const issues: Array<{ element: HTMLElement; issue: string }> = []
    let previousLevel = 0
    
    headings.forEach(heading => {
      const level = parseInt(heading.tagName.charAt(1))
      
      if (level > previousLevel + 1) {
        issues.push({
          element: heading as HTMLElement,
          issue: `Heading level ${level} follows level ${previousLevel}, skipping levels`
        })
      }
      
      previousLevel = level
    })
    
    return issues
  },
  
  // Check color contrast
  checkContrast: (): Array<{ element: HTMLElement; ratio: number; passes: boolean }> => {
    const results: Array<{ element: HTMLElement; ratio: number; passes: boolean }> = []
    const textElements = document.querySelectorAll('p, span, div, a, button, h1, h2, h3, h4, h5, h6')
    
    textElements.forEach(element => {
      const styles = window.getComputedStyle(element as HTMLElement)
      const color = styles.color
      const backgroundColor = styles.backgroundColor
      
      if (color && backgroundColor && backgroundColor !== 'rgba(0, 0, 0, 0)') {
        const ratio = colorContrast.getContrastRatio(color, backgroundColor)
        results.push({
          element: element as HTMLElement,
          ratio,
          passes: ratio >= 4.5
        })
      }
    })
    
    return results
  }
}

// Global accessibility manager
export class AccessibilityManager {
  private liveRegions: AriaLiveRegion[] = []
  private keyboardManagers: KeyboardNavigationManager[] = []
  private skipLinksContainer: HTMLElement | null = null
  
  constructor() {
    this.init()
  }
  
  private init() {
    // Skip links disabled for cleaner UI
    // Uncomment to re-enable accessibility skip links
    // this.skipLinksContainer = skipLinks.create([
    //   { href: '#main-content', text: 'Skip to main content' },
    //   { href: '#navigation', text: 'Skip to navigation' },
    //   { href: '#footer', text: 'Skip to footer' }
    // ])
    
    // Monitor for accessibility issues in development
    if (process.env.NODE_ENV === 'development') {
      this.enableA11yMonitoring()
    }
  }
  
  private enableA11yMonitoring() {
    // Check for common accessibility issues every 5 seconds
    setInterval(() => {
      const issues = {
        missingAltText: a11yTesting.checkImages(),
        missingLabels: a11yTesting.checkFormLabels(),
        headingIssues: a11yTesting.checkHeadingHierarchy(),
        contrastIssues: a11yTesting.checkContrast().filter(r => !r.passes)
      }
      
      if (Object.values(issues).some(arr => arr.length > 0)) {
        console.warn('Accessibility issues detected:', issues)
      }
    }, 5000)
  }
  
  createLiveRegion(level: 'polite' | 'assertive' = 'polite') {
    const region = new AriaLiveRegion(level)
    this.liveRegions.push(region)
    return region
  }
  
  createKeyboardManager(container: HTMLElement) {
    const manager = new KeyboardNavigationManager(container)
    this.keyboardManagers.push(manager)
    return manager
  }
  
  cleanup() {
    this.liveRegions.forEach(region => region.destroy())
    this.liveRegions = []
    this.keyboardManagers = []
    
    if (this.skipLinksContainer && this.skipLinksContainer.parentNode) {
      this.skipLinksContainer.parentNode.removeChild(this.skipLinksContainer)
    }
  }
}

// Export singleton instance
export const accessibilityManager = new AccessibilityManager()