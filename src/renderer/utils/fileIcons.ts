// File icon mapping using Codicons (VS Code style icons)
// These correspond to the codicon font which provides consistent file type icons

export interface FileIconInfo {
  icon: string;
  color: string;
  className?: string;
}

// Color palette for file types
const colors = {
  // Languages
  typescript: '#007ACC',
  javascript: '#F7DF1E', 
  react: '#61DAFB',
  vue: '#4FC08D',
  python: '#3776AB',
  java: '#ED8B00',
  csharp: '#239120',
  php: '#777BB4',
  ruby: '#CC342D',
  go: '#00ADD8',
  rust: '#DEA584',
  swift: '#FA7343',
  kotlin: '#7F52FF',
  dart: '#0175C2',
  
  // Web
  html: '#E34F26',
  css: '#1572B6',
  scss: '#CF649A',
  
  // Data/Config
  json: '#F7DF1E',
  yaml: '#CB171E',
  xml: '#005C99',
  toml: '#9C4221',
  
  // Documentation
  markdown: '#083FA1',
  text: '#6A9955',
  
  // Database
  sql: '#336791',
  
  // Images
  image: '#8B5CF6',
  
  // Archives
  archive: '#9CA3AF',
  
  // Default
  folder: '#FBBF24',
  file: '#9CA3AF',
  executable: '#F59E0B',
  config: '#EC4899',
  license: '#10B981',
  readme: '#3B82F6',
  git: '#F97316',
  docker: '#2496ED',
  npm: '#CB3837',
  log: '#6B7280'
};

const getFileIconInfo = (fileName: string, isFolder: boolean = false): FileIconInfo => {
  if (isFolder) {
    return {
      icon: 'folder',
      color: colors.folder,
      className: 'codicon-folder'
    };
  }

  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const baseName = fileName.toLowerCase();
  
  // Special files (by exact name)
  const specialFiles: Record<string, FileIconInfo> = {
    // Package managers
    'package.json': { icon: 'json', color: colors.npm, className: 'codicon-json' },
    'package-lock.json': { icon: 'json', color: colors.npm, className: 'codicon-json' },
    'yarn.lock': { icon: 'file-code', color: colors.npm, className: 'codicon-file-code' },
    'composer.json': { icon: 'json', color: '#8892BF', className: 'codicon-json' },
    'cargo.toml': { icon: 'file-code', color: colors.rust, className: 'codicon-file-code' },
    'go.mod': { icon: 'file-code', color: colors.go, className: 'codicon-file-code' },
    'requirements.txt': { icon: 'file-text', color: colors.python, className: 'codicon-file-text' },
    'gemfile': { icon: 'file-code', color: colors.ruby, className: 'codicon-file-code' },
    'pipfile': { icon: 'file-code', color: colors.python, className: 'codicon-file-code' },
    'poetry.lock': { icon: 'file-code', color: colors.python, className: 'codicon-file-code' },
    
    // Build tools
    'makefile': { icon: 'tools', color: colors.config, className: 'codicon-tools' },
    'cmake': { icon: 'tools', color: colors.config, className: 'codicon-tools' },
    'cmakelists.txt': { icon: 'tools', color: colors.config, className: 'codicon-tools' },
    'build.gradle': { icon: 'file-code', color: colors.java, className: 'codicon-file-code' },
    'pom.xml': { icon: 'file-code', color: colors.java, className: 'codicon-file-code' },
    
    // Documentation
    'readme.md': { icon: 'book', color: colors.readme, className: 'codicon-book' },
    'readme.txt': { icon: 'book', color: colors.readme, className: 'codicon-book' },
    'readme': { icon: 'book', color: colors.readme, className: 'codicon-book' },
    'changelog.md': { icon: 'file-text', color: colors.markdown, className: 'codicon-file-text' },
    'changelog': { icon: 'file-text', color: colors.markdown, className: 'codicon-file-text' },
    'license': { icon: 'law', color: colors.license, className: 'codicon-law' },
    'license.txt': { icon: 'law', color: colors.license, className: 'codicon-law' },
    'license.md': { icon: 'law', color: colors.license, className: 'codicon-law' },
    
    // Git
    '.gitignore': { icon: 'source-control', color: colors.git, className: 'codicon-source-control' },
    '.gitattributes': { icon: 'source-control', color: colors.git, className: 'codicon-source-control' },
    '.gitmodules': { icon: 'source-control', color: colors.git, className: 'codicon-source-control' },
    
    // Environment
    '.env': { icon: 'settings-gear', color: colors.config, className: 'codicon-settings-gear' },
    '.env.example': { icon: 'settings-gear', color: colors.config, className: 'codicon-settings-gear' },
    '.env.local': { icon: 'settings-gear', color: colors.config, className: 'codicon-settings-gear' },
    '.env.development': { icon: 'settings-gear', color: colors.config, className: 'codicon-settings-gear' },
    '.env.production': { icon: 'settings-gear', color: colors.config, className: 'codicon-settings-gear' },
    
    // Docker
    'dockerfile': { icon: 'file-code', color: colors.docker, className: 'codicon-file-code' },
    'dockerfile.dev': { icon: 'file-code', color: colors.docker, className: 'codicon-file-code' },
    'dockerfile.prod': { icon: 'file-code', color: colors.docker, className: 'codicon-file-code' },
    'docker-compose.yml': { icon: 'file-code', color: colors.docker, className: 'codicon-file-code' },
    'docker-compose.yaml': { icon: 'file-code', color: colors.docker, className: 'codicon-file-code' },
    
    // Config files
    'tsconfig.json': { icon: 'json', color: colors.typescript, className: 'codicon-json' },
    'jsconfig.json': { icon: 'json', color: colors.javascript, className: 'codicon-json' },
    'webpack.config.js': { icon: 'settings-gear', color: '#8DD6F9', className: 'codicon-settings-gear' },
    'vite.config.js': { icon: 'settings-gear', color: '#646CFF', className: 'codicon-settings-gear' },
    'vite.config.ts': { icon: 'settings-gear', color: '#646CFF', className: 'codicon-settings-gear' },
    'tailwind.config.js': { icon: 'settings-gear', color: '#06B6D4', className: 'codicon-settings-gear' },
    'postcss.config.js': { icon: 'settings-gear', color: colors.css, className: 'codicon-settings-gear' },
    '.babelrc': { icon: 'json', color: '#F9DC3E', className: 'codicon-json' },
    'babel.config.js': { icon: 'settings-gear', color: '#F9DC3E', className: 'codicon-settings-gear' },
    '.eslintrc.js': { icon: 'settings-gear', color: '#4B32C3', className: 'codicon-settings-gear' },
    '.eslintrc.json': { icon: 'json', color: '#4B32C3', className: 'codicon-json' },
    '.prettierrc': { icon: 'json', color: '#F7B93E', className: 'codicon-json' },
    'prettier.config.js': { icon: 'settings-gear', color: '#F7B93E', className: 'codicon-settings-gear' },
  };

  // Check for special files first
  if (specialFiles[baseName]) {
    return specialFiles[baseName];
  }

  // Check for files that start with dots (hidden files)
  if (baseName.startsWith('.') && baseName.includes('.')) {
    return { icon: 'settings-gear', color: colors.config, className: 'codicon-settings-gear' };
  }

  // Extension-based mapping
  const extensionMap: Record<string, FileIconInfo> = {
    // Programming Languages
    'ts': { icon: 'file-code', color: colors.typescript, className: 'codicon-file-code' },
    'tsx': { icon: 'file-code', color: colors.react, className: 'codicon-file-code' },
    'js': { icon: 'file-code', color: colors.javascript, className: 'codicon-file-code' },
    'jsx': { icon: 'file-code', color: colors.react, className: 'codicon-file-code' },
    'mjs': { icon: 'file-code', color: colors.javascript, className: 'codicon-file-code' },
    'vue': { icon: 'file-code', color: colors.vue, className: 'codicon-file-code' },
    'svelte': { icon: 'file-code', color: '#FF3E00', className: 'codicon-file-code' },
    'py': { icon: 'file-code', color: colors.python, className: 'codicon-file-code' },
    'java': { icon: 'file-code', color: colors.java, className: 'codicon-file-code' },
    'kt': { icon: 'file-code', color: colors.kotlin, className: 'codicon-file-code' },
    'scala': { icon: 'file-code', color: '#DC322F', className: 'codicon-file-code' },
    'cpp': { icon: 'file-code', color: '#00599C', className: 'codicon-file-code' },
    'cc': { icon: 'file-code', color: '#00599C', className: 'codicon-file-code' },
    'cxx': { icon: 'file-code', color: '#00599C', className: 'codicon-file-code' },
    'c': { icon: 'file-code', color: '#A8B9CC', className: 'codicon-file-code' },
    'h': { icon: 'file-code', color: '#A8B9CC', className: 'codicon-file-code' },
    'hpp': { icon: 'file-code', color: '#00599C', className: 'codicon-file-code' },
    'cs': { icon: 'file-code', color: colors.csharp, className: 'codicon-file-code' },
    'php': { icon: 'file-code', color: colors.php, className: 'codicon-file-code' },
    'rb': { icon: 'file-code', color: colors.ruby, className: 'codicon-file-code' },
    'go': { icon: 'file-code', color: colors.go, className: 'codicon-file-code' },
    'rs': { icon: 'file-code', color: colors.rust, className: 'codicon-file-code' },
    'swift': { icon: 'file-code', color: colors.swift, className: 'codicon-file-code' },
    'dart': { icon: 'file-code', color: colors.dart, className: 'codicon-file-code' },
    'r': { icon: 'file-code', color: '#276DC3', className: 'codicon-file-code' },
    'matlab': { icon: 'file-code', color: '#FF6600', className: 'codicon-file-code' },
    'm': { icon: 'file-code', color: '#FF6600', className: 'codicon-file-code' },
    'pl': { icon: 'file-code', color: '#39457E', className: 'codicon-file-code' },
    'lua': { icon: 'file-code', color: '#000080', className: 'codicon-file-code' },
    'hs': { icon: 'file-code', color: '#5D4F85', className: 'codicon-file-code' },
    'elm': { icon: 'file-code', color: '#60B5CC', className: 'codicon-file-code' },
    'clj': { icon: 'file-code', color: '#5881D8', className: 'codicon-file-code' },
    'cljs': { icon: 'file-code', color: '#5881D8', className: 'codicon-file-code' },
    
    // Web Technologies
    'html': { icon: 'file-code', color: colors.html, className: 'codicon-file-code' },
    'htm': { icon: 'file-code', color: colors.html, className: 'codicon-file-code' },
    'css': { icon: 'file-code', color: colors.css, className: 'codicon-file-code' },
    'scss': { icon: 'file-code', color: colors.scss, className: 'codicon-file-code' },
    'sass': { icon: 'file-code', color: colors.scss, className: 'codicon-file-code' },
    'less': { icon: 'file-code', color: '#1D365D', className: 'codicon-file-code' },
    'styl': { icon: 'file-code', color: '#FF6347', className: 'codicon-file-code' },
    
    // Data & Config
    'json': { icon: 'json', color: colors.json, className: 'codicon-json' },
    'xml': { icon: 'file-code', color: colors.xml, className: 'codicon-file-code' },
    'yaml': { icon: 'file-code', color: colors.yaml, className: 'codicon-file-code' },
    'yml': { icon: 'file-code', color: colors.yaml, className: 'codicon-file-code' },
    'toml': { icon: 'file-code', color: colors.toml, className: 'codicon-file-code' },
    'ini': { icon: 'settings-gear', color: colors.config, className: 'codicon-settings-gear' },
    'cfg': { icon: 'settings-gear', color: colors.config, className: 'codicon-settings-gear' },
    'conf': { icon: 'settings-gear', color: colors.config, className: 'codicon-settings-gear' },
    'properties': { icon: 'settings-gear', color: colors.config, className: 'codicon-settings-gear' },
    'csv': { icon: 'graph', color: '#10B981', className: 'codicon-graph' },
    'tsv': { icon: 'graph', color: '#10B981', className: 'codicon-graph' },
    
    // Database
    'sql': { icon: 'database', color: colors.sql, className: 'codicon-database' },
    'sqlite': { icon: 'database', color: colors.sql, className: 'codicon-database' },
    'db': { icon: 'database', color: colors.sql, className: 'codicon-database' },
    
    // Documentation
    'md': { icon: 'markdown', color: colors.markdown, className: 'codicon-markdown' },
    'markdown': { icon: 'markdown', color: colors.markdown, className: 'codicon-markdown' },
    'rst': { icon: 'file-text', color: colors.text, className: 'codicon-file-text' },
    'tex': { icon: 'file-text', color: '#006600', className: 'codicon-file-text' },
    'pdf': { icon: 'file-pdf', color: '#FF0000', className: 'codicon-file-pdf' },
    'doc': { icon: 'file-text', color: '#2B579A', className: 'codicon-file-text' },
    'docx': { icon: 'file-text', color: '#2B579A', className: 'codicon-file-text' },
    'rtf': { icon: 'file-text', color: colors.text, className: 'codicon-file-text' },
    'txt': { icon: 'file-text', color: colors.text, className: 'codicon-file-text' },
    'log': { icon: 'file-text', color: colors.log, className: 'codicon-file-text' },
    
    // Shell & Scripts
    'sh': { icon: 'terminal', color: '#4EAA25', className: 'codicon-terminal' },
    'bash': { icon: 'terminal', color: '#4EAA25', className: 'codicon-terminal' },
    'zsh': { icon: 'terminal', color: '#4EAA25', className: 'codicon-terminal' },
    'fish': { icon: 'terminal', color: '#4EAA25', className: 'codicon-terminal' },
    'ps1': { icon: 'terminal', color: '#012456', className: 'codicon-terminal' },
    'bat': { icon: 'terminal', color: '#012456', className: 'codicon-terminal' },
    'cmd': { icon: 'terminal', color: '#012456', className: 'codicon-terminal' },
    
    // Images
    'png': { icon: 'file-media', color: colors.image, className: 'codicon-file-media' },
    'jpg': { icon: 'file-media', color: colors.image, className: 'codicon-file-media' },
    'jpeg': { icon: 'file-media', color: colors.image, className: 'codicon-file-media' },
    'gif': { icon: 'file-media', color: colors.image, className: 'codicon-file-media' },
    'svg': { icon: 'file-media', color: colors.image, className: 'codicon-file-media' },
    'webp': { icon: 'file-media', color: colors.image, className: 'codicon-file-media' },
    'ico': { icon: 'file-media', color: colors.image, className: 'codicon-file-media' },
    'bmp': { icon: 'file-media', color: colors.image, className: 'codicon-file-media' },
    'tiff': { icon: 'file-media', color: colors.image, className: 'codicon-file-media' },
    'tif': { icon: 'file-media', color: colors.image, className: 'codicon-file-media' },
    
    // Audio & Video
    'mp3': { icon: 'file-media', color: '#FF6B35', className: 'codicon-file-media' },
    'wav': { icon: 'file-media', color: '#FF6B35', className: 'codicon-file-media' },
    'flac': { icon: 'file-media', color: '#FF6B35', className: 'codicon-file-media' },
    'ogg': { icon: 'file-media', color: '#FF6B35', className: 'codicon-file-media' },
    'mp4': { icon: 'file-media', color: '#FF6B35', className: 'codicon-file-media' },
    'avi': { icon: 'file-media', color: '#FF6B35', className: 'codicon-file-media' },
    'mov': { icon: 'file-media', color: '#FF6B35', className: 'codicon-file-media' },
    'wmv': { icon: 'file-media', color: '#FF6B35', className: 'codicon-file-media' },
    'webm': { icon: 'file-media', color: '#FF6B35', className: 'codicon-file-media' },
    
    // Archives
    'zip': { icon: 'file-zip', color: colors.archive, className: 'codicon-file-zip' },
    'rar': { icon: 'file-zip', color: colors.archive, className: 'codicon-file-zip' },
    'tar': { icon: 'file-zip', color: colors.archive, className: 'codicon-file-zip' },
    'gz': { icon: 'file-zip', color: colors.archive, className: 'codicon-file-zip' },
    'gzip': { icon: 'file-zip', color: colors.archive, className: 'codicon-file-zip' },
    '7z': { icon: 'file-zip', color: colors.archive, className: 'codicon-file-zip' },
    'bz2': { icon: 'file-zip', color: colors.archive, className: 'codicon-file-zip' },
    'xz': { icon: 'file-zip', color: colors.archive, className: 'codicon-file-zip' },
    
    // Executables
    'exe': { icon: 'file-binary', color: colors.executable, className: 'codicon-file-binary' },
    'msi': { icon: 'file-binary', color: colors.executable, className: 'codicon-file-binary' },
    'deb': { icon: 'file-binary', color: colors.executable, className: 'codicon-file-binary' },
    'rpm': { icon: 'file-binary', color: colors.executable, className: 'codicon-file-binary' },
    'pkg': { icon: 'file-binary', color: colors.executable, className: 'codicon-file-binary' },
    'dmg': { icon: 'file-binary', color: colors.executable, className: 'codicon-file-binary' },
    'app': { icon: 'file-binary', color: colors.executable, className: 'codicon-file-binary' },
    'appimage': { icon: 'file-binary', color: colors.executable, className: 'codicon-file-binary' },
    
    // Fonts
    'ttf': { icon: 'symbol-color', color: '#6366F1', className: 'codicon-symbol-color' },
    'otf': { icon: 'symbol-color', color: '#6366F1', className: 'codicon-symbol-color' },
    'woff': { icon: 'symbol-color', color: '#6366F1', className: 'codicon-symbol-color' },
    'woff2': { icon: 'symbol-color', color: '#6366F1', className: 'codicon-symbol-color' },
    'eot': { icon: 'symbol-color', color: '#6366F1', className: 'codicon-symbol-color' },
  };

  // Return mapped icon or default
  return extensionMap[ext] || { 
    icon: 'file', 
    color: colors.file, 
    className: 'codicon-file' 
  };
};

export { getFileIconInfo };