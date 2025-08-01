import { CommandCategory } from './commandDefinitions'

export interface SyntaxToken {
  text: string
  type: TokenType
  className: string
}

export type TokenType = 
  | 'slash-command'
  | 'system-command'
  | 'argument'
  | 'flag'
  | 'pipe'
  | 'operator'
  | 'string'
  | 'number'
  | 'path'
  | 'variable'
  | 'comment'
  | 'default'

export interface SyntaxHighlightResult {
  tokens: SyntaxToken[]
  category?: CommandCategory
  isValid: boolean
  suggestions?: string[]
}

// Token type to CSS class mapping
const TOKEN_CLASSES: Record<TokenType, string> = {
  'slash-command': 'text-purple-600 dark:text-purple-400 font-semibold',
  'system-command': 'text-blue-600 dark:text-blue-400 font-semibold',
  'argument': 'text-green-600 dark:text-green-400',
  'flag': 'text-orange-600 dark:text-orange-400',
  'pipe': 'text-yellow-600 dark:text-yellow-400 font-bold',
  'operator': 'text-red-600 dark:text-red-400 font-bold',
  'string': 'text-emerald-600 dark:text-emerald-400',
  'number': 'text-cyan-600 dark:text-cyan-400',
  'path': 'text-indigo-600 dark:text-indigo-400',
  'variable': 'text-pink-600 dark:text-pink-400',
  'comment': 'text-gray-500 dark:text-gray-400 italic',
  'default': 'text-gray-900 dark:text-gray-100'
}

// Command patterns for categorization
const COMMAND_PATTERNS: Record<CommandCategory, RegExp[]> = {
  system: [/^\/(?:help|clear|status|history|exit|version|config)/],
  agents: [/^\/(?:agents|agent|start-agent|chain)/],
  tasks: [/^\/(?:tasks|start-task|complete-task|task-status|test-task)/],
  projects: [/^\/(?:projects|create-project|select-project|project-status|init-project)/],
  filesystem: [/^(?:ls|pwd|cd|mkdir|rmdir|rm|cp|mv|cat|head|tail|touch|chmod|chown)/],
  search: [/^(?:grep|find|locate|which|awk|sed)/],
  text: [/^(?:echo|sort|uniq|wc|cut|tr|paste)/],
  network: [/^(?:ping|curl|wget|netstat|ss|nslookup|dig)/],
  process: [/^(?:ps|top|htop|kill|killall|jobs|nohup|bg|fg)/],
  git: [/^git\s+(?:status|add|commit|push|pull|log|branch|checkout|merge|diff|clone)/],
  development: [/^(?:npm|yarn|node|python|pip|ruby|gem|go|cargo|mvn|gradle)/],
  docker: [/^docker(?:-compose)?/],
  database: [/^(?:psql|mysql|redis-cli|mongo|sqlite3)/],
  monitoring: [/^(?:df|du|free|uptime|iostat|vmstat|sar|lsof)/]
}

// System operators and special characters
const OPERATORS = ['&&', '||', '|', '>', '>>', '<', '<<', ';', '&']
const FLAGS_PATTERN = /^-{1,2}[a-zA-Z][a-zA-Z0-9-]*/
const STRING_PATTERNS = [/"[^"]*"?/, /'[^']*'?/, /`[^`]*`?/]
const NUMBER_PATTERN = /^\d+(\.\d+)?$/
const PATH_PATTERN = /^[\.\/~][^\s]*/
const VARIABLE_PATTERN = /^\$[a-zA-Z_][a-zA-Z0-9_]*/

export const parseCommand = (command: string): SyntaxHighlightResult => {
  const tokens: SyntaxToken[] = []
  const trimmed = command.trim()
  
  if (!trimmed) {
    return { tokens: [], isValid: true }
  }

  // Tokenize the command
  const parts = tokenizeCommand(trimmed)
  let category: CommandCategory | undefined
  let isValid = true

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const token = analyzeToken(part, i)
    
    // Determine category from first token
    if (i === 0) {
      category = determineCategory(part)
      if (!category && !part.startsWith('/')) {
        isValid = false // Unknown command
      }
    }
    
    tokens.push(token)
  }

  return {
    tokens,
    category,
    isValid,
    suggestions: generateSuggestions(trimmed, category)
  }
}

const tokenizeCommand = (command: string): string[] => {
  const tokens: string[] = []
  let current = ''
  let inQuotes = false
  let quoteChar = ''
  
  for (let i = 0; i < command.length; i++) {
    const char = command[i]
    
    if (!inQuotes && (char === '"' || char === "'" || char === '`')) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      inQuotes = true
      quoteChar = char
      current = char
    } else if (inQuotes && char === quoteChar) {
      current += char
      tokens.push(current)
      current = ''
      inQuotes = false
      quoteChar = ''
    } else if (inQuotes) {
      current += char
    } else if (char === ' ' || char === '\t') {
      if (current) {
        tokens.push(current)
        current = ''
      }
    } else if (OPERATORS.some(op => command.slice(i).startsWith(op))) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      const operator = OPERATORS.find(op => command.slice(i).startsWith(op))!
      tokens.push(operator)
      i += operator.length - 1
    } else {
      current += char
    }
  }
  
  if (current) {
    tokens.push(current)
  }
  
  return tokens
}

const analyzeToken = (token: string, index: number): SyntaxToken => {
  let type: TokenType = 'default'
  
  // Slash commands
  if (token.startsWith('/')) {
    type = 'slash-command'
  }
  // System operators
  else if (OPERATORS.includes(token)) {
    type = token === '|' ? 'pipe' : 'operator'
  }
  // Flags (start with - or --)
  else if (FLAGS_PATTERN.test(token)) {
    type = 'flag'
  }
  // Strings (quoted)
  else if (STRING_PATTERNS.some(pattern => pattern.test(token))) {
    type = 'string'
  }
  // Numbers
  else if (NUMBER_PATTERN.test(token)) {
    type = 'number'
  }
  // Paths
  else if (PATH_PATTERN.test(token)) {
    type = 'path'
  }
  // Variables
  else if (VARIABLE_PATTERN.test(token)) {
    type = 'variable'
  }
  // Comments
  else if (token.startsWith('#')) {
    type = 'comment'
  }
  // System commands (first token, not slash command)
  else if (index === 0 && !token.startsWith('/')) {
    type = 'system-command'
  }
  // Arguments (everything else after first token)
  else if (index > 0) {
    type = 'argument'
  }
  
  return {
    text: token,
    type,
    className: TOKEN_CLASSES[type]
  }
}

const determineCategory = (firstToken: string): CommandCategory | undefined => {
  for (const [category, patterns] of Object.entries(COMMAND_PATTERNS)) {
    if (patterns.some(pattern => pattern.test(firstToken))) {
      return category as CommandCategory
    }
  }
  return undefined
}

const generateSuggestions = (command: string, category?: CommandCategory): string[] => {
  const suggestions: string[] = []
  
  if (command.startsWith('/')) {
    // Slash command suggestions
    if (command === '/') {
      suggestions.push('/help', '/status', '/agents', '/tasks', '/projects')
    }
  } else if (category) {
    // Category-specific suggestions
    switch (category) {
      case 'git':
        if (command === 'git') {
          suggestions.push('git status', 'git add .', 'git commit -m ""', 'git push')
        }
        break
      case 'docker':
        if (command === 'docker') {
          suggestions.push('docker ps', 'docker images', 'docker run', 'docker build .')
        }
        break
      case 'development':
        if (command === 'npm') {
          suggestions.push('npm install', 'npm start', 'npm test', 'npm run build')
        }
        break
    }
  }
  
  return suggestions
}

// Advanced syntax highlighting with error detection
export const highlightSyntax = (command: string): SyntaxHighlightResult => {
  return parseCommand(command)
}

// Get category color for visual feedback
export const getCategoryColor = (category: CommandCategory): string => {
  const colors: Record<CommandCategory, string> = {
    system: 'text-blue-500',
    agents: 'text-purple-500',
    tasks: 'text-green-500',
    projects: 'text-orange-500',
    filesystem: 'text-yellow-500',
    search: 'text-red-500',
    text: 'text-pink-500',
    network: 'text-cyan-500',
    process: 'text-indigo-500',
    git: 'text-emerald-500',
    development: 'text-violet-500',
    docker: 'text-sky-500',
    database: 'text-rose-500',
    monitoring: 'text-amber-500'
  }
  return colors[category] || 'text-gray-500'
}

// Get category icon emoji string
export const getCategoryIconEmoji = (category: CommandCategory): string => {
  const icons: Record<CommandCategory, string> = {
    system: '⚙️',
    agents: '🤖',
    tasks: '📋',
    projects: '📁',
    filesystem: '📂',
    search: '🔍',
    text: '📝',
    network: '🌐',
    process: '⚡',
    git: '🌿',
    development: '💻',
    docker: '🐳',
    database: '🗄️',
    monitoring: '📊'
  }
  return icons[category] || '💻'
}