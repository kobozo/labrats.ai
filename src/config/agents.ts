import cortexAvatar from '../renderer/assets/avatars/cortex.webp';
import ziggyAvatar from '../renderer/assets/avatars/ziggy.webp';
import patchyAvatar from '../renderer/assets/avatars/patchy.webp';
import shinyAvatar from '../renderer/assets/avatars/shiny.webp';
import sniffyAvatar from '../renderer/assets/avatars/sniffy.webp';
import trappyAvatar from '../renderer/assets/avatars/trappy.webp';
import scratchyAvatar from '../renderer/assets/avatars/scratchy.webp';
import wheelieAvatar from '../renderer/assets/avatars/wheelie.webp';
import clawsyAvatar from '../renderer/assets/avatars/clawsy.webp';
import nestorAvatar from '../renderer/assets/avatars/nestor.webp';
import quillAvatar from '../renderer/assets/avatars/quill.webp';

export interface Agent {
  id: string;
  name: string;
  title: string;
  icon: string;
  colorAccent: string;
  avatar: string;
}

export const agents: Agent[] = [
  {
    id: 'cortex',
    name: 'Cortex',
    title: 'Product Owner',
    icon: '🧠',
    colorAccent: '#4299e1', // light blue
    avatar: cortexAvatar,
  },
  {
    id: 'ziggy',
    name: 'Ziggy',
    title: 'Chaos Monkey',
    icon: '🐒',
    colorAccent: '#ed8936', // orange
    avatar: ziggyAvatar,
  },
  {
    id: 'patchy',
    name: 'Patchy',
    title: 'Backend Developer',
    icon: '🔧',
    colorAccent: '#38a169', // dark green
    avatar: patchyAvatar,
  },
  {
    id: 'shiny',
    name: 'Shiny',
    title: 'Frontend Developer',
    icon: '🎨',
    colorAccent: '#ed64a6', // pink
    avatar: shinyAvatar,
  },
  {
    id: 'sniffy',
    name: 'Sniffy',
    title: 'Quality Engineer',
    icon: '🐁',
    colorAccent: '#9f7aea', // lavender
    avatar: sniffyAvatar,
  },
  {
    id: 'trappy',
    name: 'Trappy',
    title: 'Security Auditor',
    icon: '🔒',
    colorAccent: '#4299e1', // steel blue
    avatar: trappyAvatar,
  },
  {
    id: 'scratchy',
    name: 'Scratchy',
    title: 'Contrarian Analyst',
    icon: '🤔',
    colorAccent: '#e53e3e', // red
    avatar: scratchyAvatar,
  },
  {
    id: 'wheelie',
    name: 'Wheelie',
    title: 'Platform/DevOps',
    icon: '⚙️',
    colorAccent: '#38b2ac', // teal
    avatar: wheelieAvatar,
  },
  {
    id: 'clawsy',
    name: 'Clawsy',
    title: 'Code Reviewer',
    icon: '🧐',
    colorAccent: '#9b2c2c', // burgundy
    avatar: clawsyAvatar,
  },
  {
    id: 'nestor',
    name: 'Nestor',
    title: 'Architect',
    icon: '🏗',
    colorAccent: '#4c51bf', // navy
    avatar: nestorAvatar,
  },
  {
    id: 'quill',
    name: 'Quill',
    title: 'Document Writer',
    icon: '✍️',
    colorAccent: '#f7fafc', // cream
    avatar: quillAvatar,
  },
]; 