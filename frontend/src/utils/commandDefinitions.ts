import { CommandSuggestion } from '@/types'

export interface CommandDefinition extends CommandSuggestion {
  command: string
  description: string
  category: CommandCategory
  aliases?: string[]
  args?: string[]
  examples?: string[]
}

export type CommandCategory = 
  | 'system'
  | 'agents' 
  | 'tasks'
  | 'projects'
  | 'filesystem'
  | 'search'
  | 'text'
  | 'network'
  | 'process'
  | 'git'
  | 'development'
  | 'docker'
  | 'database'
  | 'monitoring'

export const COMMAND_DEFINITIONS: CommandDefinition[] = [
  // System & Core Commands
  {
    command: '/help',
    description: 'Show available commands and usage help',
    category: 'system',
    aliases: ['/h', '/?'],
    examples: ['/help', '/help tasks']
  },
  {
    command: '/clear',
    description: 'Clear terminal output and history',
    category: 'system',
    aliases: ['/cls'],
    examples: ['/clear']
  },
  {
    command: '/status',
    description: 'Show system status and connection info',
    category: 'system',
    examples: ['/status']
  },
  {
    command: '/history',
    description: 'Show command history',
    category: 'system',
    aliases: ['/hist'],
    examples: ['/history', '/history --limit 10']
  },
  {
    command: '/exit',
    description: 'Exit the current session',
    category: 'system',
    aliases: ['/quit', '/q'],
    examples: ['/exit']
  },
  {
    command: '/version',
    description: 'Show Claude CLI version information',
    category: 'system',
    aliases: ['/v'],
    examples: ['/version']
  },
  {
    command: '/config',
    description: 'View or modify configuration settings',
    category: 'system',
    examples: ['/config', '/config set theme dark']
  },

  // Agent Commands
  {
    command: '/agents',
    description: 'List all available AI agents',
    category: 'agents',
    aliases: ['/agent-list'],
    examples: ['/agents', '/agents --category development']
  },
  {
    command: '/agent',
    description: 'Execute command with specific agent',
    category: 'agents',
    args: ['agent_name', 'command'],
    examples: ['/agent python-pro "optimize this code"', '/agent frontend-developer "create login form"']
  },
  {
    command: '/start-agent',
    description: 'Start an interactive session with an agent',
    category: 'agents',
    args: ['agent_name'],
    examples: ['/start-agent backend-architect', '/start-agent security-auditor']
  },
  {
    command: '/chain',
    description: 'Execute multi-agent workflow chain',
    category: 'agents',
    args: ['chain_name'],
    examples: ['/chain smart-task', '/chain security-review']
  },

  // Task Management
  {
    command: '/tasks',
    description: 'List all tasks and their status',
    category: 'tasks',
    aliases: ['/task-list'],
    examples: ['/tasks', '/tasks --status pending']
  },
  {
    command: '/start-task',
    description: 'Create and start a new task',
    category: 'tasks',
    args: ['task_name', 'description?'],
    examples: ['/start-task "Implement user auth"', '/start-task "Bug fix" "Fix login issues"']
  },
  {
    command: '/complete-task',
    description: 'Mark a task as completed',
    category: 'tasks',
    args: ['task_id'],
    examples: ['/complete-task 123', '/complete-task auth-task']
  },
  {
    command: '/task-status',
    description: 'Show detailed task status',
    category: 'tasks',
    args: ['task_id'],
    examples: ['/task-status 123']
  },
  {
    command: '/test-task',
    description: 'Run adversarial testing on task',
    category: 'tasks',
    args: ['task_id'],
    examples: ['/test-task 123']
  },

  // Project Management
  {
    command: '/projects',
    description: 'List all projects',
    category: 'projects',
    aliases: ['/project-list'],
    examples: ['/projects', '/projects --recent']
  },
  {
    command: '/create-project',
    description: 'Create a new project',
    category: 'projects',
    args: ['name', 'path'],
    examples: ['/create-project "My App" ./my-app']
  },
  {
    command: '/select-project',
    description: 'Switch to a different project',
    category: 'projects',
    args: ['project_id'],
    examples: ['/select-project my-app']
  },
  {
    command: '/project-status',
    description: 'Show current project status',
    category: 'projects',
    examples: ['/project-status']
  },
  {
    command: '/init-project',
    description: 'Initialize project documentation',
    category: 'projects',
    examples: ['/init-project']
  },

  // Filesystem Commands
  {
    command: 'ls',
    description: 'List directory contents',
    category: 'filesystem',
    aliases: ['dir'],
    args: ['path?'],
    examples: ['ls', 'ls -la', 'ls /home/user']
  },
  {
    command: 'pwd',
    description: 'Print current working directory',
    category: 'filesystem',
    examples: ['pwd']
  },
  {
    command: 'cd',
    description: 'Change directory',
    category: 'filesystem',
    args: ['path'],
    examples: ['cd /home/user', 'cd ..', 'cd ~']
  },
  {
    command: 'mkdir',
    description: 'Create directory',
    category: 'filesystem',
    args: ['directory_name'],
    examples: ['mkdir new-folder', 'mkdir -p path/to/folder']
  },
  {
    command: 'rmdir',
    description: 'Remove empty directory',
    category: 'filesystem',
    args: ['directory_name'],
    examples: ['rmdir old-folder']
  },
  {
    command: 'rm',
    description: 'Remove files or directories',
    category: 'filesystem',
    args: ['file_or_directory'],
    examples: ['rm file.txt', 'rm -rf folder/']
  },
  {
    command: 'cp',
    description: 'Copy files or directories',
    category: 'filesystem',
    args: ['source', 'destination'],
    examples: ['cp file.txt backup.txt', 'cp -r folder/ backup/']
  },
  {
    command: 'mv',
    description: 'Move or rename files',
    category: 'filesystem',
    args: ['source', 'destination'],
    examples: ['mv old.txt new.txt', 'mv file.txt folder/']
  },
  {
    command: 'cat',
    description: 'Display file contents',
    category: 'filesystem',
    args: ['file'],
    examples: ['cat file.txt', 'cat *.log']
  },
  {
    command: 'head',
    description: 'Display first lines of file',
    category: 'filesystem',
    args: ['file'],
    examples: ['head file.txt', 'head -n 20 log.txt']
  },
  {
    command: 'tail',
    description: 'Display last lines of file',
    category: 'filesystem',
    args: ['file'],
    examples: ['tail file.txt', 'tail -f log.txt']
  },
  {
    command: 'touch',
    description: 'Create empty file or update timestamp',
    category: 'filesystem',
    args: ['file'],
    examples: ['touch newfile.txt']
  },

  // Search Commands
  {
    command: 'grep',
    description: 'Search text patterns in files',
    category: 'search',
    args: ['pattern', 'file?'],
    examples: ['grep "error" log.txt', 'grep -r "TODO" src/']
  },
  {
    command: 'find',
    description: 'Find files and directories',
    category: 'search',
    args: ['path', 'criteria'],
    examples: ['find . -name "*.js"', 'find /home -type f -size +1M']
  },
  {
    command: 'locate',
    description: 'Find files using database',
    category: 'search',
    args: ['pattern'],
    examples: ['locate nginx.conf']
  },
  {
    command: 'which',
    description: 'Locate command executable',
    category: 'search',
    args: ['command'],
    examples: ['which python', 'which node']
  },

  // Text Processing
  {
    command: 'echo',
    description: 'Display text',
    category: 'text',
    args: ['text'],
    examples: ['echo "Hello World"', 'echo $PATH']
  },
  {
    command: 'sort',
    description: 'Sort lines in text files',
    category: 'text',
    args: ['file?'],
    examples: ['sort file.txt', 'sort -r names.txt']
  },
  {
    command: 'uniq',
    description: 'Remove duplicate lines',
    category: 'text',
    args: ['file?'],
    examples: ['uniq file.txt', 'sort file.txt | uniq']
  },
  {
    command: 'wc',
    description: 'Count lines, words, characters',
    category: 'text',
    args: ['file?'],
    examples: ['wc file.txt', 'wc -l *.txt']
  },
  {
    command: 'sed',
    description: 'Stream editor for text manipulation',
    category: 'text',
    args: ['expression', 'file?'],
    examples: ['sed "s/old/new/g" file.txt']
  },
  {
    command: 'awk',
    description: 'Text processing and data extraction',
    category: 'text',
    args: ['program', 'file?'],
    examples: ['awk "{print $1}" file.txt']
  },

  // Process Management
  {
    command: 'ps',
    description: 'List running processes',
    category: 'process',
    examples: ['ps', 'ps aux', 'ps -ef']
  },
  {
    command: 'top',
    description: 'Display and update running processes',
    category: 'process',
    examples: ['top', 'top -p 1234']
  },
  {
    command: 'htop',
    description: 'Interactive process viewer',
    category: 'process',
    examples: ['htop']
  },
  {
    command: 'kill',
    description: 'Terminate processes',
    category: 'process',
    args: ['pid'],
    examples: ['kill 1234', 'kill -9 1234']
  },
  {
    command: 'killall',
    description: 'Kill processes by name',
    category: 'process',
    args: ['process_name'],
    examples: ['killall firefox', 'killall -9 chrome']
  },
  {
    command: 'jobs',
    description: 'List active jobs',
    category: 'process',
    examples: ['jobs']
  },
  {
    command: 'nohup',
    description: 'Run commands immune to hangups',
    category: 'process',
    args: ['command'],
    examples: ['nohup long-running-task &']
  },

  // Network Commands
  {
    command: 'ping',
    description: 'Send ICMP echo requests',
    category: 'network',
    args: ['host'],
    examples: ['ping google.com', 'ping -c 4 192.168.1.1']
  },
  {
    command: 'curl',
    description: 'Transfer data from servers',
    category: 'network',
    args: ['url'],
    examples: ['curl https://api.example.com', 'curl -X POST -d "data" url']
  },
  {
    command: 'wget',
    description: 'Download files from web',
    category: 'network',
    args: ['url'],
    examples: ['wget https://example.com/file.zip']
  },
  {
    command: 'netstat',
    description: 'Display network connections',
    category: 'network',
    examples: ['netstat -tlnp', 'netstat -r']
  },
  {
    command: 'ss',
    description: 'Modern netstat replacement',
    category: 'network',
    examples: ['ss -tlnp', 'ss -o state established']
  },

  // Git Commands
  {
    command: 'git status',
    description: 'Show working tree status',
    category: 'git',
    examples: ['git status', 'git status --short']
  },
  {
    command: 'git add',
    description: 'Add files to staging area',
    category: 'git',
    args: ['file'],
    examples: ['git add .', 'git add file.txt']
  },
  {
    command: 'git commit',
    description: 'Record changes to repository',
    category: 'git',
    args: ['message'],
    examples: ['git commit -m "Add feature"', 'git commit -am "Fix bug"']
  },
  {
    command: 'git push',
    description: 'Upload local changes to remote',
    category: 'git',
    examples: ['git push', 'git push origin main']
  },
  {
    command: 'git pull',
    description: 'Download remote changes',
    category: 'git',
    examples: ['git pull', 'git pull origin main']
  },
  {
    command: 'git log',
    description: 'Show commit history',
    category: 'git',
    examples: ['git log', 'git log --oneline', 'git log --graph']
  },
  {
    command: 'git branch',
    description: 'List, create, or delete branches',
    category: 'git',
    examples: ['git branch', 'git branch feature', 'git branch -d old-branch']
  },
  {
    command: 'git checkout',
    description: 'Switch branches or restore files',
    category: 'git',
    args: ['branch_or_file'],
    examples: ['git checkout main', 'git checkout -b feature']
  },

  // Development Commands
  {
    command: 'npm install',
    description: 'Install npm dependencies',
    category: 'development',
    aliases: ['npm i'],
    examples: ['npm install', 'npm install express']
  },
  {
    command: 'npm start',
    description: 'Start application',
    category: 'development',
    examples: ['npm start']
  },
  {
    command: 'npm test',
    description: 'Run tests',
    category: 'development',
    aliases: ['npm t'],
    examples: ['npm test', 'npm test -- --watch']
  },
  {
    command: 'npm run',
    description: 'Run npm script',
    category: 'development',
    args: ['script'],
    examples: ['npm run build', 'npm run dev']
  },
  {
    command: 'yarn',
    description: 'Yarn package manager',
    category: 'development',
    examples: ['yarn', 'yarn add express', 'yarn dev']
  },
  {
    command: 'python',
    description: 'Run Python interpreter',
    category: 'development',
    aliases: ['python3', 'py'],
    examples: ['python script.py', 'python -m pip install requests']
  },
  {
    command: 'node',
    description: 'Run Node.js',
    category: 'development',
    examples: ['node app.js', 'node --version']
  },

  // Docker Commands
  {
    command: 'docker ps',
    description: 'List running containers',
    category: 'docker',
    examples: ['docker ps', 'docker ps -a']
  },
  {
    command: 'docker images',
    description: 'List Docker images',
    category: 'docker',
    examples: ['docker images', 'docker images --filter dangling=true']
  },
  {
    command: 'docker run',
    description: 'Run container from image',
    category: 'docker',
    args: ['image'],
    examples: ['docker run nginx', 'docker run -p 8080:80 nginx']
  },
  {
    command: 'docker build',
    description: 'Build image from Dockerfile',
    category: 'docker',
    args: ['path'],
    examples: ['docker build .', 'docker build -t myapp .']
  },
  {
    command: 'docker-compose',
    description: 'Multi-container application management',
    category: 'docker',
    examples: ['docker-compose up', 'docker-compose down']
  },

  // Database Commands
  {
    command: 'psql',
    description: 'PostgreSQL interactive terminal',
    category: 'database',
    examples: ['psql -d mydb', 'psql -U user -h localhost']
  },
  {
    command: 'mysql',
    description: 'MySQL client',
    category: 'database',
    examples: ['mysql -u root -p', 'mysql -h localhost mydb']
  },
  {
    command: 'redis-cli',
    description: 'Redis command line interface',
    category: 'database',
    examples: ['redis-cli', 'redis-cli ping']
  },

  // Monitoring Commands
  {
    command: 'df',
    description: 'Display filesystem disk space usage',
    category: 'monitoring',
    examples: ['df -h', 'df -i']
  },
  {
    command: 'du',
    description: 'Display directory space usage',
    category: 'monitoring',
    examples: ['du -sh *', 'du -h --max-depth=1']
  },
  {
    command: 'free',
    description: 'Display memory usage',
    category: 'monitoring',
    examples: ['free -h', 'free -m']
  },
  {
    command: 'uptime',
    description: 'Show system uptime and load',
    category: 'monitoring',
    examples: ['uptime']
  },
  {
    command: 'iostat',
    description: 'Display I/O statistics',
    category: 'monitoring',
    examples: ['iostat', 'iostat -x 1']
  }
]

// Fuzzy search implementation
export const fuzzySearch = (query: string, commands: CommandDefinition[], maxResults: number = 10): CommandDefinition[] => {
  if (!query.trim()) return []
  
  const queryLower = query.toLowerCase()
  const scored = commands.map(cmd => {
    let score = 0
    const commandLower = cmd.command.toLowerCase()
    const descriptionLower = cmd.description.toLowerCase()
    
    // Exact matches get highest score
    if (commandLower === queryLower) score += 100
    else if (commandLower.startsWith(queryLower)) score += 80
    else if (commandLower.includes(queryLower)) score += 60
    
    // Description matches
    if (descriptionLower.includes(queryLower)) score += 40
    
    // Category matches
    if (cmd.category.toLowerCase().includes(queryLower)) score += 30
    
    // Alias matches
    if (cmd.aliases) {
      for (const alias of cmd.aliases) {
        if (alias.toLowerCase().includes(queryLower)) {
          score += 50
          break
        }
      }
    }
    
    // Fuzzy character matching
    let fuzzyScore = 0
    let queryIndex = 0
    for (let i = 0; i < commandLower.length && queryIndex < queryLower.length; i++) {
      if (commandLower[i] === queryLower[queryIndex]) {
        fuzzyScore += 1
        queryIndex++
      }
    }
    if (queryIndex === queryLower.length) {
      score += fuzzyScore * 2
    }
    
    return { command: cmd, score }
  })
  
  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(item => item.command)
}

// Get commands by category
export const getCommandsByCategory = (category: CommandCategory): CommandDefinition[] => {
  return COMMAND_DEFINITIONS.filter(cmd => cmd.category === category)
}

// Get all categories
export const getAllCategories = (): CommandCategory[] => {
  return Array.from(new Set(COMMAND_DEFINITIONS.map(cmd => cmd.category)))
}