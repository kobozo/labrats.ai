// Language detection for LSP and Monaco Editor support
// This maps file extensions and names to language identifiers

export interface LanguageInfo {
  id: string;
  name: string;
  extensions: string[];
  aliases: string[];
  mimeType?: string;
  supportsLSP: boolean;
}

const languages: LanguageInfo[] = [
  // Web Technologies
  {
    id: 'typescript',
    name: 'TypeScript',
    extensions: ['ts'],
    aliases: ['TypeScript', 'ts'],
    mimeType: 'text/typescript',
    supportsLSP: true
  },
  {
    id: 'typescriptreact',
    name: 'TypeScript React',
    extensions: ['tsx'],
    aliases: ['TypeScript React', 'TSX'],
    mimeType: 'text/typescript-jsx',
    supportsLSP: true
  },
  {
    id: 'javascript',
    name: 'JavaScript',
    extensions: ['js', 'mjs', 'cjs'],
    aliases: ['JavaScript', 'JS'],
    mimeType: 'text/javascript',
    supportsLSP: true
  },
  {
    id: 'javascriptreact',
    name: 'JavaScript React',
    extensions: ['jsx'],
    aliases: ['JavaScript React', 'JSX'],
    mimeType: 'text/javascript-jsx',
    supportsLSP: true
  },
  {
    id: 'html',
    name: 'HTML',
    extensions: ['html', 'htm'],
    aliases: ['HTML'],
    mimeType: 'text/html',
    supportsLSP: true
  },
  {
    id: 'css',
    name: 'CSS',
    extensions: ['css'],
    aliases: ['CSS'],
    mimeType: 'text/css',
    supportsLSP: true
  },
  {
    id: 'scss',
    name: 'SCSS',
    extensions: ['scss'],
    aliases: ['SCSS', 'Sass'],
    mimeType: 'text/x-scss',
    supportsLSP: true
  },
  {
    id: 'sass',
    name: 'Sass',
    extensions: ['sass'],
    aliases: ['Sass'],
    mimeType: 'text/x-sass',
    supportsLSP: true
  },
  {
    id: 'less',
    name: 'Less',
    extensions: ['less'],
    aliases: ['Less'],
    mimeType: 'text/x-less',
    supportsLSP: true
  },
  {
    id: 'vue',
    name: 'Vue.js',
    extensions: ['vue'],
    aliases: ['Vue'],
    mimeType: 'text/x-vue',
    supportsLSP: true
  },
  {
    id: 'svelte',
    name: 'Svelte',
    extensions: ['svelte'],
    aliases: ['Svelte'],
    mimeType: 'text/x-svelte',
    supportsLSP: true
  },
  
  // Backend Languages
  {
    id: 'python',
    name: 'Python',
    extensions: ['py', 'pyw', 'pyi'],
    aliases: ['Python'],
    mimeType: 'text/x-python',
    supportsLSP: true
  },
  {
    id: 'java',
    name: 'Java',
    extensions: ['java'],
    aliases: ['Java'],
    mimeType: 'text/x-java-source',
    supportsLSP: true
  },
  {
    id: 'kotlin',
    name: 'Kotlin',
    extensions: ['kt', 'kts'],
    aliases: ['Kotlin'],
    mimeType: 'text/x-kotlin',
    supportsLSP: true
  },
  {
    id: 'scala',
    name: 'Scala',
    extensions: ['scala', 'sc'],
    aliases: ['Scala'],
    mimeType: 'text/x-scala',
    supportsLSP: true
  },
  {
    id: 'cpp',
    name: 'C++',
    extensions: ['cpp', 'cc', 'cxx', 'c++'],
    aliases: ['C++', 'CPP'],
    mimeType: 'text/x-c++src',
    supportsLSP: true
  },
  {
    id: 'c',
    name: 'C',
    extensions: ['c'],
    aliases: ['C'],
    mimeType: 'text/x-csrc',
    supportsLSP: true
  },
  {
    id: 'csharp',
    name: 'C#',
    extensions: ['cs', 'csx'],
    aliases: ['C#', 'CSharp'],
    mimeType: 'text/x-csharp',
    supportsLSP: true
  },
  {
    id: 'php',
    name: 'PHP',
    extensions: ['php', 'phtml', 'php3', 'php4', 'php5'],
    aliases: ['PHP'],
    mimeType: 'application/x-httpd-php',
    supportsLSP: true
  },
  {
    id: 'ruby',
    name: 'Ruby',
    extensions: ['rb', 'rbw'],
    aliases: ['Ruby'],
    mimeType: 'text/x-ruby',
    supportsLSP: true
  },
  {
    id: 'go',
    name: 'Go',
    extensions: ['go'],
    aliases: ['Go', 'Golang'],
    mimeType: 'text/x-go',
    supportsLSP: true
  },
  {
    id: 'rust',
    name: 'Rust',
    extensions: ['rs'],
    aliases: ['Rust'],
    mimeType: 'text/x-rust',
    supportsLSP: true
  },
  {
    id: 'swift',
    name: 'Swift',
    extensions: ['swift'],
    aliases: ['Swift'],
    mimeType: 'text/x-swift',
    supportsLSP: true
  },
  {
    id: 'dart',
    name: 'Dart',
    extensions: ['dart'],
    aliases: ['Dart'],
    mimeType: 'text/x-dart',
    supportsLSP: true
  },
  {
    id: 'r',
    name: 'R',
    extensions: ['r', 'R'],
    aliases: ['R'],
    mimeType: 'text/x-r-source',
    supportsLSP: true
  },
  
  // Functional Languages
  {
    id: 'haskell',
    name: 'Haskell',
    extensions: ['hs', 'lhs'],
    aliases: ['Haskell'],
    mimeType: 'text/x-haskell',
    supportsLSP: true
  },
  {
    id: 'ocaml',
    name: 'OCaml',
    extensions: ['ml', 'mli'],
    aliases: ['OCaml'],
    mimeType: 'text/x-ocaml',
    supportsLSP: true
  },
  {
    id: 'fsharp',
    name: 'F#',
    extensions: ['fs', 'fsi', 'fsx'],
    aliases: ['F#', 'FSharp'],
    mimeType: 'text/x-fsharp',
    supportsLSP: true
  },
  {
    id: 'elm',
    name: 'Elm',
    extensions: ['elm'],
    aliases: ['Elm'],
    mimeType: 'text/x-elm',
    supportsLSP: true
  },
  {
    id: 'clojure',
    name: 'Clojure',
    extensions: ['clj', 'cljs', 'cljc'],
    aliases: ['Clojure'],
    mimeType: 'text/x-clojure',
    supportsLSP: true
  },
  
  // Data & Config
  {
    id: 'json',
    name: 'JSON',
    extensions: ['json', 'jsonc'],
    aliases: ['JSON'],
    mimeType: 'application/json',
    supportsLSP: true
  },
  {
    id: 'xml',
    name: 'XML',
    extensions: ['xml', 'xsl', 'xsd'],
    aliases: ['XML'],
    mimeType: 'application/xml',
    supportsLSP: true
  },
  {
    id: 'yaml',
    name: 'YAML',
    extensions: ['yaml', 'yml'],
    aliases: ['YAML'],
    mimeType: 'text/x-yaml',
    supportsLSP: true
  },
  {
    id: 'toml',
    name: 'TOML',
    extensions: ['toml'],
    aliases: ['TOML'],
    mimeType: 'text/x-toml',
    supportsLSP: true
  },
  {
    id: 'ini',
    name: 'INI',
    extensions: ['ini', 'cfg', 'conf'],
    aliases: ['INI', 'Config'],
    mimeType: 'text/x-ini',
    supportsLSP: false
  },
  
  // Database
  {
    id: 'sql',
    name: 'SQL',
    extensions: ['sql'],
    aliases: ['SQL'],
    mimeType: 'text/x-sql',
    supportsLSP: true
  },
  
  // Documentation
  {
    id: 'markdown',
    name: 'Markdown',
    extensions: ['md', 'markdown', 'mdown', 'mkd'],
    aliases: ['Markdown'],
    mimeType: 'text/x-markdown',
    supportsLSP: true
  },
  {
    id: 'restructuredtext',
    name: 'reStructuredText',
    extensions: ['rst'],
    aliases: ['reStructuredText', 'RST'],
    mimeType: 'text/x-rst',
    supportsLSP: false
  },
  {
    id: 'latex',
    name: 'LaTeX',
    extensions: ['tex', 'latex'],
    aliases: ['LaTeX', 'TeX'],
    mimeType: 'text/x-latex',
    supportsLSP: true
  },
  
  // Shell
  {
    id: 'shellscript',
    name: 'Shell Script',
    extensions: ['sh', 'bash', 'zsh', 'fish'],
    aliases: ['Shell', 'Bash'],
    mimeType: 'text/x-shellscript',
    supportsLSP: true
  },
  {
    id: 'powershell',
    name: 'PowerShell',
    extensions: ['ps1', 'psm1', 'psd1'],
    aliases: ['PowerShell'],
    mimeType: 'text/x-powershell',
    supportsLSP: true
  },
  {
    id: 'batch',
    name: 'Batch',
    extensions: ['bat', 'cmd'],
    aliases: ['Batch'],
    mimeType: 'text/x-bat',
    supportsLSP: false
  },
  
  // Other
  {
    id: 'dockerfile',
    name: 'Dockerfile',
    extensions: ['dockerfile'],
    aliases: ['Dockerfile', 'Docker'],
    mimeType: 'text/x-dockerfile',
    supportsLSP: true
  },
  {
    id: 'plaintext',
    name: 'Plain Text',
    extensions: ['txt', 'text'],
    aliases: ['Text', 'Plain Text'],
    mimeType: 'text/plain',
    supportsLSP: false
  }
];

// Create lookup maps for performance
const extensionToLanguage = new Map<string, LanguageInfo>();
const nameToLanguage = new Map<string, LanguageInfo>();

languages.forEach(lang => {
  lang.extensions.forEach(ext => {
    extensionToLanguage.set(ext.toLowerCase(), lang);
  });
  nameToLanguage.set(lang.name.toLowerCase(), lang);
  lang.aliases.forEach(alias => {
    nameToLanguage.set(alias.toLowerCase(), lang);
  });
});

export const getLanguageFromFileName = (fileName: string): string => {
  const info = getLanguageInfoFromFileName(fileName);
  return info.id;
};

export const getLanguageInfoFromFileName = (fileName: string): LanguageInfo => {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const baseName = fileName.toLowerCase();
  
  // Special cases by filename
  if (baseName === 'dockerfile' || baseName.startsWith('dockerfile.')) {
    return languages.find(l => l.id === 'dockerfile') || getDefaultLanguage();
  }
  
  if (baseName === 'makefile' || baseName === 'gnumakefile') {
    return {
      id: 'makefile',
      name: 'Makefile',
      extensions: ['makefile'],
      aliases: ['Make'],
      supportsLSP: false
    };
  }
  
  // Look up by extension
  const langInfo = extensionToLanguage.get(ext);
  if (langInfo) {
    return langInfo;
  }
  
  // Default to plain text
  return getDefaultLanguage();
};

export const getLanguageDisplayName = (fileName: string): string => {
  const info = getLanguageInfoFromFileName(fileName);
  return info.name;
};

export const supportsLSP = (fileName: string): boolean => {
  const info = getLanguageInfoFromFileName(fileName);
  return info.supportsLSP;
};

export const getAllLanguages = (): LanguageInfo[] => {
  return [...languages];
};

export const getLanguagesBySupport = (hasLSP: boolean): LanguageInfo[] => {
  return languages.filter(lang => lang.supportsLSP === hasLSP);
};

const getDefaultLanguage = (): LanguageInfo => {
  return languages.find(l => l.id === 'plaintext') || {
    id: 'plaintext',
    name: 'Plain Text',
    extensions: ['txt'],
    aliases: ['Text'],
    supportsLSP: false
  };
};