export interface Agent {
  id: string;
  name: string;
  title: string;
  icon: string;
  colorAccent: string;
}

export const agents: Agent[] = [
  {
    id: 'cortex',
    name: 'Cortex',
    title: 'Product Owner',
    icon: '🧠',
    colorAccent: '#4299e1', // light blue
  },
  {
    id: 'ziggy',
    name: 'Ziggy',
    title: 'Chaos Monkey',
    icon: '🐒',
    colorAccent: '#ed8936', // orange
  },
  {
    id: 'patchy',
    name: 'Patchy',
    title: 'Backend Developer',
    icon: '🔧',
    colorAccent: '#38a169', // dark green
  },
  {
    id: 'shiny',
    name: 'Shiny',
    title: 'Frontend Developer',
    icon: '🎨',
    colorAccent: '#ed64a6', // pink
  },
  {
    id: 'sniffy',
    name: 'Sniffy',
    title: 'Quality Engineer',
    icon: '🐁',
    colorAccent: '#9f7aea', // lavender
  },
  {
    id: 'trappy',
    name: 'Trappy',
    title: 'Security Auditor',
    icon: '🔒',
    colorAccent: '#4299e1', // steel blue
  },
  {
    id: 'scratchy',
    name: 'Scratchy',
    title: 'Contrarian Analyst',
    icon: '🤔',
    colorAccent: '#e53e3e', // red
  },
  {
    id: 'wheelie',
    name: 'Wheelie',
    title: 'Platform/DevOps',
    icon: '⚙️',
    colorAccent: '#38b2ac', // teal
  },
  {
    id: 'clawsy',
    name: 'Clawsy',
    title: 'Code Reviewer',
    icon: '🧐',
    colorAccent: '#9b2c2c', // burgundy
  },
  {
    id: 'nestor',
    name: 'Nestor',
    title: 'Architect',
    icon: '🏗',
    colorAccent: '#4c51bf', // navy
  },
  {
    id: 'quill',
    name: 'Quill',
    title: 'Document Writer',
    icon: '✍️',
    colorAccent: '#f7fafc', // cream
  },
]; 